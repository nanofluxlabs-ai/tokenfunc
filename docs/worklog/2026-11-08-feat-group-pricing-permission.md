# 分组定价接入 casbin 权限 group_pricing，改价默认只有 Root

- 日期：2026-11-08
- 分支：main
- PR：
- 关键 commit：0ab7b1f4b（后端权限与路由）、1b60f1317（前端按权限控制、按钮改为「保存定价」）

## 背景

分组定价相关接口的权限不一致：

- 系统设置 › 分组定价（以及新的统一保存接口 `/settings`）只允许 Root；
- 「用户管理 › 用户分组」的定价抽屉走 `PUT /tokenfunc/groups/user/:key/pricing`，只要求 AdminAuth。

结果是普通管理员能直接修改 GroupGroupRatio，比如把某个用户分组的倍率改成 0，绕过了上游「计费配置只有 Root 能改」的约束。生产上老田等人是管理员并且在用这块功能，所以不能一刀切改成 Root；用户选择接入上游的 casbin 细粒度权限，由 Root 逐人开放。

## 变更

- 后端：
  - 新增 casbin 资源 `group_pricing`（`service/authz/resources_tokenfunc_group.go`），包含三个权限：
    - `read`：查看分组与定价，管理员默认拥有；
    - `manage`：新建用户分组，修改名称、类型、排序，管理员默认拥有；
    - `price`：修改定价与可见性、删除用户分组（删除会级联清掉该组的定价），**默认不授予管理员**。
  - `/api/tokenfunc/groups/*` 的管理接口改用 `handlePermissionRoute` 挂载，访问令牌路由随之自动声明。
  - `/self` 和 `/settings` 在 `middleware/access_token_routes_tokenfunc_group.go` 里补上访问令牌声明，分别对应 `profile:read` 和 `option:write`。`/settings` 仍是 RootAuth，因为它还会写基准倍率等全局配置。
- 前端：
  - 新增 `useGroupPricingAccess`：
    - 没有 read：隐藏「用户分组」页签；
    - 没有 manage：隐藏新建按钮，编辑按钮置灰；
    - 没有 price：删除按钮置灰，定价抽屉只读（不显示配置渠道分组和保存按钮，排序也锁住，并提示联系超级管理员开通）。
  - 上述判断只是界面提示，真正的校验在后端。
  - 共用的 `RowOrderControls` 增加 `disabled`，可锁住上移、下移和拖动。
  - 分组定价页右上角按钮改为「保存定价」。
  - 权限矩阵的文案登记在 `src/i18n/tokenfunc/static-keys.ts`，避免被 `i18n:sync` 当成未使用的 key 清掉。
- 上游测试 `TestSetUserPermissionsStoresOnlyOverrides` 的期望矩阵里补上 `group_pricing` 这一行。

## 验证

- `go test ./service/authz/ ./router/ ./middleware/ ./controller/ ./service/`：全部 ok。
  - 新增 `TestGroupPricingPermissionDefaultsAndOverride`，覆盖：管理员默认有 read / manage、没有 price；Root 恒有；逐人开放 price 只对该管理员生效。
  - 上游的 `TestAccessTokenRouteRulesCoverEveryDashboardRoute` 原来在 main 上就失败，10 条未声明的路由全是 `/tokenfunc/groups/*`；本次之后通过。
- `bun check -b` 无类型错误，改动文件 oxlint 无报错。
- `bunx vitest run src/features/users src/features/system-settings/models`：24 个文件、177 个用例通过，新增两个场景：无 price 时删除置灰、定价抽屉只读；无 manage 时隐藏新建、编辑置灰。
- `make api` + 浏览器：Root 打开管理员 QA Admin 的编辑抽屉，「管理员权限」里出现「分组定价」三项，查看、管理默认勾选，修改分组定价默认不勾。

## 遗留

- **上线注意**：发版后老田等管理员会立刻失去改价和删除用户分组的权限，需要 Root 在「用户管理 › 编辑 › 管理员权限」里给需要的人勾上「修改分组定价」。这个资源上线后才存在，没法提前配置。
- 已签发的 scoped 访问令牌不包含 `group_pricing:*` scope，如果要用访问令牌调用这些接口，需要重新签发。
- 没有用管理员账号做浏览器端实测，管理员视角只有单测覆盖。
