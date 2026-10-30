Codex 是 OpenAI 官方的命令行编程助手，只支持 OpenAI **Responses** 协议。通过在配置文件里添加一个自定义「模型提供方」接入本站。

- 协议：OpenAI Responses（`/v1/responses`）
- 地址：`{{baseUrl}}/v1`（**带** `/v1`）
- 模型：GPT 系列，例如 `{{model}}`

## 方式一：一键配置脚本（推荐）

在终端运行下面的命令，按提示粘贴密钥、选择默认模型即可。脚本会：

- 用模型列表接口校验密钥（不扣费）
- 没装 Codex 时，用官方方式自动安装
- 在 `~/.codex/config.toml` 写入本站的模型提供方：保留文件里已有的其他设置，原文件自动备份
- 把密钥保存为环境变量 `TOKENFUNC_API_KEY`：macOS / Linux 写进 shell 启动文件，Windows 保存为用户环境变量

:::tabs
@tab macOS / Linux

```bash
curl -fsSL {{baseUrl}}/install/codex.sh | bash
```

@tab Windows

```powershell
# 在 PowerShell 中运行（不是命令提示符 cmd）
irm {{baseUrl}}/install/codex.ps1 | iex
```
:::

:::tip
密钥在运行时输入，不会留在命令历史里。想先看看脚本内容，可以直接打开：[macOS / Linux 版]({{baseUrl}}/install/codex.sh)、[Windows 版]({{baseUrl}}/install/codex.ps1)。
:::

配置完成后**新开一个终端**（密钥环境变量在新终端才生效），然后跳到下面的「启动并验证」一步。

## 方式二：CC Switch 一键导入

装好 [CC Switch](https://github.com/farion1231/cc-switch) 后点下面的按钮，在弹窗里确认应用为 Codex、选好模型即可。

:::cc-switch{app="codex"}
:::

导入后在 CC Switch 里启用这个配置，然后跳到下面的「验证」一步。

## 方式三：手动配置

:::steps
### 安装 Codex

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

@tab Windows

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

@tab npm

```bash
npm install -g @openai/codex
```
:::

### 写入配置文件

把下面的内容写进 Codex 的配置文件。文件已有内容时注意：`model` 和 `model_provider` 两行**必须放在文件最前面**，在任何 `[...]` 小节之前，否则会被当成上一个小节的字段而不生效。

:::tabs
@tab macOS / Linux

```toml title="~/.codex/config.toml"
model = "{{model}}"
model_provider = "tokenfunc"

[model_providers.tokenfunc]
name = "{{siteName}}"
base_url = "{{baseUrl}}/v1"
env_key = "TOKENFUNC_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```

@tab Windows

```toml title="%USERPROFILE%.codex\\config.toml"
model = "{{model}}"
model_provider = "tokenfunc"

[model_providers.tokenfunc]
name = "{{siteName}}"
base_url = "{{baseUrl}}/v1"
env_key = "TOKENFUNC_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```
:::

- `env_key` 表示密钥从名为 `TOKENFUNC_API_KEY` 的环境变量读取，下一步设置它。
- 提供方的名字（`tokenfunc`）可以改，但不能用 `openai`、`ollama`、`lmstudio`，这几个是保留名。

### 设置密钥环境变量

Codex 官方不建议把密钥直接写进配置文件，而是放在环境变量里。

:::tabs
@tab macOS / Linux

```bash
# 写入 shell 配置，新开终端也生效（bash 用户把 ~/.zshrc 换成 ~/.bashrc）
echo 'export TOKENFUNC_API_KEY="{{apiKey}}"' >> ~/.zshrc
source ~/.zshrc
```

@tab Windows

```powershell
# 永久保存，设置后需要重新打开终端
setx TOKENFUNC_API_KEY "{{apiKey}}"
```
:::

### 启动并验证

新开一个终端，运行 `codex`，输入 `/status`，确认 provider 是 `tokenfunc`、model 是你设置的模型。再发一句「Reply with exactly: ok」，收到回复即接入成功。

![Codex 中 /status 的输出，显示 provider 为 tokenfunc 与当前模型](todo:tools/codex-status.png)
:::

## 选择和切换模型

- 默认模型由配置文件里的 `model` 决定。
- 临时换模型：`codex -m {{model}}`，或在会话里输入 `/model`。
- Codex 依赖 Responses 接口和工具调用。部分非 OpenAI 模型可能不完整支持，出现异常时先换回 GPT 系列模型排查。

## 常见问题

| 现象                                       | 原因与处理                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `wire_api = "chat" is no longer supported` | 新版 Codex 已移除 chat 协议，配置里改为 `wire_api = "responses"`                                          |
| 401 / 提示缺少密钥                         | 环境变量没传给 Codex。设置后要新开终端；桌面版 Codex 读不到终端里临时 `export` 的变量，请用上面的永久写法 |
| 404                                        | `base_url` 少了 `/v1`                                                                                     |
| 配置不生效，仍连接 OpenAI 官方             | `model_provider` 写在了某个 `[...]` 小节下面，移到文件开头                                                |
| 流式输出卡住或中途断开                     | 网络代理缓冲了流式响应，检查代理或换网络                                                                  |

其他报错见 [常见问题与排错](/docs/faq)。
