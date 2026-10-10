# CLAUDE.md — Project Conventions for tokenfunc (new-api 二开)

## MANDATORY: Read AGENTS.md with the Read tool

Do not treat `@AGENTS.md` as loaded. Claude Code does not reliably inline that import.

Before any planning, coding, reviewing, or answering a project question, you MUST call the Read tool on the repo-root file `AGENTS.md` and wait for the full contents. This is the first action of every session and every new task.

Rules:

- Do not start from memory, summaries, or this file alone.
- Do not skip the Read because a previous turn mentioned AGENTS.md.
- Do not replace the Read with a grep, glob, or partial skim.
- After reading, follow every rule in `AGENTS.md` for the rest of the work.
- If the task touches `web/`, also Read `web/AGENTS.md` before editing frontend files.
- If the task touches billing as defined under **Billing rules (mandatory read gate)** in `AGENTS.md`, also Read `.agents/rules/billing.md` in full before planning or editing. Tasks outside that definition may skip it.

## TokenFunc 二开约定

- 二开代码（`enterprise_*`、`ent_*` 表、`features/enterprise*`、`features/quotes` 等）只支持 PostgreSQL，可使用 jsonb、`ON CONFLICT`、部分唯一索引；上游代码保持原样，不要为二开代码补 SQLite/MySQL 兼容。
- 二开相关的 Go 测试通过 `TEST_POSTGRES_DSN` 跑在真实 PG 上（未设置时自动跳过），不要改成 sqlite。
- 设计基线见 `docs/tokenfunc/enterprise-design.md`。
- 本地环境只通过 `make` 管理（`make dev` / `make test-db` / `make up-build`），PostgreSQL 与 Redis 各一个 docker 实例、开发与测试共用：PG 用 schema（dev / test）隔离，Redis 用 db（0 / 1）隔离。不要手工 `docker run` 起库，也不要新增第二套 compose 文件；约定全文见 `docs/tokenfunc/development.md`。
- 新增容器、镜像、数据卷、缓存键等命名一律以 `tokenfunc` 为前缀；上游内部标识（Go module 路径、`NewAPIError`、`ChannelTypeNewAPI`、`New-Api-User` 请求头、Redis 命名空间）保持原样以减少合并冲突。
