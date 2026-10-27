// tokenfunc-seed-demo：给本地 dev schema 灌一套「看起来饱满」的示例数据（个人用户、授信 / 预付企业、
// 账期账单、推广人、试用线索、审计），覆盖最近约 4 个自然月，今天的数据截止到当前时刻。
//
// 用法（连接信息走 env，默认加载当前目录 .env；推荐 make seed-demo，它会注入当前 checkout 的 dev schema）：
//
//	go run ./cmd/tokenfunc-seed-demo -yes
//
// 只写示例数据：账号用户名以 demo_ 开头、渠道名以 demo- 开头、线索联系方式以 @demo.tokenfunc.local 结尾。
// 每次执行先清掉上一次的示例数据再重灌，已有的真实数据不动。随机数种子固定，重跑形态一致，日期跟着「今天」走。
// 安全闸：SQL_DSN 必须指向本机，search_path 必须是 dev 或 dev_*（worktree 的 dev schema）。
package main

import (
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/joho/godotenv"
)

func main() {
	confirmed := flag.Bool("yes", false, "确认写入（不带此参数只做安全检查）")
	envFile := flag.String("env", ".env", "环境变量文件；不存在时忽略")
	seed := flag.Uint64("seed", 20261027, "随机数种子")
	flag.Parse()

	_ = godotenv.Load(*envFile)
	fail(checkTargetDSN(os.Getenv("SQL_DSN")))
	if dsn := os.Getenv("LOG_SQL_DSN"); dsn != "" {
		fail(checkTargetDSN(dsn))
	}
	if redisURL := os.Getenv("REDIS_CONN_STRING"); redisURL != "" {
		fail(checkLocalHost(redisURL))
	}
	if !*confirmed {
		fmt.Println("安全检查通过；加 -yes 才会写入示例数据")
		return
	}

	common.InitEnv()
	ratio_setting.InitRatioSettings()
	fail(model.InitDB())
	model.InitOptionMap()
	fail(model.InitLogDB())
	fail(common.InitRedisClient())

	started := time.Now()
	s := newSeeder(*seed, time.Now())
	fail(s.run())
	fmt.Printf("\n完成，用时 %s。重启 API（make api）让进程内缓存失效后即可查看。\n", time.Since(started).Round(time.Second))
	s.printAccounts()
}

// checkTargetDSN 只允许写本机 PostgreSQL 的 dev / dev_* schema，防止误连共享库或生产库
func checkTargetDSN(dsn string) error {
	if dsn == "" {
		return errors.New("SQL_DSN is not set")
	}
	parsed, err := url.Parse(dsn)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return errors.New("SQL_DSN must be a postgres:// URL")
	}
	if err := checkLocalHost(dsn); err != nil {
		return err
	}
	schema := parsed.Query().Get("search_path")
	if schema != "dev" && !strings.HasPrefix(schema, "dev_") {
		return fmt.Errorf("refusing to seed schema %q: only dev or dev_* is allowed", schema)
	}
	return nil
}

func checkLocalHost(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	switch parsed.Hostname() {
	case "127.0.0.1", "localhost", "::1":
		return nil
	}
	return fmt.Errorf("refusing to seed a non-local host %q", parsed.Hostname())
}

func fail(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "seed-demo:", err)
		os.Exit(1)
	}
}
