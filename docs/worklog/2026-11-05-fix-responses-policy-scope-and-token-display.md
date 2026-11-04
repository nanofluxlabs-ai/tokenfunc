# chat→responses 策略默认范围 fail-closed、高级自定义路由按转换后路径匹配、日志输入口径统一

- 日期：2026-11-05
- 分支：main
- PR：
- 关键 commit：

## 背景

黑鹰反馈使用日志的 token 列「输入」突然包含了缓存命中部分（例如输入 196,531 / 缓存读取 195,712，而前一天同类请求显示 718 / 678,272）。排查后发现不是展示代码改了，而是 2026-11-04 12:00 管理员在系统设置保存了 `global.chat_completions_to_responses_policy`，值为 `{"enabled":true,"channel_types":[57],"model_patterns":[".*"]}`，之后：

- 8 号 Sub2API 渠道的 `/v1/messages` 从「Claude Messages 直通」变成「Claude Messages → OpenAI Responses」，上游 usage 从 Anthropic 语义（`input_tokens` 不含缓存）变成 OpenAI 语义（含缓存）。
- 9 号 codex2api（高级自定义）渠道的 chat 请求开始报 400 `Field 'messages' is required`。

## Bug 根因

1. **策略范围静默扩大到全部渠道**：`ChatCompletionsToResponsesPolicy` 默认值是 `AllChannels: true`，而配置加载（启动时 `LoadFromDB` 与界面保存都走 `config.updateConfigFromMap`）对结构体字段用 `json.Unmarshal` 合并进现有值，JSON 里没写的字段保留默认值。管理员只写 `channel_types` 没写 `all_channels`，运行时就成了 enabled + all_channels=true，对所有渠道、所有模型生效。该策略在 `relay/claude_handler.go` 对 `/v1/messages` 同样生效。
2. **高级自定义渠道按原始路径匹配路由**：请求被 `textRequestViaResponses` 转成 Responses 后，`RelayMode` 与 `RequestURLPath` 已改为 `/v1/responses`，但 `advancedcustom.incomingRequestPath` 仍用 `c.Request.URL.Path`（`/v1/chat/completions`），于是只有 `input` 的 Responses 请求体被发到上游的 chat 端点，上游报缺 `messages`。直连回放、渠道测试、`/v1/responses` 都正常，正是因为它们没经过这条转换。
3. **日志输入口径随协议变化**：前端 token 列原样显示 `prompt_tokens`，Anthropic 语义为净值、OpenAI 语义为含缓存总量，同一渠道不同协议的请求显示口径不一致，与计费拆分（非 Anthropic 语义按 `prompt − cache` 收全价）和 Claude Code 客户端看到的数字也不一致。

影响范围：策略保存（11-04 12:00）到黑鹰手动补上 `"all_channels": false`（11-05 00:00 前后）之间，所有渠道的 chat / messages 请求都被转成 Responses；9 号渠道 chat 全部 400；计费金额不受影响（结算按各自语义正确拆分）。

## 变更

- `setting/model_setting/global.go`：默认 `AllChannels` 改为 false；新增 `ValidateChatCompletionsToResponsesPolicyJSON`，启用时必须指定 `all_channels` / `channel_ids` / `channel_types` 之一，模型正则必须可编译，否则拒绝保存。`model/option.go` 的 `validateOptionValue` 接入。
- `relay/channel/advancedcustom/adaptor.go`：`incomingRequestPath` 在 `RelayMode == Responses` 时按 `info.RequestURLPath` 匹配路由。
- 前端 `web/src/features/usage-logs/lib/token-usage.ts`：统一口径函数，非 Anthropic 语义时输入 = `prompt_tokens − cache_read − cache_write`（不小于 0）；Anthropic 语义、带 5m/1h 缓存写入拆分、或只带 `cache_creation_tokens` 而无 12h 写入的旧 Claude 行保持原值。桌面列表与手机卡片共用；列头提示文案改为「输入只统计未命中缓存的部分」。
- `model/tokenfunc_log_stat.go`：统计徽标的 `is_net` 判定与前端同一规则（补上 5m/1h 拆分与 12h 写入的区分）。
- i18n：新增 4 个 key（提示文案 + 3 条校验消息），补齐 `locales/tokenfunc/` 7 个语言文件。

## 验证

- `GOWORK=off go build ./...` 通过；`go test ./setting/model_setting/`（新增：合并缺 `all_channels` 的 JSON 后 8 号 / 类型 59 不命中、校验表驱动用例）通过；`go test ./relay/channel/advancedcustom/ -run 'Converted|PlainChat|Playground'` 通过，并反向验证：去掉修复后 `TestAdaptorConvertedResponsesRequestMatchesResponsesRoute` 失败。`TestAdaptorMasksDialedHostsInDialFailure` 本地失败与改动无关（本地代理解析域名）。
- `make test-db PKG='./model/'` 通过（含统计 SQL）。
- 前端 `bunx vitest run src/features/usage-logs` 30 文件 475 用例通过（新增口径函数单测 7 条、列单元格 2 条、手机卡片 1 条）；`bunx tsc -b` 通过；`bun run i18n:sync` 后 diff 只有新增行。
- 生产复核（只读）：黑鹰补上 `all_channels:false` 后，9 号渠道游乐场 gpt-6.1-sol 链路恢复为 `OpenAI Compatible` 且 200。

## 遗留

- 生产 8 号渠道在 11-04 17:23 到 22:40 之间的 104 条 `/v1/messages` 日志保留 OpenAI 语义的 `prompt_tokens`，前端新口径会按减法显示净值，不回填数据。
- 上游 `updateConfigFromMap` 对所有结构体字段都是合并语义，其它设置如有「默认 true、JSON 省略」的布尔字段也会有同样问题，本次只修了这一个策略。
