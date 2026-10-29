# 文档中心改版三期：API 在线调试与 Gemini 原生接口

- 日期：2026-10-30
- 分支：worktree-feat-docs-api-playground
- PR：
- 关键 commit：

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
