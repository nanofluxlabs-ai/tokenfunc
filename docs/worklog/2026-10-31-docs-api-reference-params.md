# 文档中心 API 参考页参数对齐官方规范

- 日期：2026-10-31
- 分支：main
- PR：
- 关键 commit：

## 背景

用户要求审查文档中心 API 参考页的请求 / 响应参数是否有缺失，并与官方规范对齐。审查口径：参数表 = 网关实际会转发且生效的参数 + 按模型区分的生效说明，不照搬官方全量参数；网关不转发的参数一句话写明。

## 变更

只改文档，`web/src/features/docs/content/{zh,en}/` 下 9 个 API 页，中英文逐项对应：

- Chat Completions：主推 `max_completion_tokens`，`max_tokens` 标为兼容旧写法；补 `reasoning`、penalty、`logprobs`、`prompt_cache_key`、`web_search_options`、`developer` 角色等；注明 `n` / penalty / `logprobs` 对 Claude、Gemini 无效；响应补 `refusal`、`annotations`、`reasoning_tokens`、`content_filter`。
- Responses：写明 `previous_response_id` 仅 OpenAI 原生模型可用、多渠道需同一 `prompt_cache_key`；补 `text`、`include`、`reasoning.summary`、`store` 等；新增响应字段表；effort 取值与 Chat 页统一。
- Messages：思考改为推荐 `adaptive` + `output_config.effort`，旧 `enabled` + `budget_tokens` 写明适用范围；移除 `temperature` 并说明新模型会 400；新增请求头表；补 `output_config`、顶层 `cache_control`、`stop_reason` 全部 7 个取值、`usage` 缓存 5m/1h 细分等。
- Gemini：新增响应字段表；补 `safetySettings`、`toolConfig`、`cachedContent`、`generationConfig` 子表；`tools` 含内置工具。
- 图片生成 / 编辑：补 gpt-image 系列参数（stream、partial_images、background、output_format 等）、`usage`、流式小节；`response_format` 标废弃；编辑支持 JSON、`image[]` 最多 16 张。
- 模型列表 / 错误 / 鉴权：补 Anthropic、Gemini 格式字段，常见错误码表，分组不可用 403。
- 各页参数表下统一一句：只列常用参数、链官方文档、列出本站不转发的参数。

## 验证

- `bunx vitest run src/features/docs`：13 文件 139 用例通过（含中英文齐全、变量名、站内锚点检查）。
- `bunx oxfmt` 格式化 18 个文件。
- 关键结论抽查代码：`relaykit/relayconvert/internal/oai_responses/to_oai_chat_req.go` 的 `previous_response_id` 报错、`relay/common/relay_info.go` 默认删除 `service_tier` / `safety_identifier`。
- Claude 思考 / 采样参数的模型版本行为来自官方文档（platform.claude.com），未实际调用上游验证。

## 遗留

- 网关代码问题（另开任务）：Claude 接口 `max_tokens: 0` 被替换为默认值，官方缓存预热用法失效（`relay/channel/claude/adaptor.go`）；图片编辑 multipart + `gpt-image-1` 时 quality 默认值被设为 DALL·E 的 `standard`（`relay/helper/valid_request.go`）；图片请求丢弃 `safety_identifier`、`markup`。
- Chat 页通用 `temperature` 说明未区分 Claude 新模型通过转换后是否同样 400，待确认。
