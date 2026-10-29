Hermes Agent 是 Nous Research 开源的命令行 AI 助手，通过「自定义端点」接入本站。

- 协议：OpenAI 兼容（Chat Completions）
- 地址：`{{baseUrl}}/v1`
- 模型：上下文 64K 以上的模型，例如 `{{model}}`

:::warning
新版 Hermes 不再读取 `OPENAI_BASE_URL` 环境变量来接自定义端点（旧教程里的写法已失效），请按下面的向导或配置文件操作。
:::

:::steps
### 安装 Hermes

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

@tab Windows

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```
:::

### 运行配置向导

```bash
hermes model
```

在列表中选择 **Custom endpoint**，然后按提示依次填写：

| 提示项         | 填写                            |
| -------------- | ------------------------------- |
| Base URL       | `{{baseUrl}}/v1`                |
| API key        | `{{apiKey}}`                    |
| Model          | `{{model}}`                     |
| API mode       | `chat_completions`              |
| Context length | 模型的上下文长度，例如 `200000` |

Hermes 要求模型上下文至少 64K，本站不会自动告知上下文长度，所以请手动填写。

![hermes model 向导中 Custom endpoint 的填写界面](todo:tools/hermes-wizard.png)

### 验证

```bash
hermes chat -q "reply ok" --oneshot
```

收到回复即接入成功。也可以运行 `hermes doctor` 检查配置。
:::

## 用配置文件配置

不想用向导时，可以直接编辑配置文件，把密钥放在同目录的 `.env` 里：

:::tabs
@tab macOS / Linux

```yaml title="~/.hermes/config.yaml"
model:
  default: {{model}}
  provider: custom
  base_url: {{baseUrl}}/v1
  key_env: TOKENFUNC_API_KEY
```

```bash title="~/.hermes/.env"
TOKENFUNC_API_KEY={{apiKey}}
```

@tab Windows

```yaml title="%LOCALAPPDATA%\\hermes\\config.yaml"
model:
  default: {{model}}
  provider: custom
  base_url: {{baseUrl}}/v1
  key_env: TOKENFUNC_API_KEY
```

```bash title="%LOCALAPPDATA%\\hermes.env"
TOKENFUNC_API_KEY={{apiKey}}
```
:::

## 切换模型

在会话中输入 `/model custom:模型名` 切换，例如 `/model custom:{{model}}`。要新增一个端点，需要先退出会话，再运行 `hermes model`。

## 常见问题

| 现象                              | 原因与处理                                                             |
| --------------------------------- | ---------------------------------------------------------------------- |
| 设置了 `OPENAI_BASE_URL` 但不生效 | 新版只对官方 OpenAI 提供方生效，改用向导或 config.yaml                 |
| 启动时提示上下文不足              | 模型上下文低于 64K，换一个长上下文模型，或在向导里填写正确的上下文长度 |
| 能连上但回复乱码或报错            | 地址或模型名不对，确认地址带 `/v1`，模型名与 [模型广场](/pricing) 一致 |
| 401                               | 密钥错误或额度用完，到 [API 密钥](/keys) 检查                          |
