OpenClaw 是运行在你自己电脑上的开源个人 AI 助手，可以接入聊天软件。它支持添加自定义模型提供方，OpenAI 兼容和 Anthropic 两种格式都能用。

- 协议：OpenAI 兼容，或 Anthropic
- 地址：OpenAI 兼容填 `{{baseUrl}}/v1`，Anthropic 填 `{{baseUrl}}`
- 模型：任意，例如 `{{model}}`

## 方式一：配置向导

:::steps
### 运行向导

```bash
openclaw onboard
```

选择 **More… → Custom Provider**。

![openclaw onboard 中的 Custom Provider 选项](todo:tools/openclaw-onboard.png)

### 填写提供方信息

| 提示项        | OpenAI 兼容       | Anthropic            |
| ------------- | ----------------- | -------------------- |
| Base URL      | `{{baseUrl}}/v1`  | `{{baseUrl}}`        |
| API key       | `{{apiKey}}`      | `{{apiKey}}`         |
| Compatibility | OpenAI-compatible | Anthropic-compatible |
| Model ID      | `{{model}}`       | `{{model:claude}}`   |

选 OpenAI 兼容时，向导会自动拉取本站的模型列表供选择；选 Anthropic 时需要手动填写模型 ID。保存前向导会实际调用一次，确认能收到回复。

### 验证

```bash
openclaw models list --provider tokenfunc
```

能列出本站的模型即配置成功。向导生成的提供方名默认是 `custom-` 加域名，上面命令里的 `tokenfunc` 换成实际的名字。
:::

## 方式二：一行命令

```bash
openclaw onboard --non-interactive --auth-choice custom-api-key \
  --custom-provider-id tokenfunc \
  --custom-base-url "{{baseUrl}}/v1" \
  --custom-model-id "{{model}}" \
  --custom-api-key "{{apiKey}}" \
  --custom-compatibility openai
```

## 方式三：编辑配置文件

配置文件是 `~/.openclaw/openclaw.json`（JSON5 格式，可以写注释），修改后会自动生效：

```json5 title="~/.openclaw/openclaw.json"
{
  agents: { defaults: { model: { primary: 'tokenfunc/{{model}}' } } },
  models: {
    mode: 'merge',
    providers: {
      tokenfunc: {
        baseUrl: '{{baseUrl}}/v1',
        apiKey: '{{apiKey}}',
        api: 'openai-completions',
        models: [
          {
            id: '{{model}}',
            name: '{{model}}',
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
}
```

- 要用 Anthropic 格式，把 `baseUrl` 改为 `{{baseUrl}}`、`api` 改为 `"anthropic-messages"`。
- 模型要支持看图，在模型上加 `input: ["text", "image"]`。
- 切换默认模型：`openclaw models set tokenfunc/{{model}}`。

## 常见问题

| 现象                                    | 原因与处理                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| 模型不可用 / not allowed by modelPolicy | 模型只写在了 `agents.defaults` 里，必须同时写进 `providers.tokenfunc.models` |
| 提示 returned no token usage            | 在模型上加 `compat: { supportsUsageInStreaming: true }`                      |
| 上游不接受 reasoning_effort             | 在模型上加 `compat: { supportsReasoningEffort: false }`                      |
| 404                                     | OpenAI 兼容格式的 `baseUrl` 少了 `/v1`                                       |
| 改了 `openclaw configure` 不生效        | 提供方要通过 `openclaw onboard` 或配置文件修改                               |
