# worktree 并行开发：每个 worktree 一套隔离环境（schema / Redis db / 端口）

- 日期：2026-10-25
- 分支：worktree-feat-worktree-env
- PR：
- 关键 commit：

## 背景

当天两个会话共用一个 checkout 并行开发，撞了 `index.lock`、`git stash` 互踩、promoter 提交落到了 `feat/user-list-email` 分支。用户决定：每次代码变更前先选 worktree / 新建分支 / 直接 main；选 worktree 时必须整套环境隔离，能独立 `make dev` 与 `make test-db`，PG schema 与 Redis db 按 worktree 命名分配，端口不冲突。

## 变更

- `scripts/tokenfunc/worktree-env.sh`（新）：slot 注册表（主 checkout `.tmp/worktree-slots.tsv`，`mkdir` 锁），`init` 领最小空闲 slot（端口被无关进程占用的 slot 跳过）、以主 checkout `.env` 为底生成本 worktree `.env`（`TF_DEV_SCHEMA=dev_<slug>`、`TF_TEST_SCHEMA=test_<slug>`、Redis db 2N/2N+1、端口 3000+N/5173+N）、起库建 schema、`bun install`、打印环境卡；`clean` 停 API、`DROP SCHEMA`、`FLUSHDB`、释放 slot；`list` 标孤儿；`env` 打印参数。
- `makefile`：新增 `wt-init` / `wt-clean` / `wt-list` / `wt-env`；`COMPOSE` 固定以主 checkout 为项目目录（worktree 里 bind mount 相对路径不同会让 compose 重建容器）；`db-schemas` 把 `TF_DEV_SCHEMA` / `TF_TEST_SCHEMA` 一并建上；`web` 显式传 `VITE_REACT_APP_SERVER_URL`（此前 rsbuild 写死 3000，改端口前端仍打主 checkout 的 API）；`api` 的 `NODE_NAME` 带 worktree 名。
- `compose.yml`：redis `--databases 64`（默认 16 个只够 7 个 worktree）。
- `CLAUDE.md`：变更前三选一（AskUserQuestion）强制规则；worktree 路径必须 `wt-init` / `wt-clean`。
- `docs/tokenfunc/development.md`：§1 / §3 / §4.1 补充，新增 §4.7 worktree 并行开发。

## 验证

本次改动本身在 worktree `feat-worktree-env` 里完成，流程走了一遍：

- `make wt-init`：首次领到 slot 1；`.env` 尾部生成隔离块，被接管的 6 个键在文件里各只出现一次；`make -pn` 看到 `TF_DEV_SCHEMA=dev_feat_worktree_env`、`TF_API_PORT=3001` 等；PG 里出现 `dev_feat_worktree_env` / `test_feat_worktree_env`；`make wt-list` / `wt-env` 输出正确。
- 发现 3001 被另一个项目的 vite 占着（Go API 只拿到 IPv6，curl 404），给 `alloc_slot` 加端口占用检测；`make wt-clean`（schema 删除、redis 2/3 清空、slot 释放）后重跑 `wt-init`，提示「slot 1 端口已被占用，跳过」，领到 slot 2。
- 发现 worktree 里 `make infra` 会 Recreate postgres / redis（bind mount 路径变了）；`COMPOSE` 改为固定主 checkout 后再跑 `make infra` 显示 `Running`，容器未重建。
- `make api`：`API 已就绪: http://127.0.0.1:3002`，日志 runner 名 `tokenfunc-dev-feat-worktree-env-*`；`dev` 与 `dev_feat_worktree_env` 各 58 张表互不影响；redis db 4 有键。
- `make test-db PKG='./model/ -run TestEnterprise -count=1'`：`ok`，`make -n` 确认 DSN `search_path=test_feat_worktree_env,public`、redis `/5`。
- `make web` 临时起在 5175，`curl localhost:5175/api/status` 返回 API JSON，对应请求出现在 3002 的 API 日志里。
- 注：主 checkout 的 `compose.yml` 合并前仍是默认 16 个 db，`CONFIG GET databases` 现为 16；合并后在主 checkout 执行一次 `make infra` 让 redis 以 64 重建（数据卷保留）。

## 遗留

- Claude Code 的 `WorktreeCreate` / `WorktreeRemove` hook 只对非 git 仓库生效，`EnterWorktree` / `ExitWorktree` 不触发，所以 `wt-init` / `wt-clean` 靠 CLAUDE.md 约定 + `wt-list` 孤儿检测兜底，没有自动化。
- `make up*` / `make reset` 在 worktree 里会作用于主 checkout 的 compose 项目目录（源码也是主 checkout 的），文档已注明只在主 checkout 执行，未加硬拦截。
