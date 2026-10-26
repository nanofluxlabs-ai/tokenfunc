# 新建企业主账号的登录邮箱改为必填

- 日期：2026-10-26
- 分支：main（直接提交）
- PR：
- 关键 commit：见本 worklog 所在提交

## 背景

黑鹰要求新建 / 编辑企业时登录邮箱必填，前后端都校验。登录邮箱只在「新建主账号」时出现：升级已有用户沿用该用户原账号，编辑企业不改主账号邮箱，所以必填只作用于新建主账号这条路径。

## 变更

- 后端 `controller/enterprise_admin.go`：`mode=new_user` 时登录邮箱为空（去空白后）返回 `Login email is required`，再校验格式与占用。
- 前端 `lib/enterprise-form.ts`：新建账号缺登录邮箱报 `Login email is required`；字段说明改为「必填。未手动修改前自动带入联系人邮箱。」，删除旧的 Optional 文案；七个 tokenfunc locale 同步。
- 设计文档企业管理侧组件描述同步：登录邮箱必填、企业名称在企业资料首项且企业资料默认展开（补上 dd6378042 漏改的文档）。

## 验证

- `make test-db PKG="-count=1 -v -run 'TestAdminEnterpriseOwnerGroup' ./controller/"`：PASS（新增空邮箱 / 纯空白邮箱被拒，其余用例改为带合法邮箱）；`make test-db PKG="-count=1 -run 'Enterprise' ./controller/ ./model/"` 均 ok；`gofmt -l controller` 无输出。
- `bunx vitest run src/features/enterprises`：9 文件 76 条通过（新增未填登录邮箱被拦截并聚焦，校验单测改为空邮箱报错）；`bun run typecheck` 无错误；`bunx oxlint src/features/enterprises` 无 error。
- 未做浏览器验证：本地 5173 是黑鹰自己的会话。

## 遗留

- 存量企业主账号若没有邮箱不受影响（编辑企业不涉及主账号邮箱）；如需补齐，要到用户管理里改主账号。
