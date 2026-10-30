# 文档中心改版四期：API 页改为 Mintlify 式布局

- 日期：2026-10-30
- 分支：worktree-feat-docs-api-layout
- PR：
- 关键 commit：

## 背景

三期（#73）试过把在线调试嵌进正文，黑鹰认为效果生硬，并给出 Polymarket（Mintlify）的文档作为参考。实际打开后确认，它的「Try it」同样是弹窗，好看的原因在于页面结构：

- 右栏固定显示请求和响应示例。
- 地址栏和 Try it 在同一行。
- 参数逐行列出，用小标签标出类型和是否必填。
- 调试弹窗与站点视觉统一。

#73 已改回弹窗并合并。本期按方案 A 改造 API 页布局。

## 变更

**新增 Markdown 指令**（`lib/doc-markdown.ts`，浏览器渲染和预渲染共用）
- `:::endpoint{method path operation}`：接口地址栏，取代原来的 http 代码块和 `:::api-playground`。
- `:::request-example`、`:::response-example`：按 `@tab` 分段，每段只能是一个代码块。
  - 顶层的示例同时收集到 `ParsedDoc.aside`。
  - 窄屏时留在正文原位显示；宽屏（xl 及以上）时在正文中隐藏，改到右栏显示。
- `:::params`：把参数表渲染成逐行的字段列表，包含参数名、类型标签、必填标签和说明。
  - 按表头里的「类型 / 必填」识别对应列，最后一列作为说明。
  - 输出的是纯 HTML，SEO 预渲染无需额外处理。

**组件**
- `endpoint-bar.tsx`（由 `api-playground-button.tsx` 改名重写）：
  - 一行里放请求方法徽标、本站地址加路径（斜杠淡化，`{参数}` 高亮）、复制按钮和「在线调试」按钮。
  - 下方用一行小字提示「调试会真实扣费」，未登录时提示先登录。
  - 复用了 `CopyButton` 和 `Badge`，项目里没有现成的请求方法徽标组件。
- `doc-content.tsx` 新增 `DocExample`：
  - 复用 `CodeBlock`（`showToolbar`），标题区放 Tabs。
  - 请求示例按语言切换，与正文其他代码标签联动；响应示例按状态码切换。
  - 在右栏显示时，代码最多 26 行，超出部分在面板内滚动。
  - `DocContent` 新增 `placement` 参数，用于区分正文和右栏。
- `docs-layout.tsx`：
  - 新增 `aside` 插槽，有示例时使用三栏布局：xl 下右栏宽 22rem，2xl 下 26rem，并固定在视口内。
  - 指南类页面保持原来的两栏、896px 正文宽度。
- `ai-elements/code-block.tsx`：`CodeBlockProps` 由 `HTMLAttributes` 和 `title: ReactNode` 直接交叉，导致 title 实际只能传字符串。改为 `Omit<…, 'title'>`，与同文件里的 `CodeBlockFrameProps` 写法一致。这是上游文件，只改了这一行类型。
- `tokenfunc-docs.css`：
  - 新增字段列表样式。
  - 把 Scalar 的 `--scalar-*` 变量映射到站点的颜色变量，使调试弹窗的按钮、背景和边框与站点一致。

**内容**
- 6 个 API 页（中英文各一份）全部迁移到新写法。迁移用一次性脚本完成，脚本放在 `.tmp/` 下，不提交：
  - 去掉「请求示例 / 响应示例」标题，由面板自身标注。
  - 响应字段表改为「响应字段」小节，同样渲染成字段列表。
- 图片页拆成两页，做到一页一个接口：
  - 「图片生成」沿用 `api-images`。
  - 新增「图片编辑」页 `api-image-edits`。原来编辑示例依赖上一节定义的 `client`，现在补成可以独立运行的 Python 和 Node.js 示例。
- 新增一条界面文案 `Examples`（右栏的无障碍名称），7 种语言都已补齐。

## 验证

- 测试：
  - `bunx vitest run src/features/docs`：12 个文件、125 个用例全部通过。新增的用例覆盖：
    - 示例被收集到 aside，且正文中保留原位。
    - 示例 tab 里不是单个代码块时报错。
    - `:::params` 四列表格渲染出类型和必填标签，两列表格不渲染这两种标签。
    - 预渲染输出包含接口行和所有示例。
    - `EndpointBar`：显示请求方法和完整地址；operation 未知时不显示调试按钮；首次点击才加载调试弹窗；未登录时按钮禁用。
  - 内容测试加强：每个 `:::endpoint` 的方法和路径必须与调试规范里同名接口一致，避免地址栏与弹窗对不上。
  - 全量 `bunx vitest run`（在 web/ 下运行）：321 个文件、3021 个用例全部通过。
  - `bunx tsc -b` 通过，改动文件的 oxlint 没有 error。
- 构建：`bun run build` 预渲染 52 页（26 页 × 2 种语言，含新增的图片编辑页）。
- 浏览器验证（worktree 的 :3001 生产构建，账号 demo_carol，视口宽 1920）：
  - Chat Completions：
    - 地址栏、字段列表和右栏的请求 / 响应面板显示正确，示例里填的是真实的 default 密钥。
    - 点「在线调试」后弹窗正常，界面为中文，发送按钮、背景使用站点配色。
  - 快速开始页：没有右栏，栅格为 `230px 1218px`，正文宽 896px。
  - 图片编辑页：显示正常。
  - 窄屏：页面放在宽 1100px 的同源 iframe 中检查。右栏为 `display: none`；正文里的请求、响应面板按原位置显示，正文宽 706px。
  - 截图：`.tmp/api-layout-chat-completions.jpg`、`.tmp/api-layout-playground-modal.jpg`。

## 遗留

- 右栏的请求示例里，长行（如 Authorization 头）超出面板宽度时需要横向滚动，这一点与 Mintlify 一致。
- 响应示例目前只有 200 一个 tab。错误响应的示例集中在「错误码」页，以后可以按需要给每个接口补 401、429 等 tab。