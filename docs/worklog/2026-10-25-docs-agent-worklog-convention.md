# 建立 AI Coding Agent 工作日志规范

- 日期：2026-10-25
- 分支：docs/agent-worklog-convention
- PR：
- 关键 commit：de2dd12fc

## 背景

AI Coding Agent 的每次变更需要留下可追溯的记录（为什么改、根因、验证、遗留），git log 和 PR 只记录了“改了什么”，回溯时信息不足。

## 变更

- `AGENTS.md` 末尾新增 `## TokenFunc Worklog` 小节：规定每个有代码改动的分支 / PR 必须附一份日志，命名为 `docs/worklog/YYYY-MM-DD-<type>-<slug>.md`，一次变更一个文件。
- `AGENTS.md` 中“禁止在 docs/ 新增文件”的规则增加 `docs/worklog/` 例外。
- 新增 `docs/worklog/TEMPLATE.md` 日志模板。

## 验证

`git diff AGENTS.md` 确认只改了第 158 行，并在文件末尾追加了一个小节，未改动其它上游内容。

## 遗留

AGENTS.md 是上游文件，同步上游时需要保留末尾的 TokenFunc 小节和第 158 行的例外说明。
