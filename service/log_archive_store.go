package service

import (
	"compress/gzip"
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/objectstore"
)

// logs 归档文件：一天一个 .csv.gz（首行列名，全列），经临时文件 gzip 后上传对象存储，上传后核对大小与 MD5。

// LogArchiveSchemaVersion 归档文件格式版本（列集合或编码变化时递增，导入工具据此兼容）
const LogArchiveSchemaVersion = 1

var ErrLogArchiveStoreDisabled = errors.New("log archive object store is not configured (LOG_ARCHIVE_S3_*)")

// ArchiveObjectStore 归档需要的对象存储能力；测试用内存实现替换
type ArchiveObjectStore interface {
	Key(parts ...string) string
	Put(ctx context.Context, key string, body io.ReadSeeker, size int64, contentType string, metadata map[string]string) (string, error)
	Head(ctx context.Context, key string) (objectstore.ObjectInfo, error)
	Get(ctx context.Context, key string) (io.ReadCloser, error)
}

var (
	logArchiveStoreMu       sync.Mutex
	logArchiveStore         ArchiveObjectStore
	logArchiveStoreOverride bool
)

// LogArchiveStore 按环境变量构建对象存储客户端（进程内缓存）；未配置返回 ErrLogArchiveStoreDisabled
func LogArchiveStore() (ArchiveObjectStore, error) {
	logArchiveStoreMu.Lock()
	defer logArchiveStoreMu.Unlock()
	if logArchiveStoreOverride {
		if logArchiveStore == nil {
			return nil, ErrLogArchiveStoreDisabled
		}
		return logArchiveStore, nil
	}
	if logArchiveStore != nil {
		return logArchiveStore, nil
	}
	cfg := LogArchiveStoreConfig()
	if !cfg.Enabled() {
		return nil, ErrLogArchiveStoreDisabled
	}
	client, err := objectstore.New(cfg)
	if err != nil {
		return nil, err
	}
	logArchiveStore = client
	return client, nil
}

// LogArchiveStoreConfig 环境变量里的对象存储配置
func LogArchiveStoreConfig() objectstore.Config {
	return objectstore.Config{
		Endpoint: common.LogArchiveS3Endpoint, Region: common.LogArchiveS3Region, Bucket: common.LogArchiveS3Bucket,
		Prefix: common.LogArchiveS3Prefix, AccessKey: common.LogArchiveS3AccessKey, SecretKey: common.LogArchiveS3SecretKey,
		PathStyle: common.LogArchiveS3PathStyle,
	}
}

// setLogArchiveStoreForTest 测试替换对象存储（nil 表示模拟未配置）
func setLogArchiveStoreForTest(store ArchiveObjectStore) {
	logArchiveStoreMu.Lock()
	defer logArchiveStoreMu.Unlock()
	logArchiveStore, logArchiveStoreOverride = store, true
}

// resetLogArchiveStoreForTest 恢复按配置构建
func resetLogArchiveStoreForTest() {
	logArchiveStoreMu.Lock()
	defer logArchiveStoreMu.Unlock()
	logArchiveStore, logArchiveStoreOverride = nil, false
}

// archiveFile 归档文件写入器：内容经 gzip 落临时文件，同时累计压缩后字节数、sha256 与 md5
type archiveFile struct {
	file    *os.File
	gz      *gzip.Writer
	counter *countingWriter
	sha     hash.Hash
	md5     hash.Hash
	closed  bool
	size    int64
	shaHex  string
	md5Hex  string
}

type countingWriter struct {
	w io.Writer
	n int64
}

func (c *countingWriter) Write(p []byte) (int, error) {
	n, err := c.w.Write(p)
	c.n += int64(n)
	return n, err
}

func newArchiveFile() (*archiveFile, error) {
	file, err := os.CreateTemp("", "tokenfunc-log-archive-*.csv.gz")
	if err != nil {
		return nil, err
	}
	a := &archiveFile{file: file, sha: sha256.New(), md5: md5.New()}
	a.counter = &countingWriter{w: io.MultiWriter(file, a.sha, a.md5)}
	a.gz = gzip.NewWriter(a.counter)
	return a, nil
}

// Writer 明文写入口（内部 gzip）
func (a *archiveFile) Writer() io.Writer { return a.gz }

// Finish 封口 gzip 并刷盘，返回压缩后字节数、sha256、md5（十六进制）；可重复调用
func (a *archiveFile) Finish() (int64, string, string, error) {
	if a.closed {
		return a.size, a.shaHex, a.md5Hex, nil
	}
	if err := a.gz.Close(); err != nil {
		return 0, "", "", err
	}
	if err := a.file.Sync(); err != nil {
		return 0, "", "", err
	}
	a.closed = true
	a.size, a.shaHex, a.md5Hex = a.counter.n, hex.EncodeToString(a.sha.Sum(nil)), hex.EncodeToString(a.md5.Sum(nil))
	return a.size, a.shaHex, a.md5Hex, nil
}

func (a *archiveFile) Remove() {
	_ = a.file.Close()
	_ = os.Remove(a.file.Name())
}

// Upload 上传到 key 并核对：对象大小必须等于本地字节数；ETag 形如 MD5 时还必须与本地 md5 一致
func (a *archiveFile) Upload(ctx context.Context, store ArchiveObjectStore, key string, metadata map[string]string) error {
	size, sha, md5hex, err := a.Finish()
	if err != nil {
		return err
	}
	if metadata == nil {
		metadata = map[string]string{}
	}
	metadata["sha256"] = sha
	etag, err := store.Put(ctx, key, a.file, size, "application/gzip", metadata)
	if err != nil {
		return err
	}
	if objectstore.IsMD5ETag(etag) && etag != md5hex {
		return fmt.Errorf("archive upload %s: etag %s != local md5 %s", key, etag, md5hex)
	}
	info, err := store.Head(ctx, key)
	if err != nil {
		return err
	}
	if info.Size != size {
		return fmt.Errorf("archive upload %s: remote size %d != local %d", key, info.Size, size)
	}
	if objectstore.IsMD5ETag(info.ETag) && info.ETag != md5hex {
		return fmt.Errorf("archive upload %s: remote etag %s != local md5 %s", key, info.ETag, md5hex)
	}
	return nil
}

// WriteLogsArchiveCSV 把筛选命中的 logs 行按 (created_at, id) 升序写成 CSV（首行列名），返回行数 / id 区间 / quota 合计
func WriteLogsArchiveCSV(ctx context.Context, w io.Writer, filter model.LogArchiveFilter) (model.LogArchiveStats, error) {
	writer := csv.NewWriter(w)
	headerWritten := false
	stats, err := model.IterateLogArchiveRows(ctx, filter, 5000, func(columns []string, values []any) error {
		if !headerWritten {
			if err := writer.Write(columns); err != nil {
				return err
			}
			headerWritten = true
		}
		record := make([]string, len(values))
		for i, value := range values {
			record[i] = archiveCSVValue(value)
		}
		return writer.Write(record)
	})
	if err != nil {
		return stats, err
	}
	writer.Flush()
	return stats, writer.Error()
}

// archiveCSVValue driver 原生值 → CSV 文本；NULL 写空串，时间按 RFC3339
func archiveCSVValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case []byte:
		return string(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case int32:
		return strconv.FormatInt(int64(v), 10)
	case int:
		return strconv.Itoa(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	case time.Time:
		return v.UTC().Format(time.RFC3339)
	default:
		return fmt.Sprint(v)
	}
}
