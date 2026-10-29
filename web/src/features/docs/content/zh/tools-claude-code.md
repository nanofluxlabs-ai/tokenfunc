Claude Code 是 Anthropic 官方的命令行编程助手，走 Anthropic 协议。只需要告诉它两件事：本站地址和你的密钥。

- 协议：Anthropic Messages
- 地址：`{{baseUrl}}`（**不带** `/v1`，Claude Code 会自己拼接 `/v1/messages`）
- 模型：Claude 系列，例如 `{{model}}`

## 方式一：CC Switch 一键导入（推荐）

[CC Switch](https://github.com/farion1231/cc-switch) 是一个管理 Claude Code、Codex 配置的桌面小工具，装好后点下面的按钮，地址、密钥和模型会自动写进去，不用手动改任何文件。

:::cc-switch{app="claude"}
:::

![CC Switch 弹出的导入确认窗口，显示本站地址与模型](todo:tools/claude-code-ccswitch.png)

导入后在 CC Switch 里启用这个配置，然后直接跳到下面的「验证」一步。

## 方式二：手动配置

:::steps
### 安装 Claude Code

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

@tab Windows

```powershell
irm https://claude.ai/install.ps1 | iex
```

@tab npm

```bash
# 需要 Node.js 22 及以上
npm install -g @anthropic-ai/claude-code
```
:::

Windows 用户建议先安装 [Git for Windows](https://git-scm.com/download/win)，Claude Code 执行命令时会用到 Bash。

### 写入配置文件

打开 Claude Code 的全局配置文件，把下面的内容写进去。文件不存在就新建；已有内容时，把这三项合并进已有的 `env` 里。

:::tabs
@tab macOS / Linux

```json title="~/.claude/settings.json"
{
  "env": {
    "ANTHROPIC_BASE_URL": "{{baseUrl}}",
    "ANTHROPIC_AUTH_TOKEN": "{{apiKey}}",
    "ANTHROPIC_MODEL": "{{model}}"
  }
}
```

@tab Windows

```json title="%USERPROFILE%.claude\\settings.json"
{
  "env": {
    "ANTHROPIC_BASE_URL": "{{baseUrl}}",
    "ANTHROPIC_AUTH_TOKEN": "{{apiKey}}",
    "ANTHROPIC_MODEL": "{{model}}"
  }
}
```
:::

:::note
也可以用环境变量临时设置（只对当前终端窗口生效）。配置文件的优先级高于环境变量，两边都写时以配置文件为准。

:::tabs
@tab macOS / Linux

```bash
export ANTHROPIC_BASE_URL="{{baseUrl}}"
export ANTHROPIC_AUTH_TOKEN="{{apiKey}}"
```

@tab Windows

```powershell
$env:ANTHROPIC_BASE_URL = "{{baseUrl}}"
$env:ANTHROPIC_AUTH_TOKEN = "{{apiKey}}"
```
:::

:::

### 启动并验证

在任意项目目录运行 `claude`，进入后输入 `/status`。如果「Anthropic base URL」一行显示的是 `{{baseUrl}}`、「Auth token」一行显示来自 `ANTHROPIC_AUTH_TOKEN`，说明配置已生效，随便问一句话确认能收到回复。

![Claude Code 中 /status 的输出，高亮 Anthropic base URL 与 Auth token 两行](todo:tools/claude-code-status.png)
:::

## 选择和切换模型

- 默认模型由配置里的 `ANTHROPIC_MODEL` 决定。
- 临时换模型：启动时加参数 `claude --model {{model}}`。
- Claude Code 的后台小任务（生成标题、总结等）会用一个快速模型，可以用 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 指定，例如本站的 Haiku 系列模型；不设置时使用默认值。

模型名必须和 [模型广场](/pricing) 里的完全一致。

## 在 VS Code 插件里使用

从桌面图标启动的 VS Code 读不到终端里 `export` 的变量。按上面的方式写进 `~/.claude/settings.json` 即可，插件和命令行共用这个文件。

## 常见问题

| 现象                                                             | 原因与处理                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 启动后仍要求登录 Anthropic 账号                                  | 配置只写在了项目目录的 `.claude/settings.json` 里。写到用户目录下的全局配置文件        |
| 提示 auth conflict（认证冲突）                                   | 本机还保留着 claude.ai 的登录，在 Claude Code 里执行 `/logout`                         |
| 404                                                              | `ANTHROPIC_BASE_URL` 末尾多了 `/v1`，去掉                                              |
| 401                                                              | 密钥错误，或密钥额度用完。到 [API 密钥](/keys) 检查                                    |
| 模型不存在 / 无可用渠道                                          | 模型名拼错，或密钥分组不含该模型                                                       |
| `400 ... context_management` 或 `Extra inputs are not permitted` | 在 `env` 里加 `"CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1"`                          |
| `400 ... adaptive`                                               | 所选模型不支持自适应思考，在 `env` 里加 `"CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING": "1"` |

其他报错见 [常见问题与排错](/docs/faq)。
