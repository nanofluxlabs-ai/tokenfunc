每个工具只认一种或两种接口协议，协议决定了地址怎么写、能用哪些模型。先在下表找到你的工具，再点进对应教程。

## 一览表

| 工具                                                   | 形态          | 协议                    | 地址填写                         | 推荐模型                          |
| ------------------------------------------------------ | ------------- | ----------------------- | -------------------------------- | --------------------------------- |
| [Claude Code](/docs/tools-claude-code)                 | 命令行        | Anthropic               | `{{baseUrl}}`                    | Claude 系列                       |
| [Codex](/docs/tools-codex)                             | 命令行        | OpenAI Responses        | `{{baseUrl}}/v1`                 | GPT 系列                          |
| [Cursor](/docs/tools-cursor)                           | 编辑器        | OpenAI 兼容             | `{{baseUrl}}/v1`                 | GPT 等，名字不能以 `claude-` 开头 |
| [Cline](/docs/tools-cline)                             | VS Code 插件  | OpenAI 兼容 / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | 支持工具调用的模型                |
| [Trae](/docs/tools-trae)                               | 编辑器        | OpenAI 兼容 / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | 任意                              |
| [WorkBuddy](/docs/tools-workbuddy)                     | 桌面应用      | OpenAI 兼容             | `{{baseUrl}}/v1`                 | 任意                              |
| [DeepSeek Harness](/docs/tools-deepseek-harness)       | 命令行 / 网页 | OpenAI 兼容 / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | DeepSeek 等                       |
| [Hermes Agent](/docs/tools-hermes)                     | 命令行        | OpenAI 兼容             | `{{baseUrl}}/v1`                 | 上下文 64K 以上的模型             |
| [Pi](/docs/tools-pi)                                   | 命令行        | OpenAI 兼容             | `{{baseUrl}}/v1`                 | 任意                              |
| [OpenClaw](/docs/tools-openclaw)                       | 个人助手      | OpenAI 兼容 / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | 任意                              |
| [Cherry Studio、Chatbox 等](/docs/tools-openai-client) | 聊天客户端    | OpenAI 兼容             | 见教程                           | 任意                              |

表中「/」两侧分别对应两种协议的填法：选 OpenAI 兼容就带 `/v1`，选 Anthropic 就不带。

## 怎么选协议

- **用 Claude 模型**：工具支持 Anthropic 协议就选它，思考、缓存等能力最完整。
- **用 GPT、DeepSeek、Gemini、GLM 等模型**：选 OpenAI 兼容协议。
- **Codex 只能用 Responses 协议**，模型需要支持 Responses 接口，优先选 GPT 系列。

## 编程类工具对模型的要求

Claude Code、Codex、Cline、Cursor 的 Agent 模式等会频繁调用工具（读文件、执行命令），模型必须支持工具调用，而且上下文越长越好。能力较弱的模型可能出现死循环、格式错乱等问题，建议优先使用各家旗舰模型。

## 准备工作

所有教程都需要：

1. 本站的接口地址：`{{baseUrl}}`
2. 一把密钥：在 [API 密钥](/keys) 创建，建议每个工具单独一把。
3. 模型名：从 [模型广场](/pricing) 复制，必须完全一致。

登录后，教程里的配置会自动填入你的 `default` 密钥（没有则用最近创建的一把）和推荐模型，直接复制即可；示例模型可以在页面顶部的「示例模型」里更换。
