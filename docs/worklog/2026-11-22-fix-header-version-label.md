# 顶栏只显示版本号，上游更新检查仅保留在系统设置

- 日期：2026-11-22
- 分支：main
- PR：
- 关键 commit：

## 背景

左上角版本号（管理员可见）沿用上游 `SystemUpdateAction`：浏览器每小时直连 `api.github.com/repos/QuantumNous/new-api/releases`，点击弹窗展示上游 new-api 最新 release 的正文。对客户暴露白标，且我们的 `v2026.x` 版本号与上游 `1.0.0-rc.x` 不可比，国内访问 GitHub 也不稳定。

## 变更

- 新增 `web/src/features/system-update/system-version-label.tsx`：`SystemVersionLabel` 只渲染当前版本号纯文本（管理员可见，空版本 / `v0.0.0` 不渲染），不可点击、不请求 GitHub。
- `app-header.tsx`、`public-header.tsx` 顶栏改用 `SystemVersionLabel`。
- 上游更新检查保留在 系统设置 › 运营设置 › 系统维护（`/system-settings/operations/update-checker`，仅 root 可进），上游 `features/system-update/*` 原样未改，减少同步冲突。

## Bug 根因

顶栏直接复用上游的 `SystemUpdateAction presentation='version'`，二开时未替换。

## 验证

- `bun check -b`：无类型错误。
- `oxlint` 与 `oxfmt --check` 检查改动的 3 个文件：无 error、格式正确。
- `vitest run src/features/system-update src/components/layout`：4 个文件、65 个用例全部通过。
- 浏览器（5173 → API 3010，root 登录）：顶栏左上角不再有版本按钮（本地版本为 v0.0.0，按约定不显示），无 api.github.com 请求；系统设置 › 运营设置 › 系统维护 显示当前版本与「检查更新」按钮。

## 遗留

无
