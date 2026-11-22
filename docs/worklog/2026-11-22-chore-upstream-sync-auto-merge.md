# /upstream-sync 改为 AI 自主合并，只在高风险时停下

- 日期：2026-11-22
- 分支：main
- PR：
- 关键 commit：

## 背景

用户反馈：`/upstream-sync` 把上游代码拉下来后总是提示让人手动合并。根因有两处：P2.5 强制用户拍板后才合并；`make upstream-merge` 冲突时打印「解决后 git add 并 git commit」，agent 读到后把冲突交还给用户。用户要求改为由 AI 合并，只有遇到冲突且是重大变更、无法保证合并正确时才停下，并且停下时要给出合并建议。

同一改动同时落在 sub2api / codex2api / crs 三个号池仓库（crs 原本没有这个 skill，本次新建）。

## 变更

- `.claude/skills/upstream-sync/SKILL.md`：新增「停止条件」表（评估 / 解冲突 / 门禁三个阶段）和停下时的固定提问格式（位置 · 上游意图 · 我方意图 · 可选方案 · 推荐与理由 · 选错后果）；P2.5 改为 AI 自决，没命中停止条件就直接进 P3；P3 明确由 AI 解完全部冲突并提交，冲突多时并行 agent；P4 门禁失败由 AI 修；PR 正文加 AI 解冲突的取舍表；P6 发版命令从已停用的 `/release-standalone` 改为 `/release-tke`。
- `makefile` `upstream-merge`：冲突提示改为指向 skill P3，去掉暗示人工处理的措辞。
- `docs/tokenfunc/development.md` §4.6：流程描述同步。

## 验证

- `grep -rn "手动\|git add 并" .claude/skills/upstream-sync makefile docs/tokenfunc/development.md`：只剩 skill 头部「仅人工手动触发（/upstream-sync）」，指的是 skill 只能由人触发，保留。
- `make -n upstream-merge REF=x`：输出的是新提示文案。

## 遗留

- `docs/tokenfunc/development.md` §4 其他段落（发版一节）仍写 `/release-standalone`，生产已迁 TKE，需要另开改动整理。
- 合进 `main` 仍需用户明确同意（不变）。
