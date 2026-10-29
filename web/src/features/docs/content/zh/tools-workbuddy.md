WorkBuddy 是腾讯推出的 AI 办公与编程助手桌面应用，可以在「自定义模型」里接入本站。它**只支持 OpenAI 兼容格式**。

- 协议：OpenAI 兼容（Chat Completions）
- 地址：`{{baseUrl}}/v1`
- 模型：任意，例如 `{{model}}`

:::tip
请先升级到最新版本。界面配置自定义模型需要 4.8.0 及以上版本，较早版本还有回复为空等已修复的问题。下载地址：[workbuddy.cn](https://workbuddy.cn)
:::

:::steps
### 打开模型设置

点击左下角头像，进入 **设置 → 模型**，点击 **添加模型**。

![WorkBuddy 设置中的模型页面与「添加模型」按钮](todo:tools/workbuddy-models.png)

### 选择自定义供应商并填写

供应商选择 **自定义**，然后填写：

| 字段    | 填写             |
| ------- | ---------------- |
| URL     | `{{baseUrl}}/v1` |
| API Key | `{{apiKey}}`     |
| 模型名  | `{{model}}`      |

WorkBuddy 会自动在地址后面补上 `/chat/completions`，所以这里只填到 `/v1`。

![自定义模型弹窗，URL、API Key、模型名已填写](todo:tools/workbuddy-custom.png)

### 按需设置模型能力

在 **高级配置** 中按模型实际能力勾选「支持工具调用」「支持图片输入」等。不确定时保持默认。

如果你打开了高级配置里的 **自定义协议** 开关，URL 需要填完整路径：`{{baseUrl}}/v1/chat/completions`。

### 保存并验证

保存后，在对话框的模型选择器中找到「自定义模型」分组，选中刚添加的模型，发一句话确认能收到回复。

首次使用时 WorkBuddy 可能弹出「中转服务风险提醒」，这是它检测到非官方地址时的提示，确认地址是 `{{baseUrl}}` 后继续即可。
:::

## 用配置文件批量添加

需要添加多个模型时，也可以直接编辑配置文件 `~/.codebuddy/models.json`（Windows 为 `%USERPROFILE%\.codebuddy\models.json`），保存后无需重启。注意这里的 `url` 必须是**完整路径**：

```json title="~/.codebuddy/models.json"
{
  "models": [
    {
      "id": "{{model}}",
      "name": "{{siteName}} {{model}}",
      "vendor": "OpenAI",
      "apiKey": "{{apiKey}}",
      "url": "{{baseUrl}}/v1/chat/completions",
      "maxInputTokens": 200000,
      "maxOutputTokens": 8192,
      "supportsToolCall": true,
      "supportsImages": false
    }
  ]
}
```

文件需保存为 UTF-8 编码（不带 BOM），否则可能读取失败。

## 常见问题

| 现象                   | 原因与处理                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| 404                    | 界面里 URL 少了 `/v1`；或打开了「自定义协议」却没写完整路径；或 models.json 里 `url` 只写到 `/v1` |
| 401                    | 密钥填错或额度用完，到 [API 密钥](/keys) 检查                                                     |
| 看不到「自定义」供应商 | 企业版管理员禁用了自定义模型，联系管理员                                                          |
| 添加后模型不显示       | 模型 ID 和内置模型重名，换一个模型名，或升级到最新版                                              |
| 发图片报 400           | 所选模型不支持看图，或没有勾选「支持图片输入」                                                    |
