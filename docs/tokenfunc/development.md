# TokenFunc 开发协作约定

> 适用对象：所有参与 tokenfunc 开发的人和 AI 助手（AGENTS.md / CLAUDE.md 之外的环境与流程约定）
> 原则：一套 `compose.yml`、一个 `makefile`、一份 `.env`，开发 / 测试 / 生产只差变量

---

## 1. 环境拓扑

```
┌─────────────── 宿主机（开发） ───────────────┐   ┌──────────── docker（compose.yml）────────────┐
│ make api   → API 进程   :3000 (go build)      │   │ tokenfunc-postgres  127.0.0.1:55432          │
│ make web   → 前端 dev   :5173 (rsbuild)       │──▶│   schema dev    ← 宿主机 API                  │
│ make test-db → go test（TEST_POSTGRES_DSN）   │   │   schema test   ← Go 测试                     │
└───────────────────────────────────────────────┘   │   schema public ← 容器内 API / 生产            │
                                                    │ tokenfunc-redis     127.0.0.1:56379          │
┌──────── docker profile "app"（生产 / 联调） ──┐   │   db 0 ← 开发与生产    db 1 ← 测试             │
│ tokenfunc-api  :3000  镜像 tokenfunc-api:local│──▶│                                               │
│ （make up-build 从源码构建，生产用 GHCR 镜像）  │   └───────────────────────────────────────────────┘
└───────────────────────────────────────────────┘
```

| 环境 | API 运行方式 | PostgreSQL | Redis | 配置来源 |
|---|---|---|---|---|
| 开发 | 宿主机进程 `make api` | 同一实例，schema `dev` | 同一实例，db `0` | makefile 默认值 + `.env` |
| 测试 | `make test-db` 跑 Go 测试 | 同一实例，schema `test` | 同一实例，db `1` | makefile 自动注入 `TEST_POSTGRES_DSN` |
| 全栈联调 / 生产 | 容器 `tokenfunc-api`（profile `app`） | schema `public`（`TF_PG_SCHEMA`） | db `TF_REDIS_DB` | `.env`（生产必须改密码与密钥） |

隔离方式是 PostgreSQL schema（DSN 带 `?search_path=`）而不是多库，所以本地永远只有一个 PG 实例、一个 Redis 实例。测试 DSN 是 `search_path=test,public`：上游部分用例会用它新建临时库再连入，临时库里只有 `public`。

## 2. 一分钟上手

前置：Docker Desktop、Go 1.26、Bun 1.4。

```bash
git clone <repo> && cd tokenfunc
make dev          # 自动生成 .env → 起 postgres/redis → 编译并后台启动 API → 前台启动前端
```

打开 http://localhost:5173，首次进入初始化向导创建管理员。`Ctrl-C` 只停前端，API 用 `make api-stop`。

## 3. make 目标

`make help` 随时可看；常用的：

| 目标 | 作用 |
|---|---|
| `make dev` | 基础设施 + API + 前端一键启动 |
| `make api` / `make api-stop` / `make logs` | 重新编译并重启宿主机 API / 停止 / 看日志（`.tmp/logs/api.out`，宿主机为文本格式；容器默认 NDJSON，见下文「系统日志」） |
| `make web` | 前端 dev server |
| `make infra` / `make stop` / `make down` / `make reset` | 起库 / 停容器 / 删容器保留数据 / 连数据卷一起删（需确认） |
| `make psql [SCHEMA=test]` / `make redis-cli [DB=1]` | 进入数据库命令行 |
| `make test` | 不依赖数据库的 Go 测试，CI 调用 |
| `make test-db [PKG=./model/...]` | 需要 PG 的 Go 测试，跑在 `test` schema（固定 `-p 1` 串行，多包共用 schema） |
| `make test-web` | 前端 vitest |
| `make up-build` / `make up` / `make up-down` / `make up-logs` | 全栈 docker（从源码构建 / 用 `.env` 指定镜像 / 停 / 日志） |
| `make reset-setup` | 清掉初始化向导状态，重新走 setup |
| `make upstream-status` | 当前已合入的上游 rc 基线、落后 commit 数、可合的 rc 列表 |
| `make upstream-diff REF=v1.0.0-rc.N` | 生成同步评估清单到 `.tmp/upstream/<REF>.md`（冲突 / 高风险 / 二开热点重叠 / commit 表） |
| `make upstream-merge REF=v1.0.0-rc.N [BASE=main]` | 建 `sync/upstream-<REF>` 分支并合并该 rc，有冲突即停，不 push |

所有 `TF_*` 变量都可在 `.env` 或命令行覆盖，例如端口冲突时 `make dev TF_API_PORT=3100 TF_WEB_PORT=5174`。

### 3.1 系统日志（stdout / 文件）

