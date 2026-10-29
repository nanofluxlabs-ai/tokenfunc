Pi 是一个轻量的命令行编程助手，通过 `models.json` 添加自定义提供方接入本站。

- 协议：OpenAI 兼容（Chat Completions）
- 地址：`{{baseUrl}}/v1`
- 模型：任意，例如 `{{model}}`

:::note
Pi 的项目已迁移到 [earendil-works/pi](https://github.com/earendil-works/pi)，npm 包名改为 `@earendil-works/pi-coding-agent`。旧包 `@mariozechner/pi-coding-agent` 已停止更新。
:::

:::steps
### 安装 Pi

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

@tab Windows

```powershell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

@tab npm

```bash
# 需要 Node.js 22.19 及以上
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```
:::

安装后运行 `pi --version` 确认。Windows 上需要先安装 [Git for Windows](https://git-scm.com/download/win)。

### 添加自定义提供方

把下面的内容写进 Pi 的模型配置文件，文件不存在就新建：

```json title="~/.pi/agent/models.json"
{
  "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": {
    "tokenfunc": {
      "baseUrl": "{{baseUrl}}/v1",
      "api": "openai-completions",
      "apiKey": "{{apiKey}}",
      "models": [
        { "id": "{{model}}", "contextWindow": 200000, "maxTokens": 32000 }
      ]
    }
  }
}
```

- `contextWindow` 和 `maxTokens` 按所选模型的实际能力填写。
- 想用多个模型，就在 `models` 数组里多加几项。
- `apiKey` 也可以写成 `"$TOKENFUNC_API_KEY"`，从环境变量读取，避免密钥明文留在文件里。

### 选择模型并验证

```bash
# 列出本站提供方下的模型
pi --list-models tokenfunc

# 发一条测试消息
pi --model tokenfunc/{{model}} -p "reply ok"
```

收到回复即接入成功。日常使用时，在 Pi 里输入 `/model` 选择模型，按 `Ctrl+S` 设为默认。
:::

## 常见问题

| 现象                        | 原因与处理                                                              |
| --------------------------- | ----------------------------------------------------------------------- |
| `/model` 里看不到本站的模型 | JSON 缺少最外层的 `providers`；或 `apiKey` 写成了环境变量但变量没有设置 |
| 404                         | `baseUrl` 少了 `/v1`                                                    |
| 401                         | 密钥错误或额度用完，到 [API 密钥](/keys) 检查                           |
| 照旧教程配置后不生效        | 旧写法把提供方放在根上、字段名用 `context`，均已失效，按上面的格式重写  |
