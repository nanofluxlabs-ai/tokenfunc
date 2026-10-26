# 企业新增 / 编辑：计费设置并入、用户分组、升级选人、授信二次验证

- 日期：2026-10-26
- 分支：worktree-feat-ent-mutate-billing（worktree）
- PR：（创建后补）
- 关键 commit：（提交后补）

## 背景

黑鹰要求：用户管理 → 企业页签，把计费抽屉里的「开通授信计费」移到新增 / 编辑抽屉；新增与编辑企业都能配置用户分组（决定模型倍率折扣）；参考 tokensolo 编辑用户里「权限设置 / 团队设置 / 企业账期设置」采纳好的设计、补齐缺口。过程中追加：必填的计费设置放到权限设置下面，企业资料与开票资料默认折叠；升级已有用户改为可按用户名检索的下拉；授信额度必须大于 0；企业员工不能被升级。

排查发现：页面上没有任何地方能改企业主账号的分组（个人页签已排除企业主，企业页签没有入口），而分组决定企业所有 key 可用的分组与倍率；开通 / 修改授信、切回预付都不走二次验证。

拍板项：worktree；新增时也能直接开授信；授信相关操作加二次验证；新建主账号补「登录邮箱」并默认带联系人邮箱；授信额度必须大于 0；企业员工排除。

## 变更

### 后端

- 企业主分组：创建请求加 `email`、`group`（新建账号默认 default，升级不传则保留原分组），资料更新加可选 `group`；分组必须存在于 GroupRatio，否则 `invalid group`。分组变化时主账号 auth_version +1、刷新缓存、吊销会话（与上游改分组同语义，放在 model 层，升级带分组也覆盖），审计记 group_from / group_to。列表、详情、创建返回都带 `owner_group`。
- 新接口 `GET /api/admin/enterprise/group-options` 返回 `[{group, ratio}]`，PAT 作用域 `user:read`。
- 授信二次验证：`adminUserManageActions` 加 `enterprise_credit`；`PUT/DELETE /enterprises/:id/credit` 要求 `X-Security-Proof`（绑定企业主 user_id），审计记验证方式。
- 授信额度：所有周期类型都要求 > 0（原来只有按额度类型），额度为 0 等于开通即全部拒绝。
- 升级为企业：在职企业成员（含一键开通与绑定已有账号）的登录账号不能升级，`this user is an enterprise member and cannot be upgraded`；成员软删除后可以。

### 前端

- 新增 / 编辑抽屉分区：主账号（仅新增）→ 企业名称（必填，常驻）→ 权限设置（分组，选项显示倍率，编辑时提示改后主账号需重新登录）→ 计费设置（预付 / 授信，授信字段与两条生效说明、低于本期已用警告、切回预付说明）→ 企业资料、开票资料（默认折叠，校验失败自动展开并聚焦）→ 备注。编辑时标题旁显示企业状态。
- 保存流程：先存资料与分组 → 计费有变化时二次验证 → 开通 / 修改授信或切回预付；计费未变不弹验证；第二步失败或取消验证时提示「企业资料已保存，授信设置未生效」并保留表单，重试不重复提交分组。
- 升级已有用户：复用推广人模块的用户选择器（移到 `components/user-picker.tsx`，加 `userType` 与 `group`），只列启用中的个人用户、管理员不可选，选中后分组默认取该用户原分组。
- 计费抽屉：删除授信配置表单与「切回预付」，账户段加「修改计费设置」跳编辑抽屉。企业列表加「分组」列。
- `credit-config-form.tsx` 拆为受控字段组件 `credit-config-fields.tsx`；额度框可清空，空值报错而不是按 0 提交。

## Bug 根因

- 浏览器里「点保存没反应」：企业名称为空，报错在离计费区很远的分区里，没有提示也不可见；另外开发环境右下角的路由调试按钮压在保存按钮上（仅开发环境）。现已前置企业名称、失败时弹提示并滚动聚焦第一个错误字段。
- 编辑时同时改分组和切回预付，切预付不生效：第一步保存后列表刷新，把新行对象同步进抽屉，触发表单重置，计费回到旧值并清掉已保存进度。改为只在打开抽屉或换企业时重置。

## 验证

- 后端：`gofmt -l` 无输出；`make test-db PKG="-count=1 ./model/... ./controller/... ./router/... ./service/... ./middleware/..."` 全部 ok（新增：分组写入 / 校验 / auth_version / 会话吊销、group-options、授信无 proof 403 / 动作不符 403 / 有 proof 200、自然月额度 0 被拒、员工不能升级且离职后可以、创建返回 owner_group）。
- 前端：`bun run typecheck`；改动文件 oxlint / oxfmt；`vitest run src/features/enterprises src/features/promoters src/components src/features/auth src/features/users src/features/finance src/features/enterprise-console src/i18n`（结果见提交前最后一次运行）。
- 浏览器（worktree 端口 5175 / 3002，空库初始化 root，GroupRatio 设 vip 0.8 / svip 0.6）：
  - 新建企业（新建账号 + 分组 vip + 授信自然月 $500）→ 先建企业再弹「验证身份以修改企业授信」→ 列表分组 vip、授信 $500 / $500、自然月。
  - 计费抽屉只剩账户 / 账期 / 流水 / 用量，「修改计费设置」切到编辑抽屉并正确回填。
  - 编辑：分组改 vip、授信切预付 → 请求链 PUT 资料 → POST /api/verify → DELETE /credit，列表变为预付；验证期间表单保持「预付」。
  - 升级：检索「wt」只出现个人用户 wtperson 与置灰的管理员，企业主不在列表；选中后分组自动带出 vip；保存后列表新增企业分组 vip、预付。
  - 登录邮箱随联系人邮箱自动带入。

## 遗留

- 二开代码只在 PostgreSQL 上验证（约定如此）。
- tokensolo 的「首个账期起始日」未采纳：tokenfunc 开通即锚定当前时刻，预约起始日会引出起始日前如何计费的新口径。
- 状态徽标文案沿用计费抽屉的「生效 / 已停用」。
