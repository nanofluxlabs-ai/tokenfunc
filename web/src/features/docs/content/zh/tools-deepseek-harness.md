DeepSeek Harness（命令 `dsh`）是 DeepSeek 开源的 AI Agent 运行时，带一个网页界面，可以添加自定义模型提供商接入本站。

- 协议：OpenAI 兼容，或 Anthropic
- 地址：OpenAI 兼容填 `{{baseUrl}}/v1`，Anthropic 填 `{{baseUrl}}`
- 模型：DeepSeek 等，例如 `{{model}}`

:::warning
DeepSeek Harness 目前是开发者预览版，界面和配置格式可能随版本变化。如果下面的步骤与你看到的不一致，以 [官方仓库](https://github.com/deepseek-ai/deepseek-harness) 的说明为准。
:::

:::steps
### 启动网页界面

需要先安装 [Node.js](https://nodejs.org)。然后运行：

```bash
npx @deepseek-ai/dsh web
```

首次启动要下载依赖，可能需要两分钟左右，期间没有进度提示，请耐心等待。启动后浏览器打开 `http://127.0.0.1:3080`。

### 添加模型提供商

进入 **设置 → 模型 → 添加模型提供商**，把卡片切换到 **自定义模型 API**，填写：

| 字段        | 填写                                          |
| ----------- | --------------------------------------------- |
| Provider ID | `tokenfunc`（只能用小写，保存后**不能修改**） |
| 显示名称    | `{{siteName}}`                                |
| 基础 URL    | `{{baseUrl}}/v1`                              |
| API 协议    | OpenAI Chat Completions                       |
| API 密钥    | `{{apiKey}}`                                  |

![DeepSeek Harness「添加模型提供商」切换到「自定义模型 API」后的表单](todo:tools/dsh-provider.png)

一个提供商只能用一种协议。如果还想用 Claude 模型的 Anthropic 协议，再建一个提供商：Provider ID 换一个名字（例如 `tokenfunc-claude`），API 协议选 Anthropic Messages，基础 URL 填 `{{baseUrl}}`。

### 添加模型

在 **模型目录** 中点击 **获取可用模型**，勾选要用的模型。拉取不到列表时，手动填写模型 ID，例如 `{{model}}`。

![「获取可用模型」弹出的模型勾选列表](todo:tools/dsh-models.png)

### 验证

保存后，在对话框的模型选择器中选择刚添加的模型，发一句话，能收到回复即接入成功。
:::

## 用配置文件配置

也可以在 `~/.dsh/profiles/web/cordis.patch.yml` 中写入提供商（想对所有配置档生效则写在 `~/.dsh/cordis.patch.yml`）：

```yaml title="~/.dsh/profiles/web/cordis.patch.yml"
- id: llm-pi-ai
  config:
    providers:
      tokenfunc:
        apiKeyEnv: TOKENFUNC_API_KEY
        api: openai-completions
        baseURL: {{baseUrl}}/v1
        compat:
          supportsDeveloperRole: false
          maxTokensField: max_tokens
        models:
          - id: {{model}}
```

密钥从环境变量 `TOKENFUNC_API_KEY` 读取，必须在启动 `dsh` **之前**设置：

```bash
export TOKENFUNC_API_KEY="{{apiKey}}"
```

## 常见问题

| 现象                               | 原因与处理                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `MISSING_CREDENTIAL`               | 没有保存密钥，或环境变量是在启动 dsh 之后才设置的                                                       |
| `UNKNOWN_MODEL`                    | 模型没有加到这个提供商下                                                                                |
| 获取模型列表返回 401               | 密钥填错，到 [API 密钥](/keys) 检查                                                                     |
| 地址和密钥都对，但所有请求都被拒绝 | 在提供商的 `compat` 中加上 `supportsDeveloperRole: false` 和 `maxTokensField: max_tokens`（见上方配置） |
| Provider ID 写错了                 | 不能修改，删除后重新创建                                                                                |
