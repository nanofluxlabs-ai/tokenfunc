# 清理文档与代码里的第三方品牌名，加品牌门禁

- 日期：2026-11-22
- 分支：main
- PR：
- 关键 commit：

## 背景

黑鹰定的红线：tokenfunc 各仓库的文档和代码里不能出现另一个自家品牌的名字，与对方仓库不得出现 tokenfunc 信息互为镜像。红线和门禁正则写在工作区根 `AGENTS.md`（品牌隔离红线），是全工作区唯一允许点名的地方。git tag 名、remote 路径不算，已 push 的历史不改写。

## 变更

- 文档：`docs/tokenfunc/channel-groups.md`（去掉对方内部分组名，Phase 2 表最后一列改为「备注」）、`enterprise-design.md`、`development.md`、一份发布报告和 24 条 worklog，把对方品牌换成「参考产品」「历史实测」「另一套部署」等中性说法，对方的内部标识（分组名、接口路径、字段名）一并删掉。
- 代码：只改注释和 `.env.example` 说明，共 7 处（`common/log_json.go`、`logger/events.go`、`service/channel_health.go`、`service/channel_usage_backfill.go`、`orders-filter-bar.tsx`、`tke-local-image.sh`），不改逻辑。
- `.claude/skills/upstream-sync/SKILL.md`：P3 与 P4 加品牌门禁，正则从根 `AGENTS.md` 的 `BRAND_GUARD_RE` 读取，skill 本身不写品牌名。

## 验证

- `git grep -n -i -E "$(sed -n 's/^ *BRAND_GUARD_RE=//p' ../AGENTS.md)"`：无命中；`git ls-files` 中也没有带品牌名的文件。
- `go build ./...` 通过；`go vet ./common/... ./logger/... ./service/...` 通过；`cd web && bun run typecheck` 通过。

## 遗留

- `common/log_json.go` import 块多一个空行（gofmt 报告），是原有问题，不在本次范围。
