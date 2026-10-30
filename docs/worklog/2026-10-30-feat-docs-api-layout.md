# 文档中心改版四期：API 页改为 Mintlify 式布局

- 日期：2026-10-30
- 分支：worktree-feat-docs-api-layout
- PR：#74
- 关键 commit：c7dce2b87

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

## 追加：示例模型选择不再单独占一块

黑鹰反馈：API 页顶部的「示例模型」卡片太占地方。这张卡片包括标签、选择框和密钥提示三行，约 90px 高。

- API 页（有请求示例）：
  - 去掉顶部卡片。
  - 示例模型选择改成一行（「示例模型 [▾]」），放在请求示例的正上方，它直接决定这段代码里的模型。
  - 密钥提示（未登录引导或勿截图提醒）放到请求示例下方，用一行小字显示。
  - 宽屏时它们在右栏，窄屏时跟着请求示例留在正文里。
- 指南页：卡片改成无边框的一行，左边是模型选择，右边是提示。
- 代码改动：
  - `SampleModelSelect` 改为标签和输入框在同一行，并导出供复用。
  - 密钥提示的逻辑抽到 `hooks/use-sample-key-hint.tsx`，指南页和 API 页共用。
  - `DocContent` 新增 `sampleFamily` 参数。
- 验证：
  - 新增 2 个用例：
    - 模型选择只出现在请求示例上方，且位于代码之前；密钥提示位于代码之后。
    - 页面没有示例模型系列时，不显示模型选择。
  - 文档模块 12 个文件、127 个用例全部通过；tsc 通过；lint 无 error。
  - 浏览器检查：Chat Completions 的正文紧接在标题下方；快速开始页的示例参数是一行。

## 追加：侧栏图标、请求方法标签与菜单顺序

黑鹰提了三点要求：三方工具菜单加图标；Responses 排到 Chat Completions 下面；其他菜单是否加图标由我评估。

- 三方工具：
  - 工具页的 `DocsPageEntry` 新增 `icon` 字段，取 `@lobehub/icons` 的图标名，通过项目已有的 `getLobeIcon` 按需加载。
  - 统一用单色版。12 个图标里有一半没有彩色版，彩色和单色混用会显得杂乱；单色版跟随文字颜色，普通、悬停、选中三种状态都会随之变化。
  - 「选择接入方式」没有对应品牌，用 lucide 的 `LayoutGrid`，整组的文字因此保持对齐。
  - WorkBuddy 在图标库里没有自己的图标。
    - 先临时用腾讯标志顶上，之后从官网 https://www.workbuddy.cn 的 `logo.svg` 取了官方图标，做成单色组件 `assets/custom/icon-workbuddy.tsx`，在 `lib/lobe-icon.tsx` 的 `CUSTOM_ICONS` 中注册，与已有的 Sub2API、Wan 做法相同。
    - 原图是绿色渐变圆底，上面一个白色猫头，猫头的脸部区域镂空、露出底色，眼睛是白色。
    - 单色化时先尝试只保留猫头，但去掉圆底后猫头偏在右下，空白很多。最终改为用 mask：圆底用 currentColor，猫头和眼睛镂空，这样保留了原图的圆形徽章构图。在深色和浅色背景下都检查过。
    - 副作用：`getLobeIconNames` 会列出所有自定义图标，所以后台的图标选择器里也能选到 WorkBuddy。
- 菜单顺序：API 组改为 鉴权 → 模型列表 → Chat Completions → Responses → Anthropic Messages → …，上一页/下一页随之变化。
- 其他菜单：
  - 开始使用、企业客户：按我的建议，不加通用图标。这类概念页配图标不能帮人更快找到内容，只会让侧栏变杂。
  - API 参考：黑鹰同意给接口页加请求方法标签（GET/POST），鉴权、错误码这类非接口页不加。
  - 标签抽成共用组件 `MethodBadge`，正文地址栏和侧栏共用同一套配色。
  - 请求方法记在 registry 的 `method` 字段：侧栏在正文加载前就要渲染，所以不能从正文读取。
  - 内容测试会检查每页 registry 里的 `method` 与正文 `:::endpoint` 的方法一致，没有 `:::endpoint` 的页面也不能写 `method`。
- 验证：
  - 测试：
    - 新增 4 个用例：工具组整组都有图标位，其他组没有；Responses 紧跟在 Chat Completions 之后；接口页带请求方法标签，非接口页不带；registry 与正文的请求方法一致。
    - 文档模块共 12 个文件、132 个用例，全部通过；tsc 通过，lint 无 error。
  - 浏览器：12 个工具图标都渲染成功；API 组的标签和顺序显示正确，截图存在 `.tmp/api-layout-nav-methods.png`。

## 追加：分组标题加图标

我原本建议分组标题不加图标，黑鹰决定加。

- 4 个分组用 lucide 图标：开始使用 Rocket、API 参考 Code、企业客户 Building2、三方工具接入 Puzzle。
- 图标对应表放在 `docs-nav-list.tsx` 里，没有放进 registry。registry 构建时还要用于预渲染，不能引入 React 组件。
- 图标加了 `aria-hidden`，分组按钮的无障碍名称不变。
- 验证：
  - 新增 1 个用例：每个分组标题都带装饰图标，且按钮名称不变。文档模块 133 个用例全部通过；tsc、lint 无报错。
  - 浏览器截图：`.tmp/api-layout-nav-groups.png`。

## 遗留

- 右栏的请求示例里，长行（如 Authorization 头）超出面板宽度时需要横向滚动，这一点与 Mintlify 一致。
- 响应示例目前只有 200 一个 tab。错误响应的示例集中在「错误码」页，以后可以按需要给每个接口补 401、429 等 tab。