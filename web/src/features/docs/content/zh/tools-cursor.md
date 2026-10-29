Cursor 支持用自己的 OpenAI 密钥并改写接口地址，借此接入本站的模型。设置项在 Cursor 的设置页里，全程是图形界面操作。

- 协议：OpenAI 兼容
- 地址：`{{baseUrl}}/v1`
- 模型：GPT、DeepSeek、Gemini 等，例如 `{{model}}`

:::warning
接入前先了解三个限制：

- **只在对话（Chat）和 Agent 中生效**，Tab 补全和 Apply 仍使用 Cursor 自带模型。
- **模型名不能以 `claude-` 开头**。Cursor 按模型名判断用哪家的密钥，`claude-` 开头的会去找 Anthropic 密钥而报错，所以本站的 Claude 模型无法用这种方式在 Cursor 中使用。
- 打开「改写地址」后，Cursor 自带的 OpenAI 模型请求也会发到本站。想用回 Cursor 自带模型时，要把这个开关关掉。
:::

:::steps
### 打开模型设置

打开 Cursor，进入 **Cursor Settings → Models**，滚动到页面底部，展开 **API Keys**。

![Cursor Settings 的 Models 页面底部，API Keys 区域已展开](todo:tools/cursor-api-keys.png)

### 填写密钥和地址

1. 在 **OpenAI API Key** 输入框粘贴密钥：`{{apiKey}}`
2. 打开 **Use OpenAI API Key** 开关。
3. 打开 **Override OpenAI Base URL** 开关，填入：`{{baseUrl}}/v1`

![OpenAI API Key 已填写、两个开关均已打开、Base URL 已填写的状态](todo:tools/cursor-override.png)

### 添加模型

在同一页面的模型列表中点击 **+ Add Model**，输入本站的模型名，例如 `{{model}}`，回车添加并确保它处于勾选状态。

模型名必须和 [模型广场](/pricing) 里的完全一致。

![模型列表中的 Add Model 输入框，填入了本站模型名](todo:tools/cursor-add-model.png)

### 验证

重启 Cursor，新建一个对话，在模型下拉中选择刚添加的模型，发一句话。能收到回复就说明接入成功。

设置页里的 Verify 按钮只检查能否连通，不检查模型名是否存在，最终以实际对话为准。
:::

## 常见问题

| 现象                                         | 原因与处理                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Model name is not valid / AI Model Not Found | 模型名以 `claude-` 开头，或没有打开 Use OpenAI API Key。换用其他模型，确认两个开关都已打开        |
| 一直转圈、没有响应                           | Cursor 的请求会先经过 Cursor 自己的服务器再转发，本站地址必须能从公网访问。内网或本机地址无法使用 |
| 提示已达到月度用量上限                       | Cursor 团队版、企业版使用自带密钥时仍按其规则计入用量，请联系团队管理员                           |
| 设置里看不到 API Keys 区域                   | 企业管理员禁止了个人密钥，需联系管理员                                                            |
| 401 / 403                                    | 密钥错误、额度不足，或密钥无权使用该模型，见 [常见问题与排错](/docs/faq)                          |
