# 文档中心 API 参考：从官方规范生成可折叠的完整参数字段树

- 日期：2026-10-31
- 分支：worktree-feat-docs-schema-params
- PR：#75
- 关键 commit：ea196f582（Responses 样板）、46bde85c6（铺开到其余页面）

## 背景

用户要求 API 参考页把 object 类型的请求 / 响应参数完整展示、可逐层展开收起，对齐 OpenAI 官方 reference 的样式；文档的作用是让用户照着就能用，不能因为嵌套深就省略。手写几百个嵌套字段既抄不完也会很快过时，因此改为从官方规范生成：先在 Responses 上做样板，用户确认后铺开到 Chat Completions、图片生成、图片编辑、Anthropic Messages、Gemini。

## 变更

- 生成脚本 `web/scripts/tokenfunc-docs-schema.ts`（`bun run docs:schema [--cached] [--prune]`）与三个解析器 `web/scripts/tokenfunc-docs-schema/`：
  - `openapi.ts`：OpenAI 官方 `openapi.yaml`（直连失败走 `gh api`），allOf 合并、anyOf/oneOf 归为多选一、可空类型；图片编辑取 multipart 请求体。
  - `anthropic.ts`：Anthropic 没有公开 OpenAPI，解析官方 API 参考的 Markdown 版（缩进嵌套的字段列表），只写类型名的引用文档末尾 Domain types 里的定义；取值缩写成 `or N more` 时以逐行列出的取值为准。
  - `gemini.ts`：Gemini discovery 文档，说明以 "Required." 开头的视为必填，枚举逐项说明并入字段说明，过滤 `_UNSPECIFIED` 占位值和下划线内部字段。
  - 输出 `web/src/features/docs/schemas/<接口>.json`；中文说明 `<接口>.zh.json` 按英文原文哈希索引，跨接口复用已有译文；缺失清单写到 `.tmp/docs-schema/`。
- 本站差异层 `<接口>.overlay.json`（手写）：标注本站不转发的参数（service_tier、safety_identifier、moderation、markup、inference_geo、speed、diagnostics、Gemini 的 serviceTier/store/labels 等）和本站限制（previous_response_id、max_tokens 自动转换 / 传 0 被替换、n 与 penalty 对 Claude/Gemini 无效、response_format 对 Claude 无效等）。
- 前端：`:::schema{operation part}` 挂件与 `SchemaFields` 组件，子级点开才渲染，按接口懒加载；请求参数上方统一显示来源说明与官方文档链接（不再在每页 Markdown 里重复）。
- 6 个页面（中英文）的请求参数 / 响应字段改为字段树，页面里的补充说明（请求头表、stop_reason 取值表、Gemini 图片 parts 写法等）保留。模型列表页没有换：官方只有 4 个平铺字段，本站扩展字段和 Anthropic / Gemini 格式只在手写表里有。
- 界面文案 11 条，加到 `locales/tokenfunc` 的 7 种语言。

## 验证

- `bunx vitest run src/features/docs`：14 文件 167 用例通过。`api-schema.test.tsx` 覆盖：类型标签、自引用类型逐层展开、每个接口翻译齐全无过期、翻译不改动代码（区分 ``` 多行代码块与行内代码）、差异层路径存在、点开才显示子字段（aria-expanded）、不转发标记。
- `bun check -b` 无类型错误；`oxlint` 改动范围无 error；`oxfmt --check` 通过；`bun run docs:schema --cached` 重跑无差异。
- 翻译：共约 2000 条（Responses 760、其余 919），分批翻译，每批校验键集合与反引号片段一致。
- 浏览器（前端代理到主 checkout 的 API）检查中英文 Responses、Messages、Gemini 页：`input` → 条目类型、`thinking` → `ThinkingConfigAdaptive` → `display`、`generationConfig` → `thinkingConfig` 等逐层展开正常，本站标记与说明显示正确。

## 遗留

- SEO 预渲染会省略挂件，这些页面的静态 HTML 里暂时没有参数列表。
- 官方规范更新后需手动跑 `bun run docs:schema` 并补翻译；尚未接入定时检查。
- Anthropic 的 Markdown 格式若改版，解析器需要跟着调整。
- 注意：`bun run format` 会格式化整个 web 目录、改动大量上游文件，本分支只对改动文件单独运行 oxfmt。
