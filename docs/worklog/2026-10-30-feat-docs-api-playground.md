# 文档中心改版三期：API 在线调试与 Gemini 原生接口

- 日期：2026-10-30
- 分支：worktree-feat-docs-api-playground
- PR：#73
- 关键 commit：31c663377（弹窗版）；追加提交改为页内嵌入 + 目录悬停展开

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

## 遗留

- 调试面板的界面是英文，由 Scalar 内置，跟随站点语言需要额外接入它的本地化包。
- 首次打开调试面板要下载约 0.87 MB（gzip）。如果后续调试使用频繁，可以考虑在鼠标悬停按钮时预加载。
- embeddings、rerank、音频接口的文档页没有做，需要时另开一期。

## 追加：在线调试改为页内嵌入，右侧目录改为悬停展开

黑鹰反馈两点：
- 调试面板应该嵌在文档页里，不要弹窗。
- 右侧目录占了一列，正文被挤窄，表格频繁换行。

**选型**：黑鹰要求先找高星开源项目，以下是对比结果：
- Stoplight Elements 的 `TryIt`：是 React 内嵌组件，但会带进 react-query v3、react-router-dom v6、jotai 1.x，以及 mosaic 的全局 CSS。
- RapiDoc 的 `rapi-doc-mini`：
  - 会把接口文档重复渲染一遍。
  - Shadow DOM 难统一样式。
  - 不支持 SSE 流式。
- swagger-ui-react：界面老旧、体积大。
- fumadocs-openapi：需要 fumadocs 整套框架。
- 结论：继续用 Scalar。`@scalar/api-client` 的 exports 公开了以下入口，可以自己挂载，不必走它的弹窗：
  - `features/operation`
  - `v2/workspace-events`
  - `features/localization`

**在线调试**
- `api-playground-client.tsx` 改为参照 Scalar 弹窗的实现（`create-api-client-modal`）自行挂载：
  - 页面内所有调试块共用一个 workspace store 和 event bus，事件处理只初始化一次。
  - 每个调试块用 Vue `createApp` 渲染 `Operation`（layout 为 modal），挂到 React 持有的 div 上，React 卸载时调用 `app.unmount()`。
- 选用 modal 布局的原因：地址栏不可编辑，鉴权区默认展开，适合文档场景。
  - 副作用：它会渲染一个 fixed 定位的关闭按钮，在 `tokenfunc-docs.css` 中限定作用域隐藏。
- 「在线调试」按钮改为展开/收起开关：
  - `aria-expanded` 和 `aria-controls` 跟随展开状态。
  - 面板在按钮下方原地展开，高 640px，第一次展开才加载。
  - 同一页的多个调试块可以分别展开。
- 界面语言跟随站点：用 `toIntlLocale` 转换后传给 Scalar。
  - Scalar 内置 zh-CN、zh-TW、fr、ru 的翻译；ja、vi 回落到英文。
  - 三期遗留的「面板只有英文」问题由此解决。
- 配色：`light-mode` / `dark-mode` 类加在面板自己的容器上，不再用全局 `querySelectorAll`。
- 依赖：
  - 移除 `@scalar/api-client-react`。
  - 改为直接依赖以下包，均锁定为原来已安装的版本（vue、`@codemirror/state` 仍各只有一份）：
    - `@scalar/api-client` 3.23.5
    - `@scalar/workspace-store` 0.69.2
    - `@scalar/components` 0.33.0
    - `@scalar/use-toasts` 0.10.6
    - `vue` 3.5.44

**右侧目录**
- 新增 `components/docs-toc.tsx`：
  - 固定在视口右侧，默认只显示一列细横线（h2 较长，h3 较短，当前章节加深加长），不占栅格列。
  - 鼠标悬停或键盘聚焦时，在原位浮出完整目录；点击标题跳到对应锚点（标题已有 `scroll-margin-top`）。
  - 收起时是一组横线，不是单个触发元素，`ui/hover-card`（Base UI PreviewCard）承载不了，所以改用 CSS `group-hover` / `group-focus-within` 控制显隐。
- 新增 `hooks/use-active-heading.ts`：监听滚动，取最后一个越过顶部阅读线的标题作为当前章节，并标记 `aria-current="location"`。
- `docs-layout.tsx`：栅格去掉第三列，正文 `max-w-3xl` 放宽到 `max-w-4xl`（768px → 896px）。

**验证**
- 测试：
  - `bunx vitest run src/features/docs`：12 个文件、117 个用例全部通过。
    - 新增 `docs-toc.test.tsx`，覆盖：
      - 少于 2 个标题时不渲染。
      - 链接指向锚点。
      - 当前章节随滚动变化。
    - `playground.test.tsx` 新增：点击后原地展开，`aria-expanded` 同步，再点一次收起。
  - 全量 `bunx vitest run`（在 web/ 下）：321 个文件、3013 个用例全部通过。
  - `bunx tsc -b` 通过。改动文件的 oxlint 无报错，只有 `prefer-query-selector` 警告：`getElementById` 是有意保留的，因为标题 id 可能以数字开头，用 querySelector 会出错。
- 构建：
  - `bun run build` 预渲染 50 页。
  - Scalar 只出现在异步包中，首屏 index.js 和 index.css 里搜不到 scalar-app。
  - 首次展开需要下载：JS 约 0.83MB、CSS 27KB（gzip 后），与弹窗版相当。
- 浏览器（:3001 生产构建，demo_carol，视口宽 1920）：
  - Chat Completions：面板原地展开，Bearer 已填好，点发送后网关返回 `do_request_failed`（示例渠道没有真实上游），说明请求到达了网关。
  - 图片生成页：两个调试块可以分别展开，界面为中文，关闭按钮已隐藏。
  - 切换亮色、暗色时，面板配色跟着变；面板保持展开约 55 秒，期间没有重新挂载。
  - Gemini 页：自动选中 googleKey，`x-goog-api-key` 已填，路径参数 model 为 `gemini-3-pro`。
  - 右侧目录：
    - 默认只显示横线。
    - 悬停时浮出卡片；点「Streaming」后跳转到该节，标题没有被顶栏遮住，高亮跟着变化。
  - 截图：`.tmp/docs-playground-inline-light.jpg`。

**遗留**
- 测试过程中有一次，两个面板都变成了收起状态。当时我刚通过 localStorage 手动切换了界面语言，之后无法复现。
- 内嵌依赖 Scalar 的子路径导出和 `Operation` 的 props。升级 Scalar 时需要回归测试这个面板。
