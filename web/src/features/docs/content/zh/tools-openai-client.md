凡是支持「自定义 OpenAI 地址」的软件、插件和 SDK，都能接入本站。不同软件对地址的填法不一样，下面列出常见客户端的填法和通用规则。

## 通用规则

| 软件要求填写的是                                      | 填写                              |
| ----------------------------------------------------- | --------------------------------- |
| API 地址 / API Host / Base URL（软件会自动补 `/v1`）  | `{{baseUrl}}`                     |
| Base URL（软件不会自动补 `/v1`，大多数 SDK 属于这种） | `{{baseUrl}}/v1`                  |
| 完整的接口地址 / Endpoint                             | `{{baseUrl}}/v1/chat/completions` |

拿不准时，先填 `{{baseUrl}}/v1` 试一次，报 404 再改成 `{{baseUrl}}`。很多软件会在设置页预览最终的请求地址，确认它是 `{{baseUrl}}/v1/chat/completions` 即可。

## Cherry Studio

:::steps
### 添加服务商

打开 **设置 → 模型服务**，点击列表底部的 **+ 添加服务商**，填写名称和 API 密钥 `{{apiKey}}`。

### 填写端点

在端点设置的 **OpenAI** 一栏填 `{{baseUrl}}`。Cherry Studio 会自动补 `/v1`，输入框下方会显示最终的请求路径，可以对照确认。要用 Claude 模型的完整能力，可以在 **Anthropic** 一栏同样填 `{{baseUrl}}`。

![Cherry Studio 添加服务商窗口，端点地址与下方的请求路径预览](todo:tools/cherry-studio-provider.png)

### 添加模型并检测

点击 **获取模型列表**，把要用的模型加进来（也可以手动添加 `{{model}}`）。然后点击 **检测**，选一个模型测试连通性，最后打开服务商右上角的启用开关。
:::

## Chatbox

:::steps
### 添加模型提供方

打开 **设置 → 模型提供方**，点击 **添加**，填写名称，**API 模式** 选择 **OpenAI API 兼容**。

### 填写主机和密钥

| 字段     | 填写          |
| -------- | ------------- |
| API 密钥 | `{{apiKey}}`  |
| API 主机 | `{{baseUrl}}` |
| API 路径 | 留空          |

API 路径留空时，Chatbox 会自动补 `/v1/chat/completions`。如果填了 API 路径，主机就要自己带上 `/v1`。

如果选的是 **Claude API 兼容** 模式，API 主机要填 `{{baseUrl}}/v1`。

### 添加模型并检查

在模型区点击 **获取** 拉取模型列表，或点 **新建** 手动添加 `{{model}}`，保存后点击 **检查**。
:::

## 在代码里使用

各语言的 OpenAI SDK 都支持自定义地址，地址带 `/v1`：

:::tabs
@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })
```

@tab 环境变量

```bash
# 多数基于 OpenAI SDK 的工具都会读取这两个变量
export OPENAI_BASE_URL="{{baseUrl}}/v1"
export OPENAI_API_KEY="{{apiKey}}"
```
:::

LangChain、LlamaIndex 等框架的 OpenAI 组件同样传入 `base_url` 和 `api_key` 即可。更多写法见 [调用示例](/docs/examples-chat)。

## 常见问题

| 现象             | 原因与处理                                    |
| ---------------- | --------------------------------------------- |
| 404              | `/v1` 多写或少写了，对照上面的通用规则调整    |
| 获取模型列表为空 | 密钥所在分组没有可用模型，或密钥限制了模型    |
| 401              | 密钥错误或额度用完，到 [API 密钥](/keys) 检查 |
