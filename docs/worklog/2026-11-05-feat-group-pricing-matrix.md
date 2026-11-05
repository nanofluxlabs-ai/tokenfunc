# 分组定价重构：用户分组 × 渠道分组，语义分离与差异定价

- 日期：2026-11-05
- 分支：worktree-feat-group-pricing
- PR：
- 关键 commit：

## 背景

黑鹰要求模型分组定价支持企业分组，不同用户分组走同一渠道可以是不同倍率，并且把「企业 / 用户分组」和「定价分组」在语义上分开。参考 tokensolo 的「用户等级 × 渠道分组」纯矩阵模型，但 tokenfunc 每两周合一次上游 rc，不能像 tokensolo 那样重写计费链路。

调研结论：上游已有 `GroupGroupRatio[用户分组][渠道分组]` 矩阵与 `group_special_usable_group` 可见性规则，计费层本就支持差异倍率；真正的问题是 `user.group` / `token.group` / `channel.group` / `GroupRatio` key 共用一份清单，运营分不清「谁在用」和「走哪个池」，以及令牌分组留空时直接拿用户分组当池名。

已拍板：基准价 + 覆盖（渠道分组有基准倍率与默认可见，用户分组只配差异）；企业共享档位、按需专属；存量 vip / svip / ddjs 用户迁回 default；一期做完。

## 变更

### 后端（计费链路零改动）
- `setting/tokenfunc_group_registry.go`：新增 `tokenfunc_group_setting` 分层配置，两张注册表 `user_groups`（名称 / 说明 / 类型 个人|企业 / 排序）与 `channel_groups`（名称 / 排序）。渠道分组 key 仍以 `GroupRatio` 为准，注册表只补展示信息；`default` 用户分组恒存在。
- `setting/ratio_setting/tokenfunc_group_ratio.go`：`GetGroupGroupRatioCopy`，矩阵只读副本。
- `service/tokenfunc_group.go`：`ResolveDefaultUsingGroup`（令牌分组留空时：用户分组本身是可选渠道分组则取自己，否则取可见渠道分组里排序第一的）；`GetUserGroupPricing` / `SaveUserGroupPricing`（把某用户分组的渠道分组表反算成相对默认可见的 `+:`/`-:` 差异与倍率覆盖，只改该分组切片，经 `UpdateOptionsBulk` 写上游 option）；用户分组 CRUD / 排序 / 级联删除。
- `model/tokenfunc_group.go`：`CountUsersByGroup`；`SeedTokenFuncGroupRegistries` 在主节点启动时从存量数据播种（渠道分组 = GroupRatio 全部 key，用户分组 = default ∪ users.group ∩ GroupRatio）。
- `controller/tokenfunc_group.go` + `router/tokenfunc-group-router.go`：管理员接口 `/api/tokenfunc/groups/channel`、`/user`（CRUD、`user-order`、`/:key/pricing`），登录用户 `/self`（按排序的可选渠道分组 + 默认分组）。
- 上游钩子（各一处）：`middleware/auth.go` 令牌分组留空时走 `ResolveDefaultUsingGroup`；`relay/common/relay_info.go` 留空时改读鉴权算好的 `UsingGroup`；`controller/model.go` 模型列表同口径。
- 企业二开：主账号分组校验改为「已登记的用户分组」；`group-options` 返回企业档位 + default；企业密钥不选分组时按默认渠道分组解析，可选分组按排序输出并带 `label`。

### 前端
- 共享契约：`web/src/lib/tokenfunc-groups.ts`（接口封装与类型）、`web/src/hooks/use-group-options.ts`（`useUserGroupOptions` / `useChannelGroupOptions` / `useSelfChannelGroupOptions`，选项按后台排序，名称与 key 不同时括注 key）。
- 系统设置 › 模型 › 分组定价：只管渠道分组（`system-settings/models/channel-groups/`），上游 `GroupRatioForm` / `GroupRatioVisualEditor` 原文件不改，降级为「高级编辑器」；新增表单字段 `ChannelGroupsRegistry` 映射 option `tokenfunc_group_setting.channel_groups`。
- 用户管理 › 第三个 Tab「用户分组」（`users/groups/`）：注册表列表（拖拽排序、default 锁定、有用户禁删）、新增 / 编辑抽屉、定价抽屉（可见 + 倍率，留空即基准）。
- 下拉换语义：用户编辑 / 用户列表筛选 / 企业主账号 / 订阅升级降级 / 财务用户消耗 → 用户分组；渠道编辑 / 财务模型消费 / 使用日志筛选 → 渠道分组；令牌分组 / 企业密钥 / 游乐场 → 登录用户可选渠道分组（`/groups/self`）。`GroupFilterSelect` 加 `kind` 区分两张表。
- 列表展示：用户列表分组列显示名称悬浮 key（`user-group-badge.tsx`，查询放单元格内避免列重建）；渠道列表分组列换成 `channel-group-cell.tsx`，单个渠道可在弹层里改分组（至少保留一个，`handleUpdateChannelGroups`），Tag 聚合行只读；可复制徽章光标由 `cursor-copy` 改为手型。
- 测试同步：mock 旧 `/api/group/`、`/api/user/self/groups` 的用例改为新接口形状；用户列测试补 `QueryClientProvider`；新增 `group-filter-select.test.tsx`、`channel-group-cell.test.tsx`。

## 验证

- `GOWORK=off go build ./...`、`go vet` 改动包通过。
- `make test-db`：setting / service / model / middleware / controller 全部 ok。新增 `setting/tokenfunc_group_registry_test.go`、`service/tokenfunc_group_test.go`（含 PG 写回用例）；调整三处依赖旧口径的用例：企业主账号分组用例改为登记用户分组、企业分组选项断言改为新结构、responses WS 用例把 `updated` 登记为可选渠道分组。

- 前端：`bun check -b` 无类型错误；改动文件 `oxfmt` / `oxlint` 通过（`bun run lint` 仅 `scripts/sync-i18n.mjs:235` 既有 curly 报错）；`bunx vitest run` 覆盖 users / system-settings / enterprises / subscriptions / channels / keys / playground / enterprise-console / finance / usage-logs / components / hooks：206 文件 1691 用例，1 条 `visual-billing-editor` 用例并发下偶发、单跑通过且文件未改。
- 本地 `make api` + `make web`（worktree slot 1）实测：启动日志 `seeded tokenfunc channel group registry with 3 groups` / `user group registry with 1 groups`；用户管理 › 用户分组 新建 `ent_std`（企业），定价抽屉把 vip 覆盖 0.9、svip 开放可见并覆盖 1.5，保存后列表「定价差异」= 3；系统设置 › 分组定价 改 vip 基准 0.8、svip 改名「高级池」并下移，刷新后保持；令牌分组下拉显示「默认分组 default 1x / VIP 分组 vip 0.8x」且不含未默认可见的 svip；企业主账号分组下拉显示「默认分组 (default) / 企业标准 (ent_std)」。

## 遗留

- 手机端（<640px）布局只靠 Tailwind 断点，浏览器缩放未生效，待真机过一遍。
- 「使用指南」按钮未放进新的渠道分组页：上游 `GroupPricingGuide` 未导出，按约定不改上游文件。

- `service/task_billing.go` 的 `GetGroupGroupRatio(group, group)` 把用户分组与渠道分组传成同一值，疑似上游 bug，本次未动。
- 生产存量 vip / svip / ddjs 用户迁回 default 的 SQL 在发版前执行，写进发布报告。
