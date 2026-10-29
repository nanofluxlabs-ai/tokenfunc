Cline 是 VS Code 里的 AI 编程插件，可以读写文件、执行命令。它支持多种「API 提供方」，接入本站有两种选法：

| 提供方                    | 地址             | 能用的模型                          | 适合                                |
| ------------------------- | ---------------- | ----------------------------------- | ----------------------------------- |
| OpenAI Compatible（推荐） | `{{baseUrl}}/v1` | 本站任意模型，手动填写模型名        | 大多数情况                          |
| Anthropic                 | `{{baseUrl}}`    | 只能从 Cline 内置的 Claude 列表里选 | 只用 Claude、需要完整思考和缓存能力 |

Cline 会频繁调用工具，请选择支持工具调用的模型，例如 `{{model}}`。

## 安装

在 VS Code 扩展市场搜索 **Cline** 并安装，安装后左侧活动栏会出现 Cline 图标。

## 方式一：OpenAI Compatible（推荐）

:::steps
### 打开 API 设置

点击 Cline 面板右上角的齿轮图标，或点击输入框下方当前模型的名字，进入 API 设置。**API Provider** 选择 **OpenAI Compatible**。

### 填写连接信息

| 字段     | 填写             |
| -------- | ---------------- |
| Base URL | `{{baseUrl}}/v1` |
| API Key  | `{{apiKey}}`     |
| Model ID | `{{model}}`      |

Model ID 可以从下拉列表中选（Cline 会自动拉取本站的模型列表），也可以直接输入。

![Cline 的 OpenAI Compatible 设置表单，Base URL、API Key、Model ID 已填写](todo:tools/cline-openai-compatible.png)

### 设置模型参数

展开 **Model Configuration**，按所选模型的实际情况填写：

- **Context Window Size**：模型的上下文长度，例如 Claude 和 GPT 旗舰模型可填 `200000`。不填会使用较小的默认值，长任务可能被提前截断。
- **Max Output Tokens**：单次最大输出，例如 `8192`。
- **Supports Images**：模型支持看图时勾选。

### 验证

在 Cline 里发一个小任务，例如「读一下 README 并用三句话总结」。能看到它读取文件并给出总结，就说明接入成功。
:::

## 方式二：Anthropic

:::steps
### 选择提供方

API Provider 选择 **Anthropic**，在 **Anthropic API Key** 填入 `{{apiKey}}`。

### 改写接口地址

勾选 **Use custom base URL**，填入 `{{baseUrl}}`（**不带** `/v1`）。

![Cline 的 Anthropic 设置，Use custom base URL 已勾选并填写本站地址](todo:tools/cline-anthropic.png)

### 选择模型

从 Model 下拉列表中选择 Claude 模型。这个列表是 Cline 内置的，选中的模型名要和本站的模型名一致才能调用成功，可以在 [模型广场](/pricing) 中核对。
:::

## 小贴士

- Cline 有 Plan（规划）和 Act（执行）两种模式，可以分别配置模型，两边都要配好。
- 想看每次任务花了多少钱，到控制台「使用日志」里查看。

## 常见问题

| 现象                             | 原因与处理                                                        |
| -------------------------------- | ----------------------------------------------------------------- |
| Invalid API Key                  | 密钥填错或额度用完，到 [API 密钥](/keys) 检查                     |
| Model Not Found                  | Model ID 和本站模型名不一致                                       |
| 连接错误 / 404                   | OpenAI Compatible 的地址少了 `/v1`，或 Anthropic 的地址多了 `/v1` |
| 任务做到一半报上下文超长         | Context Window Size 填得比模型实际值大，按模型实际上下文填写      |
| 反复调用同一个工具、输出格式错乱 | 模型能力不足，换用旗舰模型                                        |
