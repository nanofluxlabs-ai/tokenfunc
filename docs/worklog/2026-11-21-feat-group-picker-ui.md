# 分组下拉去 key / 去描述 / 单行左对齐；企业自动分组按自己的渠道顺序

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

渠道分组改成 `【订阅】Claude 高质量号池` 这类全名后，黑鹰反馈：创建密钥的分组下拉每项左侧有空白（隐藏的选中勾占位）、第二行显示 key、信息太密；使用日志 / 渠道编辑 / 财务 / 用户等处把 `名称 (key)` 拼在一起也太挤；创建密钥希望默认选"自动分组"。排查发现生产基线 `UserUsableGroups` 没有 `auto`，所以前端看不到自动分组；而企业用户分组选 auto 时上游按全局 `AutoGroups` 取候选，与留空令牌按企业自己顺序的二开行为不一致，全局列表只放 `default` 时企业的 auto 令牌会报 "auto groups is not enabled"。

## 变更

- 后端 `service/group.go` `GetUserAutoGroup`：用户分组本身不是可选渠道分组（企业档位）时，候选改为 `ResolveUsingGroupCandidates(userGroup)` 过滤后的结果（= 分组定价页顺序），与留空令牌一致；个人（default）仍按全局 `AutoGroups`。影响请求路由、`GET /api/token/auto-groups`、`/api/pricing` 的 `auto_groups`。
- 前端
  - `features/keys/components/api-key-group-combobox.tsx`：列表项单行 `[名称 · 倍率徽章 · ✓]`，去掉左侧勾占位，勾只在选中项且在徽章之后；不再渲染 desc 第二行，desc 挂 `title`；触发按钮同样去 desc。密钥抽屉与企业控制台令牌抽屉的 desc 改为 key（只做 hover）。
  - 游乐场 `features/playground/api.ts`、`components/model-group-selector*`：desc 不再回退为 key；没描述只有倍率时副标题显示 `Ratio: x`。
  - `hooks/use-group-options.ts`：`userGroupOptionLabel` 只返回名称，新增 `userGroupOptionTitle`（key，与名称相同时为空）。
  - 共用组件：`components/ui/combobox-input.tsx`（LegacyComboboxInput）勾从左侧移到右侧、未选中不占位，选项支持 `title`；`components/ui/combobox.tsx`、`components/multi-select.tsx` 选项支持 `title`；`components/data-table/toolbar/faceted-filter.tsx` 的 `CommandItem` 补 `value` + `keywords`，去掉 key 后仍可按 key 搜索（顺手修了该文件 4 个既有 lint error，行为不变）。
  - 调用点改为名称 + `title=key`：使用日志筛选栏、用户抽屉、订阅抽屉、企业主账号分组、财务分组筛选、渠道新建 / 编辑抽屉（原手拼 `label (key)`）、用户表分组筛选；渠道列表弹层去掉名称后的灰色 key。
  - 用户分组管理页的 `<code>key</code>` 保留（配置页）。
- 文档 `docs/tokenfunc/channel-groups.md`：2.3 补 auto 可见性只由基线决定；3.1 / 3.2 补 auto 候选规则；新增 5.11 生产开启自动分组的三个 option 与"先发版再改配置"的顺序。

## 验证

- `make test-db PKG='-count=1 ./service/'` 通过；新增 `TestGetUserAutoGroupUsesEnterpriseOwnOrder`，临时关掉企业分支时失败于"企业：自己的顺序"，恢复后通过。
- 前端 `bun run typecheck` 无错；全量 `bun run test`：377 个文件 3630 用例通过（含新增：下拉项 title / 勾位置、`formatGroupDetail` 只有倍率、faceted-filter 按 key 搜索、LegacyComboboxInput 勾在右侧）；改动文件 oxlint 无 error。
- 本地起 API（:3010）+ 前端（:5174）用种子账号 demo_alice 实看：库里写入 `UserUsableGroups={"auto":"自动分组"}`、`DefaultUseAutoGroup=true` 后，创建密钥默认选中「自动分组」；下拉项单行 `名称 … 倍率 ✓`、左对齐、无 key；使用日志分组筛选只显示名称。注意 :3000 当时被 tokensolo 的 air 进程占用，`make api` 的就绪检查会被它骗过，排查时要看 `.tmp/logs/api.out` 的 FATAL 行。
- 生产配置（5.11）未改，等发版后由黑鹰授权执行。

## 遗留

- 全站所有 `Combobox allowCustomValue` 下拉的勾都移到了右侧，属有意的统一。
- 企业控制台手写的"自动（按分组优先级）"项仍以 `''` 表示留空语义，路由顺序改为 hover 显示。
