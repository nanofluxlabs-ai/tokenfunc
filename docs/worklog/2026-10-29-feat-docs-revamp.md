# 文档中心改版一期：Markdown 正文、真实示例参数、SEO 预渲染

- 日期：2026-10-29
- 分支：worktree-feat-docs-revamp
- PR：
- 关键 commit：

## 背景

用户反馈文档中心不好用：缺少模型调用示例、第三方工具的详细教程（普通用户不会配置）、没有在线调试。

问题根源是写作成本太高。每页都是 TSX，每句话都是一个 i18n 键，要同步维护 7 种语言。结果模块写了 5000 多行，只撑起 16 页单薄的内容。

另外几处问题：
- 示例里的模型名写死了，用户照抄会报「模型不存在」。
- 密钥以环境变量的写法给出，普通用户在第一步就卡住。
- Pi、Hermes 的旧教程照抄后已经跑不通：上游配置格式变了，Pi 的项目也迁移了。

改版分三期，每期一个 PR：
1. 一期（本 PR）：内容体系、SEO、真实示例参数、工具教程。
2. 二期：连接自检。
3. 三期：Scalar API 参考与在线调试。

## 变更

### 正文

- 改为 `web/src/features/docs/content/{zh,en}/<slug>.md`，只写中文和英文，其余界面语言看英文。
- 自研轻量指令语法，解析器为 `lib/doc-markdown.ts`，浏览器渲染和构建期预渲染共用。
  - `:::steps` 步骤（以 `###` 分步）、`:::tabs` 标签页（以 `@tab` 分隔）、`:::tip|note|warning` 提示框。
  - 交互组件：`:::cc-switch{app=...}`、`:::base-url`、`:::contact-sales`。
  - 代码块标题写法：```` ```json title="路径" ````。
  - 截图占位写法：`![说明](todo:文件名)`。
- 共 23 页，按 4 组归类，顺序为：开始使用 / API 参考 / 企业客户 / 三方工具接入。侧栏分组可折叠，折叠状态记在本浏览器；当前页所在分组会自动展开。
  - 新增「基础概念」「常见问题与排错」「选择接入方式」三页。
  - 新增 Cursor、Cline、Trae、DeepSeek Harness 四篇工具教程。
  - 调用示例不单独成组，按单页加右侧目录并入对应接口页：
    - Chat Completions：多轮对话、思考模型、图片理解、工具调用、结构化输出、缓存命中。
    - Anthropic Messages：流式、thinking、图片、工具调用、提示词缓存。
    - Responses：流式、多轮、思考强度。
  - 所有代码示例的第一个标签都是 cURL；同名标签在整页联动。
  - 原有页面全部按 2026-10 的官方文档和网关代码重写。
- 正文语言跟随站点导航的界面语言（简繁中文看中文正文，其余看英文），地址上的 `?lang` 随之同步；文档页内不再单独提供语言切换。

### 示例参数

- 页面顶部有「示例参数」区。登录用户的示例自动填入名为 `default` 的启用密钥，没有则用最近创建的一把；页面上不展示密钥、也不提供选择（用户要求），只在代码里填入。密钥明文按需从 `/api/token/:id/key` 获取，只保存在内存里。
- 模型从本站真实可用的模型中按系列挑选：已登录用户取 `/api/user/models`，访客取 `/api/pricing`；用户也可以手动改。
- 以上取值实时替换正文里的 `{{baseUrl}}`、`{{apiKey}}`、`{{model}}`、`{{model:<系列>}}`、`{{siteName}}`。
- CC Switch 对话框新增 `defaultApp` 参数，文档页按教程预选 Claude 或 Codex。

### SEO

- `web/scripts/tokenfunc-docs-prerender.ts` 在 `rsbuild build` 之后，把每页预渲染为 `dist/docs-seo/<lang>/<slug>.html`，并生成 `manifest.json`。`build` 脚本已追加这一步。
- `router/web_docs_seo.go` 在返回 `/docs/*` 时处理首屏：
  - 注入页面标题、description、canonical、hreflang、og 标签和 `<html lang>`。
  - 预渲染正文放在 `#root` 之后的兄弟节点，因为 `main.tsx` 只在 `#root` 为空时才挂载。应用挂载后，内联样式会把它隐藏。
  - 站点地址和站点名在请求时替换，白标部署不需要重新构建。
- 新增动态的 `/sitemap.xml`（含 hreflang）和 `/robots.txt`。
- 语言由地址决定：`/docs/x` 为中文，`?lang=en` 为英文，保证同一地址对搜索引擎内容稳定。

### 清理

- 删除旧的 TSX 页面、配套组件和 `lib/samples.ts`。
- 清理 tokenfunc 翻译叠加文件中只被旧文档页使用的键（246 个）。
- 新增 12 条界面文案，补齐 7 种语言。

### 上游文件改动

- `router/web-router.go`：约 10 行接入代码。
- `web/package.json`：`build` 脚本追加预渲染。
- `web/rsbuild.config.ts`：新增 `assetsInclude: /\.md$/`。
- 样式从 `tokenfunc-theme.css` 引入，没有改上游的 `index.css`。

## 验证

- `bunx vitest run src/features/docs src/features/keys`：14 个文件、166 个用例全部通过。
  - 新增覆盖：解析器、全部 58 个正文文件（存在、可解析、变量名、组件名、站内链接、`/docs-assets/` 截图文件存在）、注册表、模型挑选、渲染组件（变量替换、同名标签页联动、站内链接走路由、截图占位）。
- `bunx vitest run` 全量：313/315 个文件通过。
  - 失败的 `metadata-editing`、`visual-billing-editor` 两个文件单独重跑全部通过（46/46），是全量并发下的耗时问题，与本次改动无关。
- `go test ./router/ -count=1`：通过，新增 `web_docs_seo_test.go`。
- `bunx tsc -b`、相关文件的 `oxlint`、`gofmt`、`go vet ./router/`：均无问题。
- `bun run build`：46 页（23 页 × 2 种语言）预渲染完成。
- `make api` 后用 curl 检查：
  - `/docs/tools-cursor` 返回中文标题、description、canonical 和 hreflang，正文里没有残留占位符。
  - `?lang=en` 返回英文页。
  - `/sitemap.xml`、`/robots.txt` 输出正确。
- 浏览器（worktree 的 :3001 与 :5174，demo_carol 账号）：
  - 未登录：页面正常渲染，示例模型自动取 `claude-sonnet-5`。
  - 登录后选中密钥：配置文件里填入了真实密钥。
  - 切换 Windows 标签时，整页同名标签一起切换。
  - 英文页正常；CC Switch 对话框会按教程预选 Codex。
  - 第二轮：已登录时自动选中 `default` 密钥；代码标签默认是 cURL；在导航语言菜单切到 English 后，正文变为英文且地址变为 `?lang=en`，切回简体中文后 `?lang` 去掉；工具分组可以折叠；右侧目录的跨小节锚点能正常跳转。

## 遗留

1. 18 张截图待补充。放到 `web/public/docs-assets/` 后，把正文里的 `todo:xxx.png` 改成 `/docs-assets/xxx.png`。测试会校验文件是否存在。
2. DeepSeek Harness 用 Anthropic 协议时，地址不带 `/v1` 是推断，未实测；Trae 是否要求公网地址也未证实。正文已按官方文档的写法给出。
3. CC Switch 对话框没有预填当前的示例模型，需要用户自己选。
4. 正文语言跟随界面语言，没有对爬虫做特殊处理（用户选择）。执行 JS 的爬虫，比如浏览器语言为英文的 Googlebot，可能会把中文地址渲染成英文；不执行 JS 的爬虫看到的仍是服务端注入的中文预渲染内容。
5. 自动选中默认密钥时，每次整页加载会调用一次 `/api/token/:id/key`，计入该接口的关键操作限流。
6. 二期做连接自检，三期做 Scalar API 参考与在线调试，并补齐 embeddings、rerank、音频等接口。
