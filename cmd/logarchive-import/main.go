// logarchive-import：把对象存储里的 logs 归档（logs/YYYY-MM-DD[.pN].csv.gz）导回独立回放表，供历史调查与分析。
// 不回灌 logs：回放表不参与归档任务、不影响用量日志页与统计，想导几天留几天。
//
// 用法（连接信息走 env，与主服务同名；默认加载当前目录 .env）：
//
//	go run ./cmd/logarchive-import -day 2026-07-01                 # 导一天（回放表里该天先删后插）
//	go run ./cmd/logarchive-import -from 2026-07-01 -to 2026-07-31 # 导一段
//	go run ./cmd/logarchive-import -day 2026-07-01 -verify-only    # 只下载校验 sha256，不写库
//	go run ./cmd/logarchive-import -truncate -day 2026-07-01       # 先清空回放表
//	go run ./cmd/logarchive-import -bill B-20260801-0003            # 导入某账单账期包里的 raw-logs.csv.gz
//
// 需要：SQL_DSN（主库，读 tf_log_archive_manifests）、LOG_SQL_DSN（日志库，缺省同 SQL_DSN；回放表与 logs 同库）、LOG_ARCHIVE_S3_*。
// 回放表 tf_logs_archive 按 `CREATE TABLE IF NOT EXISTS ... (LIKE logs INCLUDING DEFAULTS)` 建（无主键，有 created_at 索引）。
// 财务中心若要读回放表，把 financeLogFromSQL 的表名参数化即可；本工具不改任何在线读路径。
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/objectstore"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	day := flag.String("day", "", "要导入的上海日 YYYY-MM-DD")
	billNo := flag.String("bill", "", "账单号：导入该账单账期包的 raw-logs.csv.gz（企业主账号本账期全部日志）")
	from := flag.String("from", "", "起始上海日 YYYY-MM-DD（与 -to 连用）")
	to := flag.String("to", "", "结束上海日 YYYY-MM-DD（含）")
	table := flag.String("table", "tf_logs_archive", "回放表名（与 logs 同库）")
	truncate := flag.Bool("truncate", false, "导入前清空回放表")
	verifyOnly := flag.Bool("verify-only", false, "只下载并校验 sha256，不写库")
	envFile := flag.String("env", ".env", "环境变量文件；不存在时忽略")
	flag.Parse()

	var days []string
	if *billNo == "" {
		var err error
		days, err = resolveDays(*day, *from, *to)
		fail(err)
	}
	_ = godotenv.Load(*envFile)

	store, err := objectstore.New(objectstore.Config{
		Endpoint: os.Getenv("LOG_ARCHIVE_S3_ENDPOINT"), Region: os.Getenv("LOG_ARCHIVE_S3_REGION"), Bucket: os.Getenv("LOG_ARCHIVE_S3_BUCKET"),
		Prefix: os.Getenv("LOG_ARCHIVE_S3_PREFIX"), AccessKey: os.Getenv("LOG_ARCHIVE_S3_ACCESS_KEY"), SecretKey: os.Getenv("LOG_ARCHIVE_S3_SECRET_KEY"),
		PathStyle: os.Getenv("LOG_ARCHIVE_S3_PATH_STYLE") == "true",
	})
	fail(err)
	mainDSN := os.Getenv("SQL_DSN")
	if mainDSN == "" {
		fail(fmt.Errorf("SQL_DSN is not set"))
	}
	logDSN := os.Getenv("LOG_SQL_DSN")
	if logDSN == "" {
		logDSN = mainDSN
	}
	ctx := context.Background()
	mainConn, err := pgx.Connect(ctx, mainDSN)
	fail(err)
	defer mainConn.Close(ctx)
	logConn := mainConn
	if logDSN != mainDSN {
		logConn, err = pgx.Connect(ctx, logDSN)
		fail(err)
		defer logConn.Close(ctx)
	}

	im := &importer{store: store, mainConn: mainConn, logConn: logConn, table: *table, verifyOnly: *verifyOnly, out: os.Stdout}
	if !*verifyOnly {
		fail(im.ensureTable(ctx))
		if *truncate {
			fail(im.truncate(ctx))
			fmt.Println("truncated", *table)
		}
	}
	if *billNo != "" {
		n, err := im.importBill(ctx, *billNo)
		fail(err)
		if *verifyOnly {
			fmt.Printf("done: bill %s verified\n", *billNo)
		} else {
			fmt.Printf("done: %d rows imported into %s from bill %s\n", n, *table, *billNo)
		}
		return
	}
	var total int64
	failed := 0
	for _, d := range days {
		n, err := im.importDay(ctx, d)
		if err != nil {
			failed++
			fmt.Fprintf(os.Stderr, "%s: error: %v\n", d, err)
			continue
		}
		if !*verifyOnly {
			fmt.Printf("%s: %d rows\n", d, n)
		}
		total += n
	}
	if *verifyOnly {
		fmt.Printf("done: %d days verified, %d failed\n", len(days)-failed, failed)
	} else {
		fmt.Printf("done: %d rows imported into %s, %d days failed\n", total, *table, failed)
	}
	if failed > 0 {
		os.Exit(1)
	}
}

// resolveDays 把 -day 或 -from/-to 展开成上海日列表
func resolveDays(day string, from string, to string) ([]string, error) {
	if day != "" {
		if _, err := model.ParseFinanceDayRange(day, day); err != nil {
			return nil, err
		}
		return []string{day}, nil
	}
	if from == "" || to == "" {
		return nil, fmt.Errorf("need -day or both -from and -to")
	}
	if _, err := model.ParseFinanceDayRange(from, to); err != nil {
		return nil, err
	}
	start, _ := time.Parse("2006-01-02", from)
	end, _ := time.Parse("2006-01-02", to)
	days := make([]string, 0)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		days = append(days, d.Format("2006-01-02"))
	}
	return days, nil
}

func fail(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
