# tokenfunc 主题下按钮组拼接错位修复

- 日期：2026-10-27
- 分支：main
- PR：
- 关键 commit：见 git log

## 背景

渠道管理工具栏里「拖拽模式 + ?」「优先级下拉 + 排序方向」两个按钮组不像一个整体，像两个独立按钮硬贴在一起，右侧图标按钮是不对称的圆角方块。

## 变更

- 前端 `web/src/styles/brand-presets.css`：胶囊圆角规则排除按钮组内元素；按钮组内把 `--radius` 放大到 9999px，交给 ButtonGroup 自带的「两端 rounded-lg、接缝直角」规则画出胶囊两端。
- 不改上游组件 `button-group.tsx`，避免同步冲突。

## Bug 根因

tokenfunc 预设的胶囊规则是无 layer 的普通 CSS，优先级高于 Tailwind utilities 层里 ButtonGroup 的 `rounded-r-none` / `rounded-l-none`，接缝处被画成胶囊；最后一项的 `rounded-r-lg!` 是 important 又压回 8px，形成左胶囊右小圆角。影响 tokenfunc 主题下所有 ButtonGroup（渠道工具栏、上游价格同步对话框）。

## 验证

- `bunx oxfmt --check src/styles/brand-presets.css` 通过。
- `bun run build` 成功，产物中两条规则按预期输出。
- 用户在本地 5173 页面目视确认按钮组已拼接正常（浏览器自动化连接超时，未截图）。

## 遗留

无。
