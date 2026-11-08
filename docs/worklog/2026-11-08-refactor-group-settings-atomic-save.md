# 分组定价页统一用右上角「保存」，渠道分组与用户分组定价一个事务落库

- 日期：2026-11-08
- 分支：main
- PR：
- 关键 commit：3564563ec（后端统一保存接口）、前端见本条所在 commit

## 背景

系统设置 › 分组定价页原来有两个保存入口：右上角「保存分组设置」只管渠道分组段，用户分组定价面板底部还有一个自己的「保存」。用户容易只点其中一个、漏存另一段；而且两条链路都不是原子的：

- 段一逐个 key 调 `PUT /api/option`，中途失败会留下一半新、一半旧的配置；
- 两段写的是同一批 option（GroupGroupRatio、group_special_usable_group），分两次保存时，后一次会拿旧快照覆盖前一次的写入。

用户要求：整页配置作为一个整体保存，要么全部成功、要么全部失败；只有新建用户分组保持实时保存。

## 变更

- 后端：新增 `PUT /api/tokenfunc/groups/settings`（RootAuth，与 `/api/option` 同级，因为会写 GroupRatio 等全局 option）。`service.SaveGroupSettings` 的处理顺序：
  1. 校验 option key 白名单，逐项解析值；
  2. 把本次提交的值叠到当前快照上，在这份快照上计算用户分组定价表；
  3. 所有 option 一起交给 `model.UpdateOptionsBulk`，在一个事务里落库。
  
  `SaveUserGroupPricing` 拆成「快照上计算」与「落库」两步。用户管理页的定价抽屉仍走原来的 PUT 接口，行为不变。
- 前端：
  - 面板状态抽成 `useUserGroupPricingPanel`，由页面持有，面板只负责渲染；面板底部的「保存」去掉。
  - 右上角按钮改为「保存」，把段一改动的 option 和段二当前用户分组的定价草稿一次提交给新接口，失败时保留草稿。
  - 文案：用户分组定价里的「新增渠道分组」改为「配置渠道分组」（从已有渠道分组中挑选）；「添加用户分组」改为「新建用户分组」，新建抽屉标题同步改。
  - 上游 `group-ratio-form.tsx` 的「保存分组设置」翻译保持不动。

## 验证

- `make test-db PKG="./service/ -run 'GroupSettings|UserGroupPricing|UserGroupLifecycle|ResolveDefault' -v"`：全部 PASS，新增用例覆盖以下情况：
  - 段一新增渠道分组，同一次请求里配给用户分组，落库正确；
  - 定价表引用了本次删除的渠道分组、白名单外的 key、格式错误的值，这三种情况都整体失败，DB 和内存都保持不变。
- `bun check -b` 无类型错误；改动文件 oxlint 无报错；`bunx vitest run src/features/users/groups src/features/system-settings/models`：14 个文件、137 个用例通过。
- `make api` + `make web` 浏览器实测（dev schema，测完已复原）：
  - 同时改 svip 基准倍率与 default 用户分组的 vip 覆盖，只发出一次 `PUT /settings`，两段都落库；
  - 段一删除 vip、段二同时改 vip 覆盖，接口返回 `unknown channel group: vip`，库中 GroupRatio、GroupGroupRatio 等均未变化。

## 遗留

- 所有 `/api/tokenfunc/groups/*` 路由（包括已有的）都没有在访问令牌路由表（`middleware/access_token_routes.go`）里声明，scoped 访问令牌调用会返回 `ACCESS_TOKEN_ROUTE_UNDECLARED`。浏览器会话不受影响。是否需要开放给访问令牌另行决定。
- 只提交当前选中用户分组的定价草稿；切换用户分组时仍需先确认放弃改动，不做多分组草稿。
