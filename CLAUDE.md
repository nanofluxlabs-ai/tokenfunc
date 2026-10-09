# CLAUDE.md — Project Conventions for new-api

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
