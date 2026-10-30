# 文档中心改版三期：API 在线调试与 Gemini 原生接口

- 日期：2026-10-30
- 分支：worktree-feat-docs-api-playground
- PR：#73
- 关键 commit：31c663377；追加：右侧目录悬停展开、调试面板界面本地化

## 背景

文档中心改版的最后一期，前两期是 #71（内容体系）和 #72（连接自检）。用户希望能在文档里直接调用接口看结果，不用自己拼 curl。

与黑鹰确认的取舍：
- 保留手写的 API 页。这些页负责 SEO 和中文说明，每页只加一个「在线调试」弹窗，不用 Scalar 生成整份参考文档。
- 本期只新增 Gemini 原生接口页。embeddings、rerank、音频不在本期范围。

## 变更

**在线调试**
- 用 Scalar 的 `@scalar/api-client-react` 做调试面板，MIT 协议。
- 调试面板依据 `lib/playground-spec.ts` 生成的 OpenAPI 规范，只覆盖文档里写到的 7 个接口：
  - 模型列表
  - Chat Completions
  - Messages
  - Responses
  - 文生图
  - 图片编辑（multipart）
  - Gemini generateContent
- 请求体示例里的模型名取本站真实可用的模型。
- 三种鉴权方式（Bearer、`x-api-key`、`x-goog-api-key`）都预填了默认密钥。服务器地址用本站地址。
- 在正文里写 `:::api-playground{operation=...}` 即可放一个按钮。目前已放在模型列表、Chat Completions、Messages、Responses、图片生成（2 个）、Gemini 页的接口地址下方。
- 内容测试会校验每个按钮的 operation 在规范里存在。

**按需加载**
- `api-playground-client.tsx` 用 `React.lazy` 引入，第一次点击按钮才加载。
- Scalar 及其 Vue 运行时、样式都被拆进异步包，首屏 JS 和 CSS 里不包含 Scalar（已检查构建产物）。
- 首次点击时下载的包体积：最大的异步包约 2.5 MB，gzip 后约 0.72 MB；三个主要异步包合计 gzip 后约 0.87 MB。

**两处集成问题的修复**
- CodeMirror 重复实例：Scalar 依赖的 `@codemirror/state` 是 ^6.7.6，项目里的是 6.7.1，装出了两份。两份并存时 Scalar 的编辑器挂载失败，报错 `Unrecognized extension value`，请求体编辑器直接空白。
  - 处理：把项目的 `@codemirror/state`、`view`、`language` 升到满足双方范围的版本，现在只装一份。
  - 验证：全量前端测试 320 个文件全部通过。
- 配色缺失：Scalar 的配色定义在 `.light-mode` / `.dark-mode` 类下，项目只用 `html.dark`，导致面板没有背景色。
  - 处理：客户端挂载后根据 `html.dark` 给 `.scalar-app` 切换对应的类，并用 MutationObserver 跟随站点主题变化。

**其他**
- 新增「Gemini 原生接口」页（API 参考分组）。网关行为已对照代码核实：
  - 鉴权方式：`x-goog-api-key`、`?key=`、Bearer。
  - 流式：`streamGenerateContent?alt=sse`（`relaykit/dto/gemini.go`）。
  - `countTokens` 返回 404。
  - 模型列表：`/v1beta/models`。
  - 示例覆盖 cURL、`google-genai`、`@google/genai`。
- 新增 3 条界面文案，补齐 7 种语言。

## 验证

- 测试：
  - `bunx vitest run src/features/docs`：11 个文件、113 个用例全部通过。新增 `playground.test.tsx`，覆盖两点：规范包含文档能打开的全部接口，且示例用的是本站模型；第一次点击后才加载调试面板，并传入正确的密钥和接口。
  - `bunx vitest run` 全量：320 个文件、3009 个用例全部通过（含 CodeMirror 升级的影响）。
  - `bunx tsc -b` 和相关文件的 oxlint 无报错。
- 构建：`bun run build` 预渲染 50 页。Scalar 只出现在 `static/js/async` 与 `static/css/async` 下，首屏 `index.css` 里搜不到 scalar。
- 浏览器端到端（worktree 的 :3001 生产构建，账号 demo_carol）：
  - Chat Completions 页点「在线调试」：面板为暗色主题，Bearer 已填入 default 密钥，请求体预填 `gpt-5`。点 Send 后网关返回 `do_request_failed`，原因是示例数据的渠道没有真实上游，说明请求确实到达了网关。
  - Gemini 页：路径参数 model 预填 `gemini-3-pro`，用 `x-goog-api-key` 鉴权。网关返回 `model_price_error`（示例数据里的该模型未定价），同样说明请求到达了网关。

