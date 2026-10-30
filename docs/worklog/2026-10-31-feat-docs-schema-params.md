# 文档中心 API 参考：官方规范生成可折叠的完整参数字段树（Responses 样板）

- 日期：2026-10-31
- 分支：worktree-feat-docs-schema-params
- PR：
- 关键 commit：

## 背景

用户要求 API 参考页把 object 类型的请求 / 响应参数完整展示、可逐层展开收起，对齐 OpenAI 官方 reference 的样式；文档的作用是让用户照着就能用，不能因为嵌套深就省略。手写几百个嵌套字段既抄不完也会很快过时，因此改为从官方 OpenAPI 规范生成，先在 Responses 一个接口上做样板，确认后再铺开到其余页面。

## 变更

- 生成脚本 `web/scripts/tokenfunc-docs-schema.ts`（`bun run docs:schema`）：下载官方 `openapi.yaml`（直连失败走 `gh api`），把接口的请求体 / 响应体归一成字段树，具名类型去重存放在 `defs`，按引用懒展开；顶层字段必填在前、其余按字母序，与官方一致。输出 `web/src/features/docs/schemas/<接口>.json`，并列出缺失 / 过期的中文翻译。
- 中文翻译 `schemas/<接口>.zh.json`：按英文原文哈希索引，相同说明只翻一次，官方改了原文会被脚本和测试发现。Responses 共 760 条，已全部翻译。
- 本站差异层 `schemas/<接口>.overlay.json`（手写）：标注本站不转发的参数（access_programs、background、service_tier、safety_identifier、stream_options.include_obfuscation）和本站限制（previous_response_id、conversation、prompt、context_management、prompt_cache_key）。
- 前端：新增 `:::schema{operation part}` 挂件与 `SchemaFields` 组件，子级点开才渲染，JSON 按页面懒加载；样式沿用参数列表，嵌套用左边线缩进。Responses 中英文页的请求参数、响应字段改为字段树。
- 界面文案 9 条，加到 `locales/tokenfunc` 的 7 种语言。

## 验证

- `bunx vitest run src/features/docs`：14 文件 147 用例通过。新增 `api-schema.test.tsx` 覆盖：类型标签、自引用类型逐层展开、翻译齐全无过期、翻译不改动反引号代码、差异层路径存在、点开才显示子字段（aria-expanded）、不转发标记。
- `bun check -b` 无类型错误；`oxlint` 改动范围无 error；`oxfmt --check` 通过。
- 浏览器（前端代理到主 checkout 的 API）检查中英文 Responses 页：`input` → `Input item list` → 各条目类型、`tools` → `Function` → 字段逐层展开正常，本站标记与说明显示正确。

## 遗留

- 其余 8 个 API 页待样板确认后铺开；Anthropic 是否有可直接下载的 OpenAPI 文件待确认，Gemini 需写 discovery 文档的转换。
- SEO 预渲染会省略挂件，Responses 页静态 HTML 里暂时没有参数列表。
- 注意：`bun run format` 会格式化整个 web 目录、改动大量上游文件，本分支只对改动文件单独运行 oxfmt。
