// logarchive-import 的导入逻辑：按天从对象存储取归档分片，校验 sha256 后 COPY 进独立回放表。
// 与主服务共用 model 包里的对象 key 规则、清单表与上海日界，不回灌 logs。
package main

import (
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/objectstore"

	"github.com/jackc/pgx/v5"
)

// archiveReader 导入需要的对象存储能力；测试用内存实现替换
type archiveReader interface {
	Key(parts ...string) string
	Head(ctx context.Context, key string) (objectstore.ObjectInfo, error)
	Get(ctx context.Context, key string) (io.ReadCloser, error)
}

// importer 一次运行的依赖：主库连接读清单，日志库连接写回放表（回放表 LIKE logs，必须与 logs 同库）
type importer struct {
	store      archiveReader
	mainConn   *pgx.Conn
	logConn    *pgx.Conn
	table      string
	verifyOnly bool
	out        io.Writer
}

// dayManifest 清单里导入要用的字段
type dayManifest struct {
	Status    string
	Parts     int
	TotalRows int64
	Sha256    string
	ObjectKey string
}

var errManifestMissing = errors.New("no archive manifest for this day")

// ensureTable 建回放表（LIKE logs INCLUDING DEFAULTS，无主键）与 created_at 索引；幂等
func (im *importer) ensureTable(ctx context.Context) error {
	ident := pgx.Identifier{im.table}.Sanitize()
	if _, err := im.logConn.Exec(ctx, fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (LIKE logs INCLUDING DEFAULTS)", ident)); err != nil {
		return fmt.Errorf("create %s: %w", im.table, err)
	}
	index := pgx.Identifier{"idx_" + im.table + "_created_at"}.Sanitize()
	if _, err := im.logConn.Exec(ctx, fmt.Sprintf("CREATE INDEX IF NOT EXISTS %s ON %s (created_at)", index, ident)); err != nil {
		return fmt.Errorf("create index on %s: %w", im.table, err)
	}
	return nil
}

func (im *importer) truncate(ctx context.Context) error {
	_, err := im.logConn.Exec(ctx, "TRUNCATE "+pgx.Identifier{im.table}.Sanitize())
	return err
}

func (im *importer) readManifest(ctx context.Context, day string) (dayManifest, error) {
	var m dayManifest
	row := im.mainConn.QueryRow(ctx, "SELECT status, parts, total_rows, sha256, object_key FROM "+pgx.Identifier{model.LogArchiveManifest{}.TableName()}.Sanitize()+" WHERE day = $1", day)
	if err := row.Scan(&m.Status, &m.Parts, &m.TotalRows, &m.Sha256, &m.ObjectKey); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return m, errManifestMissing
		}
		return m, err
	}
	return m, nil
}

// importDay 导入一天：校验每个分片的 sha256（对象元数据；最后一个分片还要等于清单值），再在一个事务里删掉回放表里该天的行并 COPY 全部分片。
// 返回导入行数。pending 状态的天对象未必完整，直接报错不导。
func (im *importer) importDay(ctx context.Context, day string) (int64, error) {
	r, err := model.ParseFinanceDayRange(day, day)
	if err != nil {
		return 0, err
	}
	manifest, err := im.readManifest(ctx, day)
	if err != nil {
		return 0, err
	}
	if manifest.Status == model.LogArchiveStatusPending {
		return 0, fmt.Errorf("manifest status is pending, archive object may be incomplete")
	}
	if manifest.Parts == 0 || manifest.TotalRows == 0 {
		fmt.Fprintf(im.out, "%s: nothing archived (status=%s)\n", day, manifest.Status)
		return 0, nil
	}
	files := make([]*os.File, 0, manifest.Parts)
	defer func() {
		for _, f := range files {
			_ = f.Close()
			_ = os.Remove(f.Name())
		}
	}()
	for part := 1; part <= manifest.Parts; part++ {
		key := im.store.Key(model.LogArchiveObjectKey(day, part)...)
		file, sum, err := im.download(ctx, key)
		if err != nil {
			return 0, err
		}
		files = append(files, file)
		if part == manifest.Parts && manifest.Sha256 != "" && manifest.Sha256 != sum {
			return 0, fmt.Errorf("%s: sha256 %s != manifest %s", key, sum, manifest.Sha256)
		}
		fmt.Fprintf(im.out, "%s: verified %s\n", day, key)
	}
	if im.verifyOnly {
		return 0, nil
	}
	textColumns, err := im.stringColumns(ctx)
	if err != nil {
		return 0, err
	}
	tx, err := im.logConn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	ident := pgx.Identifier{im.table}.Sanitize()
	if _, err := tx.Exec(ctx, fmt.Sprintf("DELETE FROM %s WHERE created_at >= $1 AND created_at < $2", ident), r.Start, r.EndExcl); err != nil {
		return 0, err
	}
	var imported int64
	for _, file := range files {
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return 0, err
		}
		n, err := copyCSVGz(ctx, tx.Conn(), ident, file, textColumns)
		if err != nil {
			return 0, err
		}
		imported += n
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	if imported != manifest.TotalRows {
		fmt.Fprintf(im.out, "%s: WARNING imported %d rows but manifest says %d\n", day, imported, manifest.TotalRows)
	}
	return imported, nil
}