## 追加：右侧目录改为悬停展开，调试面板跟随站点语言

黑鹰反馈两点：
- 右侧目录占了一列，正文被挤窄，表格频繁换行。
- 调试面板希望嵌入页面、不要弹窗。

**调试面板：试过内嵌，最终撤回**
- 选型：先对比了几个开源项目，都不合适，最后用 Scalar 公开导出的 `Operation` 组件自己挂载，做出了页内展开版本（提交 599c8aed2）。
  - Stoplight Elements 的 `TryIt`：会带进 react-query v3、react-router 6，以及 mosaic 的全局 CSS。
  - RapiDoc 的 mini 版：会重复渲染接口文档，并且不支持流式。
  - swagger-ui：界面陈旧、体积大。
  - fumadocs：需要引入它的整套框架。
- 黑鹰看过实际效果后认为嵌在正文里很生硬，并给了 Polymarket（Mintlify）作为参考。
  - 实测它的「Try it」同样是弹窗。
  - 它好看的原因在于页面结构：右栏固定放请求和响应示例；地址栏和 Try it 在同一行；参数逐行列出（类型、必填用小标签标出）；弹窗与站点视觉统一。
- 结论（黑鹰选定方案 A）：
  - 本 PR 改回 Scalar 弹窗，内嵌代码全部撤回，依赖恢复到 `@scalar/api-client-react`。
  - Mintlify 式的布局改造新开一期做。
- 保留的改进：弹窗传入 `localization.locale`，值为 `toIntlLocale` 转换后的站点语言。Scalar 内置 zh-CN、zh-TW、fr、ru 翻译，ja、vi 回落到英文。三期遗留的「面板只有英文」问题由此解决。

**右侧目录**
- 新增 `components/docs-toc.tsx`：
  - 固定在视口右侧，默认只显示一列细横线（h2 较长、h3 较短，当前章节颜色加深、长度加长），不占栅格列。
  - 鼠标悬停或键盘聚焦时，在原位浮出完整目录；点击标题跳到对应锚点（标题已设置 `scroll-margin-top`）。
  - 收起状态是一组横线，不是单个触发元素，`ui/hover-card`（Base UI PreviewCard）承载不了，所以改用 CSS 的 `group-hover` / `group-focus-within` 控制显隐。
- 新增 `hooks/use-active-heading.ts`：监听滚动，把最后一个越过顶部阅读线的标题作为当前章节，并加上 `aria-current="location"`。
- `docs-layout.tsx`：栅格去掉第三列；正文宽度从 `max-w-3xl` 放宽到 `max-w-4xl`（768px → 896px）。

**验证**
- 测试：
  - `bunx vitest run src/features/docs`：12 个文件、116 个用例全部通过。
    - 新增 `docs-toc.test.tsx`，覆盖三种情况：少于 2 个标题时不渲染；链接指向锚点；当前章节随滚动变化。
  - 全量 `bunx vitest run`（在 web/ 下运行，内嵌版时）：321 个文件、3013 个用例全部通过。
  - `bunx tsc -b` 通过。
  - lint 只有 `prefer-query-selector` 警告。`getElementById` 是有意保留的：标题 id 可能以数字开头，用 querySelector 会出错。
- 构建：`bun run build` 预渲染了 50 页。
- 浏览器（:3001 生产构建，demo_carol 账号）：
  - 右侧目录：默认只显示横线，悬停时浮出卡片。点击「Streaming」后跳到该节，标题没有被顶栏遮住，高亮随之切换。
  - 切到中文后点「在线调试」：弹窗界面为中文（「发送」「身份验证」等），密钥已预填。
- 截图：
  - `.tmp/docs-playground-inline-light.jpg`：撤回前的内嵌版。
  - `.tmp/polymarket-try-it-modal.jpg`：参考对象。

## 遗留
- 调试面板首次打开约需下载 0.87 MB（gzip）。如果以后使用频繁，可以在鼠标悬停按钮时预加载。
- embeddings、rerank、音频接口的文档页还没做。
- 下一期（已与黑鹰确认）：API 页改成 Mintlify 式布局。
  - 右栏固定放请求/响应示例：请求示例可切换语言，响应示例按状态码分 tab。
  - 地址栏与 Try it 合并成一行。
  - 参数改为逐行列出，取代表格。
  - Scalar 弹窗改用站点的配色变量。
