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
（进行中）

## 验证

- `GOWORK=off go build ./...`、`go vet` 改动包通过。
- `make test-db`：setting / service / model / middleware / controller 全部 ok。新增 `setting/tokenfunc_group_registry_test.go`、`service/tokenfunc_group_test.go`（含 PG 写回用例）；调整三处依赖旧口径的用例：企业主账号分组用例改为登记用户分组、企业分组选项断言改为新结构、responses WS 用例把 `updated` 登记为可选渠道分组。

## 遗留

- `service/task_billing.go` 的 `GetGroupGroupRatio(group, group)` 把用户分组与渠道分组传成同一值，疑似上游 bug，本次未动。
- 生产存量 vip / svip / ddjs 用户迁回 default 的 SQL 在发版前执行，写进发布报告。