进程日志与 tokensolo 对齐为 NDJSON（每行一个 JSON 对象），字段 `ts`（RFC3339 毫秒带时区）、`level`（info / warn / error / fatal）、`service`（固定 `tokenfunc`）、`request_id`、`msg`；访问日志 `type=access` 另带 `status` / `latency_ms` / `client_ip` / `method` / `path` / `route_tag` / `user_id`；中间件级事件（`auth_failed` / `distribute_failed` / `rate_limited` / `panic`）带 `event` 字段。GORM 与标准库 `log` 的输出收口为 `component=gorm` / `component=stdlog`。上 CLS 时用 JSON 提取模式、时间字段选 `ts`，tokensolo 的查询语句可直接复用。

| 变量 | 默认 | 说明 |
|---|---|---|
| `LOG_FORMAT` | `json` | `text` 保持上游文本格式（`make api` 固定用 text，便于本地阅读） |
| `LOG_DIR` | `--log-dir` 的值 | 覆盖日志目录；显式设为空串只输出 stdout（TKE 上交给 CLS 采集容器日志） |
| `LOG_MAX_SIZE_MB` / `LOG_MAX_BACKUPS` / `LOG_RETENTION_DAYS` | 64 / 32 / 7 | 文件滚动：活动文件 `tokenfunc.log`，备份 `tokenfunc-<时间戳>.log`，按大小切分、按天数清理 |
| `DEFAULT_LANGUAGE` | `zh-CN` | 服务端日志文案与未指定语言的请求提示 / 邮件 / 通知的语言（上游 rc.44 起），`TF_DEFAULT_LANGUAGE` 覆盖，可选 en / zh-CN / zh-TW |

容器内这几项由 `compose.yml` 透传 `TF_LOG_*`。

## 4. 协作约定

### 4.1 分支与提交
- `main` 只接受 PR，CI（`.github/workflows/ci.yml`：`make test` + 前端 typecheck/test）必须通过；推到 `main` 只构建 `main-<date>-<sha>` 镜像，**发版用 `/release-standalone` 打 `vYYYY.MM.DD.N` tag**，tag 才触发部署。
- 功能分支 `feat/<模块>`、修复分支 `fix/<问题>`；每个模块验证通过后立即 commit，提交信息用 Conventional Commits（`feat(landing): …`），正文中英文均可。
- 与上游 new-api 同步见 §4.6。

### 4.2 代码与测试
- 后端遵守 `AGENTS.md`；二开代码（`enterprise_*`、`ent_*`、`features/enterprise*` 等）只支持 PostgreSQL。
- 需要数据库的 Go 测试统一读 `TEST_POSTGRES_DSN`，未设置时 `t.Skip`；本地用 `make test-db`，不要在测试里写死连接串。
- 前端遵守 `web/AGENTS.md`；改动后至少跑受影响的测试、`bun run typecheck` 和涉及文件的 lint。
- 临时文件、截图、本地二进制一律放 `.tmp/`。

### 4.3 命名
- 新增的容器、镜像、数据卷、网络、日志文件、缓存键、Cookie、HTTP 头等对外可见标识一律以 `tokenfunc` 为前缀。
- 以下上游内部标识**保留原样**，以减少与上游合并的冲突：Go module 路径 `github.com/QuantumNous/new-api`、`NewAPIError` 等类型名、`ChannelTypeNewAPI`（指接入上游 new-api 的渠道类型）、`New-Api-User` 管理端请求头、Redis 命名空间 `new-api:*`、插件协议里的 `new_api` upstream 标识。
- 不新增 `docs/` 文档，除非明确要求；本文和 `enterprise-design.md` 是目前仅有的两份二开文档。

### 4.4 引入新技术 / 新依赖服务
新的基础设施（消息队列、对象存储、ClickHouse 等）按下面流程接入，不要另起 compose 文件或手工 `docker run`：
1. 在 `compose.yml` 增加 service：容器名 `tokenfunc-<name>`，端口只绑 `127.0.0.1`，端口号走 `TF_<NAME>_PORT` 变量，带 healthcheck；只在联调或生产需要时用 `profiles` 控制。
2. 在 `.env.example` 增加变量并给出开发默认值；在 `makefile` 的变量区补默认值，让 `make dev` 零配置可用。
3. 需要的话增加 make 目标（如 `make <name>-cli`），并把开发 / 测试隔离方式写进本文第 1 节的表格。
4. 应用侧按无状态设计（文件走对象存储、定时任务用 Redis 锁、会话走 Redis），为后续迁移 TKE 做准备。

### 4.5 与 AI 助手协作
- 助手每次会话先读 `AGENTS.md`、`CLAUDE.md`（含 `web/AGENTS.md`），再读本文的环境约定；需要库时只用 `make infra` / `make test-db`。
- 让助手验证功能时给它 `make api` 之后的 `http://127.0.0.1:3000`，不要让它自建数据库实例。