// importBill 导入某账单账期包的 raw-logs.csv.gz：校验 sha256 后，在一个事务里删掉回放表里该企业主账号本账期的行并 COPY
func (im *importer) importBill(ctx context.Context, billNo string) (int64, error) {
	var (
		userId                 int
		periodStart, periodEnd int64
		archivedAt             int64
		archiveInfo            []byte
	)
	row := im.mainConn.QueryRow(ctx, `SELECT e.user_id, b.period_start, b.period_end, b.archived_at, COALESCE(b.archive_info::text, '')::bytea
		FROM ent_bills b JOIN enterprises e ON e.id = b.enterprise_id WHERE b.bill_no = $1`, billNo)
	if err := row.Scan(&userId, &periodStart, &periodEnd, &archivedAt, &archiveInfo); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fmt.Errorf("bill %s not found", billNo)
		}
		return 0, err
	}
	bill := &model.EnterpriseBill{BillNo: billNo, ArchivedAt: archivedAt, ArchiveInfo: model.JSONValue(archiveInfo)}
	object, err := bill.ArchiveObject(model.BillArchiveFileRawLogs)
	if err != nil {
		return 0, fmt.Errorf("bill %s: %w", billNo, err)
	}
	file, sum, err := im.download(ctx, object.Key)
	if err != nil {
		return 0, err
	}
	defer func() {
		_ = file.Close()
		_ = os.Remove(file.Name())
	}()
	if object.Sha256 != "" && object.Sha256 != sum {
		return 0, fmt.Errorf("%s: sha256 %s != bill archive %s", object.Key, sum, object.Sha256)
	}
	fmt.Fprintf(im.out, "%s: verified %s\n", billNo, object.Key)
	if im.verifyOnly {
		return 0, nil
	}
	textColumns, err := im.stringColumns(ctx)
	if err != nil {
		return 0, err
	}
	tx, err := im.logConn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	ident := pgx.Identifier{im.table}.Sanitize()
	if _, err := tx.Exec(ctx, fmt.Sprintf("DELETE FROM %s WHERE user_id = $1 AND created_at >= $2 AND created_at < $3", ident), userId, periodStart, periodEnd); err != nil {
		return 0, err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return 0, err
	}
	imported, err := copyCSVGz(ctx, tx.Conn(), ident, file, textColumns)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	if imported != object.Rows {
		fmt.Fprintf(im.out, "%s: WARNING imported %d rows but bill archive says %d\n", billNo, imported, object.Rows)
	}
	return imported, nil
}

// download 把对象落临时文件并顺带算 sha256；对象元数据里有 sha256 时必须一致
func (im *importer) download(ctx context.Context, key string) (*os.File, string, error) {
	info, err := im.store.Head(ctx, key)
	if err != nil {
		return nil, "", err
	}
	body, err := im.store.Get(ctx, key)
	if err != nil {
		return nil, "", err
	}
	defer body.Close()
	file, err := os.CreateTemp("", "tokenfunc-logarchive-import-*.csv.gz")
	if err != nil {
		return nil, "", err
	}
	hasher := sha256.New()
	size, err := io.Copy(io.MultiWriter(file, hasher), body)
	if err != nil {
		_ = file.Close()
		_ = os.Remove(file.Name())
		return nil, "", err
	}
	sum := hex.EncodeToString(hasher.Sum(nil))
	if info.Size != 0 && info.Size != size {
		_ = file.Close()
		_ = os.Remove(file.Name())
		return nil, "", fmt.Errorf("%s: downloaded %d bytes, object size %d", key, size, info.Size)
	}
	if expected := info.Metadata["sha256"]; expected != "" && expected != sum {
		_ = file.Close()
		_ = os.Remove(file.Name())
		return nil, "", fmt.Errorf("%s: sha256 %s != object metadata %s", key, sum, expected)
	}
	return file, sum, nil
}

// stringColumns logs 表里字符串类型的列：归档写出时 NULL 与空串都是空字段，导入时字符串列一律按空串处理，其余类型按 NULL
func (im *importer) stringColumns(ctx context.Context) (map[string]bool, error) {
	rows, err := im.logConn.Query(ctx, `SELECT a.attname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
		WHERE a.attrelid = 'logs'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND t.typcategory = 'S'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		columns[name] = true
	}
	return columns, rows.Err()
}

// copyCSVGz 解压后读首行列名，剩余内容原样交给 COPY ... FROM STDIN (FORMAT csv)。
// 列清单取自归档表头：归档时比现在少的列按回放表默认值补齐；多出的列说明表结构已不兼容，直接报错。
func copyCSVGz(ctx context.Context, conn *pgx.Conn, tableIdent string, gzData io.Reader, textColumns map[string]bool) (int64, error) {
	gz, err := gzip.NewReader(gzData)
	if err != nil {
		return 0, err
	}
	defer gz.Close()
	reader := bufio.NewReaderSize(gz, 1<<20)
	headerLine, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return 0, err
	}
	headerLine = strings.TrimRight(headerLine, "\r\n")
	if headerLine == "" {
		return 0, nil
	}
	columns, err := csv.NewReader(strings.NewReader(headerLine)).Read()
	if err != nil {
		return 0, fmt.Errorf("parse archive header: %w", err)
	}
	quoted := make([]string, 0, len(columns))
	forceNotNull := make([]string, 0, len(columns))
	for _, column := range columns {
		quoted = append(quoted, pgx.Identifier{column}.Sanitize())
		if textColumns[column] {
			forceNotNull = append(forceNotNull, pgx.Identifier{column}.Sanitize())
		}
	}
	options := "FORMAT csv, HEADER false"
	if len(forceNotNull) > 0 {
		options += ", FORCE_NOT_NULL (" + strings.Join(forceNotNull, ", ") + ")"
	}
	sql := fmt.Sprintf("COPY %s (%s) FROM STDIN (%s)", tableIdent, strings.Join(quoted, ", "), options)
	tag, err := conn.PgConn().CopyFrom(ctx, reader, sql)
	if err != nil {
		return 0, fmt.Errorf("copy into %s: %w (archive columns: %s)", tableIdent, err, strings.Join(columns, ","))
	}
	return tag.RowsAffected(), nil
}
