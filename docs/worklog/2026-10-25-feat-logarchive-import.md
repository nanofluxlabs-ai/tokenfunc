# COS 归档回放导入工具 `cmd/logarchive-import`

- 日期：2026-10-25
- 分支：feat/logarchive-import
- PR：
- 关键 commit：

## 背景

PR #35 把 90 天外的 logs 归档到 COS 后删除，只剩清单页能下载 csv.gz；查某条历史明细要手工解压导表。黑鹰拍板：做回放工具，导入独立回放表而不是回灌 `logs`，理由见 PR 讨论：不碰归档任务状态机、不污染用量日志页与各类按 `created_at` 扫 logs 的统计、重复导入可按天替换。tokensolo 的 `cmd/logarchive-import` 同样导到独立表。

## 变更

- `pkg/objectstore`：`Head` 返回对象元数据（取上传时写入的 `sha256`），新增 `List(prefix)`。
- 新增 `cmd/logarchive-import`（独立 main 包，不进镜像）：
  - 参数 `-day` / `-from -to` / `-table`（默认 `tf_logs_archive`）/ `-truncate` / `-verify-only` / `-env`；连接走 `SQL_DSN`（主库读清单）、`LOG_SQL_DSN`（日志库，缺省同主库）、`LOG_ARCHIVE_S3_*`，默认加载 `.env`。
  - 每天：读清单 → `pending` 不导、`parts=0` 跳过 → 按 `model.LogArchiveObjectKey` 逐分片下载到临时文件并算 sha256，与对象元数据比对、最后一个分片还与清单比对 → 一个事务里删掉回放表该上海日的行、逐分片 `COPY ... FROM STDIN (FORMAT csv)` → 行数与清单 `total_rows` 不符打 WARNING。
  - 回放表 `CREATE TABLE IF NOT EXISTS ... (LIKE logs INCLUDING DEFAULTS)` + `created_at` 索引；列清单取归档表头，归档时少的列按默认值补齐，多出的列直接报错（表结构不兼容）。
  - 归档写出时 NULL 与空串都是空字段：导入对 logs 的字符串类型列加 `FORCE_NOT_NULL`，空值回成空串；其余类型回成 NULL。
- `makefile`：`make logarchive-import ARGS='-day …'`（dev 库）；`docs/tokenfunc/development.md` §5 补回放说明。
- 不改任何在线读路径：财务中心若要读回放表，把 `financeLogFromSQL` 的表名参数化即可，按需再做。

## 验证

- `make test-db PKG='-count=1 ./cmd/...'`：`TestImportDayRoundTrip` 用主服务的 `service.WriteLogsArchiveCSV` 生成归档再导回，断言行数与清单一致、原 id 保留、字符串列空值为空串、重复导入不翻倍、`-verify-only` 不写库、清单 sha256 不符时报错且不落库、无清单 / pending 的天拒导；`TestResolveDays` 覆盖区间展开与起止颠倒。
- `GOWORK=off go build ./...`、`go vet ./cmd/... ./pkg/objectstore/` 通过。
- 未对真实 COS 跑：生产还没产生过归档对象；dev 库 `DB_LOG_RETENTION_DAYS=0` 也没有。首次真实归档后用 `-verify-only` 过一遍即可。

## 遗留

- 没做 `-list` / `-get` / `-delete-prefix` 这类对象运维子命令，需要时再加。
- 账单账期包（PR-4）落地后，补 `-bill` 导入 `raw-logs.csv.gz`。