### 4.6 与上游 new-api 同步
- **节奏**：每 2 周或累积 2 个上游 rc 合一次；**只合 rc tag（`v1.0.0-rc.N`），不合 `upstream/main` HEAD**。拖得越久冲突越大，"少同步"不等于"更稳"。
- **例外通道**：安全修复、数据正确性 fix、生产踩到的 bug，单个 commit `git cherry-pick -x <sha>` 到 `fix/upstream-<sha>` 分支，走同样门禁，不等节奏。
- **流程**（由 `/upstream-sync` 驱动）：`make upstream-status` 选 rc → `make upstream-diff REF=` 出评估清单，逐条标 接受 / 回退 / 需适配 → **变更摘要（bugfix / feature / 影响面）+ 合入 / 只 cherry-pick / 跳过 的建议与理由，用户拍板后才建分支** → `make upstream-merge REF=` → **只解冲突不重构上游代码**，二开只支持 PG，不为上游补 SQLite/MySQL → 门禁 → PR，merge commit 固定 `merge(upstream): sync new-api <REF>` → 用户确认合并 → `/release-standalone` **独立发版**，发布报告注明"基于上游 <REF>"，不与二开功能混在同一版本。
- **门禁**：CI（`make test` + 前端 typecheck/test）、本地 `make test-db`、迁移幂等（`make up-build` 启动两次，日志无重复 `ALTER`）、二开关键路径冒烟（企业 / 授信 / 报价 / 财务导出 / 手工充值）。
- **减少冲突的结构约定**：二开内容放独立文件，上游文件只留一两行接线——翻译在 `web/src/i18n/locales/tokenfunc/` 与 `i18n/locales/tokenfunc.*.yaml`；品牌主题在 `web/src/lib/tokenfunc-theme.ts`、`web/src/lib/tokenfunc-site-theme.ts`、`web/src/styles/tokenfunc-theme.css`；二开全局变量在 `common/tokenfunc_constants.go`；服务端日志中文文案的覆盖在 `common/log_text.tokenfunc.zh-CN.json`。新增二开翻译 key 必须同时写进 `tokenfunc/en.json` 与 `tokenfunc/zh.json`，否则 `bun run i18n:sync` 会把孤立 key 挪进 `_extras`。
- 基线不另记文件：`make upstream-status` 用 `git describe` 从 merge-base 算出当前 rc。

## 5. 数据与重置

- 开发数据在 docker 卷 `tokenfunc_postgres-data` / `tokenfunc_redis-data`，`make down` 不会删除，`make reset` 才会。
- 只想重走初始化向导：`make reset-setup && make api`。
- 导入导出：`make psql` 进入后用 `\copy`，或 `docker compose exec postgres pg_dump -U tokenfunc -n dev tokenfunc > .tmp/dev.sql`。
- logs 归档回放：`DB_LOG_RETENTION_DAYS` 开启后 90 天外的原始 logs 只在 COS（`logs/YYYY-MM-DD[.pN].csv.gz`，清单在 `tf_log_archive_manifests` / 运维中心「日志归档」页）。要查历史明细用 `make logarchive-import ARGS='-day 2026-07-01'`（或 `-from/-to`、`-verify-only`、`-truncate`）导回独立回放表 `tf_logs_archive`（`LIKE logs`，与 logs 同库），再用 SQL 查；已出账账单的账期包（`bills/{bill_no}/statement.csv.gz` + `raw-logs.csv.gz`，账单详情页可下载）用 `-bill <账单号>` 导回原始日志；回放表不参与归档任务、不影响任何页面与统计。生产上用 `go run ./cmd/logarchive-import`，`SQL_DSN` / `LOG_SQL_DSN` / `LOG_ARCHIVE_S3_*` 与主服务同名。

## 6. 生产部署

1. 生产机 `/opt/tokenfunc` 放仓库的 `compose.yml` 与一份生产 `.env`：改掉 `TF_PG_PASSWORD`、`TF_REDIS_PASSWORD`、`TF_SESSION_SECRET`，设置 `TF_API_IMAGE=ghcr.io/<owner>/<repo>:<tag>`，HTTPS 下打开 `TF_SESSION_COOKIE_SECURE=true` 并填写 `TF_SESSION_COOKIE_TRUSTED_URL`。
2. `make up`（等价于 `docker compose --profile app up -d --wait`）。
3. 发版：在 Claude Code 里运行 `/release-standalone`（技能在 `.claude/skills/release-standalone/`）：预检 → 打 tag → `deploy-ghcr.yml` 构建镜像、推 GHCR、SSH 到生产机改写 `.env` 的 `TF_API_IMAGE` 并 `up -d --wait` → 冒烟 → 监控 → 报告写到 `docs/tokenfunc/releases/`。回滚 = 把 `TF_API_IMAGE` 改回上一 tag 再 `up -d --wait api`。
4. 生产机上与仓库无关的差异（接管旧数据卷、把 `postgres` 别名挂到别的项目网络上、钉旧版本镜像）写在同目录的 `compose.override.yml`，compose 会自动叠加，仓库里不放这个文件。当前生产机就是这样复用了老的 `tokenfun_pg_data` 卷。
5. 迁移到腾讯云 TKE：清单与脚本在 `deploy/k8s/`（主从两个 Deployment、ConfigMap / Secret、ingress、bootstrap / deploy 脚本），见该目录的 README。PG / Redis 走 PaaS，连接串放 Secret。
6. 单机 docker 的 API 固定 `NODE_TYPE=master`（compose 默认），上游定时任务与二开后台任务都在它上面跑；k8s 下 master 单副本、slave 多副本，Service 只指向 slave。
