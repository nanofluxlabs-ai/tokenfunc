# 企业新增 / 编辑：企业名称并入企业资料，企业资料默认展开

- 日期：2026-10-26
- 分支：main（直接提交）
- PR：
- 关键 commit：见本 worklog 所在提交

## 背景

黑鹰要求：系统管理新建企业时，企业名称表单放进「企业资料」分组，企业资料默认展开；编辑企业用同一抽屉，一并生效。

## 变更

- 前端 `enterprise-mutate-drawer.tsx`：去掉独立的企业名称分区；企业资料默认展开（打开 / 换企业时也重置为展开），开票资料仍默认折叠。
- `EnterpriseProfileFields` 首个字段为企业名称；`ENTERPRISE_PROFILE_FIELDS` 加 `name`，用户手动收起企业资料后名称校验失败仍会展开并聚焦。
- 分区顺序：主账号（仅新增）→ 权限设置 → 计费设置 → 企业资料（名称在首）→ 开票资料 → 备注。

## 验证

- `bunx vitest run src/features/enterprises`：9 文件 75 条通过（更新顺序 / 默认展开 / 折叠后校验展开用例）。
- `bun run typecheck` 无错误；`bunx oxlint src/features/enterprises` 无 error。
- 未做浏览器验证：本地 5173 是黑鹰自己的会话，管理员登录会互相顶掉。

## 遗留

无。
