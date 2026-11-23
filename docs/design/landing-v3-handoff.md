# 落地页 v3 重构 — Claude Code 交接手册

> 交接日期：2026-11-22　｜　决策人：黑鹰　｜　工作方式：直接在 `main` 上提交
> 原型：Claude Design 项目「Tokenfunc 交互落地页设计」中的页面 `tokenfunc Landing v3`
> 原型源码已随本手册附上：`landing-v3-prototype.dc.html`（建议放到 `docs/design/landing-v3-prototype.dc.html`）

---

## 0. 先读这一节

1. **原型是规格，不是代码**。`landing-v3-prototype.dc.html` 是 Claude Design 的 `.dc.html` 格式（内联样式 + `{{ }}` 模板 + 一个 `DCLogic` 类），不能直接搬进项目。用它来核对文案、间距、字号、颜色、交互时序；实现必须用项目现有的 React / TypeScript / Tailwind / shadcn 体系和 tokenfunc 品牌预设 token。
2. **本手册高于旧 brief**。旧 brief（`fc1749ba-vivid-watching-thunder.md`）里的结构、删除清单、文件规划仍然有效，但下面「与旧 brief 的差异」一节列出的决策以本手册为准。
3. **动手前先核对路径**。下文的文件路径来自旧 brief 对仓库的梳理，开工前先 `ls web/src/features/landing/` 确认实际文件名，有出入以仓库为准，并在 worklog 里记一笔。
4. **不要自己编数字**。运行质量区的数字（380ms / 80+ / 10M+ / 85%+）是原型占位，必须做成可配置常量并标 TODO，见第 6 节。
5. **遇到需要拍板的事，停下来问黑鹰**，用选择题的形式给出选项和推荐项，不要自行决定。

---

## 1. 目标

把现有 9 个区块的落地页收敛为 6 个区块：Hero → 三个主卖点 → 运行质量 → 接入 → 价目 → 试用表单。首屏不出现任何数字；页面上的数字只允许来自真实接口（价目）、可在控制台复现的演示（demo 卡片）和经确认的运行指标（运行质量区）。

页头 `PublicLayout`、页脚 `Footer` 沿用上游，不在本次范围。

---

## 2. 与旧 brief 的差异（以本节为准）

| 项 | 旧 brief | 现在的决定 |
|---|---|---|
| 兼容工具 | 无 | Hero 按钮下方新增**兼容工具 logo 单行循环滚动条**，商标声明放页脚 |
| Hero 主标题 | 静态「企业级 AI 模型网关」+ 小一号「真模型 · 可对账 · 不落盘」，删除打字机 | **保留打字机**。单行：白色前缀「Token Func，」+ 绿色打字卖点，三条卖点逐条打出、回删、再打下一条。「企业级 AI 模型网关」降为顶部小标签 |
| Hero 主标题（2026-11-23 改版） | 单行打字机：前缀「Token Func，」+ 三条卖点轮播 | **固定标题**「真模型 · 供应稳定 · 数据安全」，直接摆企业刚需；打字机降为标题下方一行小字轮播副句。原因：轮播时任一时刻只露出 1/3 主张 |
| 第 2 个主卖点 | 「数据不落盘」 | 改为「**数据安全，内容不留存**」，用大白话说明中转不存请求体与响应体 |
| 主卖点要点标识 | 勾选图标 | **6px 品牌绿小圆点** |
| 模型自检 demo | 四步循环 | 四步逐项点亮，完成后停留再**自动轮换到下一个厂商**；Tab 用厂商名，**单行不换行**，窄屏横向滑动 |
| 运行质量区 | 一行三格，**无数字** | 三张卡片，**带量化指标**，顺序：供应稳定 → 高缓存命中率 → 高性能；每张卡标题左侧有图标徽标 |
| 接入区 | 三步横排 + 代码块 | 左侧三步竖排、右侧代码块；代码中含 `api.tokenfunc.com` 的那一行**高亮** |
| 价目区 | 四家各 3 个代表模型、共 12 行一张表 | **按厂商 Tab 切换**，每家展示当前最新主流模型（3–4 个），每行带定位标签，Tab 底部有该厂商的计费注脚 |
| 图标 | 未规定 | 一律用 `lucide-react` 组件（原型里最终也是内联 SVG），**不要**用远程 URL + CSS mask，那样加载失败会显示成色块 |
| 框内文字 | 未规定 | 所有胶囊、标签、按钮、Tab 内文字**不换行**；标签组用 flex-wrap，整颗标签换行 |

---

## 3. 页面结构与区块规格

区块顺序与锚点：

| # | 区块 | 锚点 id | 组件 |
|---|---|---|---|
| ① | Hero | `top` | `components/hero.tsx` |
| ② | 主卖点 01 真模型 | `fidelity` | `components/capabilities.tsx` |
| ② | 主卖点 02 数据安全 | `privacy` | 同上 |
| ② | 主卖点 03 可对账 | `control` | 同上 |
| ③ | 运行质量 | `quality` | 新增 `components/quality-strip.tsx` |
| ④ | 接入 | `quickstart` | `components/quickstart.tsx` |
| ⑤ | 价目 | `pricing` | 现有价目/模型组件（原 `models` 区） |
| ⑥ | 试用表单 | `contact` | 现有联系/试用组件 |

通用布局：内容最大宽度 1200px（Hero 放宽到 1440px），左右内边距 `clamp(20px, 5vw, 32px)`；区块之间用 1px 分隔线；区块上下内边距 `clamp(72px, 9vw, 112px)`。断点 sm = 640px，手机端单列。进入视口时整块淡入上移 24px（700ms，`cubic-bezier(.16,1,.3,1)`），`prefers-reduced-motion` 下关闭。

### ① Hero

- 顶部小标签（胶囊，带 6px 绿点）：`企业级 AI 模型网关`
- **主标题（固定，不轮播）**：`真模型 · 供应稳定 · 数据安全`
  - 字号：中日文 `clamp(28px, 7.2vw, 88px)`，其余语言 `clamp(30px, 5.6vw, 68px)`；字重 500，行高 1.1，字距 -0.05em，`text-wrap: balance`。中日文各宽度单行；西文 1440 单行，窄屏折两行。
- **轮播副句**（标题下方一行，绿色，打字机）：`高性能，低延迟` → `高缓存命中，成本更低` → `数据安全，内容不存档` → `对公开票，账单可对`
  - 字号 `clamp(16px, 2.6vw, 30px)`，字重 500，行高 1.3，居中。
  - 定最小高度一行（西文手机端两行），回删到空时下方内容不跳动。
  - 光标：宽 0.06em、高 0.84em 的绿色竖条，`steps(1)` 1s 闪烁。
- 副标题（最大宽 680px，18/30）：`Claude / GPT / Gemini / Grok 多来源供应，来源逐组标注。不降级、不替换，数据不存档，一套后台从组织管到账单。`
- 按钮：
  - 主按钮 `申请企业试用 →`，锚到 `#contact`
  - 次按钮：注册开放时为 `免费注册`（跳注册页）；**注册关闭时换成 `查看价目`，锚到 `#pricing`**
- 背景：顶部径向绿色光晕，沿用 Landing v2。
- 删除：NEW 徽标、旧的六句轮播、四个指标数字。

**兼容工具滚动条**（Hero 两个按钮下方，居中，距按钮 36px，最大宽 1040px）
- 新增组件 `components/compatible-tools.tsx`，由 `hero.tsx` 引用。
- 只有滚动条本身，**不加任何标题或标签文字**，也不单独放文档链接。容器加 `aria-label="兼容的工具"` 供读屏使用。
- **单行 logo 横向无缝循环滚动**：每项是 28px logo 加工具名（14px，灰色，悬停变主色，不换行），项与项之间左右各留 26px，行高 56px。
  - 实现方式：列表渲染两遍放进一个 `width: max-content` 的 flex 轨道，CSS 动画 `translateX(0 → -50%)`，40s 线性无限循环。第二遍加 `aria-hidden="true"` 和 `tabIndex={-1}`，避免读屏重复朗读、Tab 键重复聚焦。
  - 容器左右两端用 `mask-image` 做 10% 的渐隐。
  - 鼠标悬停时暂停滚动（`animation-play-state: paused`）。
  - `prefers-reduced-motion` 下不滚动，改成可以手动横向滑动。
  - 每一项都是链接，跳到文档里该工具的配置页。
- 工具顺序与文档锚点：

| 工具 | 文档锚点 |
|---|---|
| Claude Code | `claude-code` |
| Codex | `codex` |
| OpenCode | `opencode` |
| OpenClaw | `openclaw` |
| Hermes | `hermes` |
| Cursor | `cursor` |
| WorkBuddy | `workbuddy` |
| 千问 Work | `qwen-work` |
| Kimi Work | `kimi-work` |
| CC Switch | `cc-switch` |

- 商标声明放在**页脚**最下方（12px，faint 色）：`Claude Code、Codex、Cursor 等工具名称与 logo 为各自所有者的商标，本站仅用于说明兼容性，不代表官方合作。`（页脚属于上游 `Footer`，若不便改动，放在落地页最后一个区块底部）
- **Kiro、豆包 Work 暂不支持，不要放进来。** 工具列表做成 `content.ts` 里的 `COMPATIBLE_TOOLS` 配置，以后增删只改配置。
- **Logo 素材**：原型里是空的图片占位框，没有放任何品牌 logo。实现时用各工具官网或官方品牌资源页（press kit / brand assets）提供的正式 logo，存到 `web/public/logos/tools/` 下并命名为 `{锚点}.svg`。找不到官方素材的工具，先用名称首字母加圆角底色做占位，**不要自己临摹或重画 logo**，并在 worklog 里列出哪些还缺素材。深色主题下单色 logo 要能看清，必要时用官方提供的反白版本。

**打字机时序**

| 参数 | 值 |
|---|---|
| 首句初始 | 直接完整显示第一句，停留 2400ms 后开始回删 |
| 打字速度 | 110ms / 字 |
| 打完停留 | 2200ms |
| 回删速度 | 45ms / 字 |
| 删空后间隔 | 360ms |
| 减弱动效 | 不逐字打，整句每 3200ms 切换 |

无障碍：`<h1>` 是真实文本的固定标题；可视的打字区 `aria-hidden`，四条副句另用一句 `sr-only` 完整句提供给读屏。组件卸载时清理定时器。

### ② 主卖点 ×3

每块结构：序号标签（`01 · 真模型`，序号用绿色，等宽字体，12px 大写字距 1.2px）→ 标题（`clamp(32px, 4vw, 44px)`）→ 一句描述 → 三条要点（6px 绿色圆点 + 15px 文字）→ 右侧 demo 卡。
桌面左右交替：01 和 03 文案在左，02 文案在右。手机端一律文案在上、demo 在下（02 用 `flex-direction: row-reverse` + `flex-wrap` 即可做到）。文案列 `flex: 1 1 360px`，demo 列 `flex: 1.25 1 420px`。

**01 · 真模型**
- 标题：`100% 保真，不降智`
- 描述：`每个渠道分组标明上游来源。不降级、不替换、不改写，返回上游原始响应。`
- 要点：`来源逐组标注，无静默替换` / `控制台随时发起模型自检` / `usage 与上游账单逐条一致`
- demo：复用 `self-check-demo`，改动如下：
  - 头部：左侧 `模型自检`，右侧厂商 Tab `Claude / GPT / Gemini / Grok`。Tab 组 `flex-wrap: nowrap; overflow-x: auto`，隐藏滚动条，按钮 `flex: none; white-space: nowrap`。
  - 四步：`模型标识与上游返回一致` → `上下文窗口与标称一致` → `工具调用与多模态能力匹配` → `usage 与上游账单逐条一致`。每步左侧一个 22px 圆圈，完成后浅绿底加绿勾；右侧状态依次为 `待检测` / `检测中…` / `通过`。
  - 底部左侧显示 `{模型ID} · 检测中 n/4`，完成后为 `{模型ID} · 4/4 通过`（绿色，`aria-live="polite"`）；右侧 `渠道分组 · 来源已标注`。
  - 时序：每步 650ms，四步完成后停留 2600ms，自动切到下一个厂商循环。点击 Tab 从该厂商重新开始。减弱动效下直接显示 4/4 通过，不轮换。
  - 演示用模型 ID（与价目区保持一致）：Claude `claude-sonnet-5-5`，GPT `gpt-6.2-sol`，Gemini `gemini-3.8-flash`，Grok `grok-4.7`。

**02 · 数据安全**
- 标题：`数据安全，内容不留存`
- 描述：`作为中转服务，我们不存储你的请求体与响应体：内容只在内存中转发，不写入数据库、日志或磁盘，只保留计费所需的用量元数据。`
- 要点：`请求体、响应体一律不存储` / `签署服务合同与 DPA` / `IP 白名单与访问来源限制`
- demo：改造 `retention-card`，做成两列对照：
  - 头部：`单次请求 · 我们存了什么`，右侧 `req_8f2a…c41`
  - 左列 `不存储 · 用完即弃`（eye-off 图标）：虚线框里放 `messages`（请求正文）和 `choices`（响应正文），字段名加删除线
  - 右列 `仅存计费元数据`（receipt 图标）：`model` 模型、`usage.*_tokens` token 用量、`created_at` 时间、`latency_ms` 延迟、`status_code` 状态码
  - 底部：`已存储的请求 / 响应内容` …… `0 B`（绿色）
  - 两列 `repeat(auto-fit, minmax(min(100%, 200px), 1fr))`，窄屏自动叠成上下两块。

> ⚠️ 描述里写了「不写入数据库、日志或磁盘」。上线前请和后端确认网关的访问日志、错误日志、调试开关确实不会记录正文；如果有任何例外，先改文案，再上线。

**03 · 可对账**
- 标题：`企业管控，账单可对`
- 描述：`团队预算、密钥归属、账单明细，一套后台管到底。`
- 要点：`团队月度预算，超额告警与熔断` / `API Key 归属到人，可冻结可限模型` / `多维账单导出，预付或月结，对公专票`
- demo：**新建** `components/demos/budget-bill-card.tsx`，静态展示：
  - 头部：`团队预算 · 2026-11`，右侧 `告警阈值 90%`
  - 三条预算进度条（高 6px，在 90% 位置画一条阈值竖线）：
    - 研发 `$7,840 / $12,000`，65%，主文字色
    - 数据 `$5,530 / $6,000`，92%，**橙色**，名字旁带 `接近阈值` 徽标
    - 产品 `$740 / $2,000`，37%，主文字色
  - 账单明细表（列：模型 / 输入 / 缓存读取 / 输出 / 金额；最小宽 460px，窄屏横向滚动）：
    - `claude-sonnet-5-5`，副行 `研发 · 李娜 · tf-…a91c`，1,204 / 18,560 / 642 / **$0.0107**
    - `gpt-6.2-sol`，副行 `数据 · 王强 · tf-…07e2`，3,420 / 12,800 / 1,150 / **$0.0196**
    - 金额按当前官方价算出：两个模型都是输入 $2、缓存读取 $0.10、输出 $10（每 1M token）。改模型时要重算。
  - 底部三个胶囊：`导出 CSV` / `预付 / 月结` / `对公专票`

### ③ 运行质量（新建 `quality-strip.tsx`）

- 区块背景用 surface 层（比页面底色深/浅一级）。
- 头部：小标签 `运行质量`；标题 `生产环境里的真实表现`（`clamp(24px, 2.8vw, 30px)`）；右侧口径说明 `统计口径：近 7 日全平台请求 · 控制台可查`。
- 三张等宽卡片，`repeat(auto-fit, minmax(min(100%, 300px), 1fr))`，卡片之间用 1px 线分隔。每张卡片标题左侧有一个 36px 圆角方块徽标（浅绿底，18px 绿色图标）。

| 顺序 | 卡片 | 徽标图标 | 主体 |
|---|---|---|---|
| 1 | 供应稳定 | `ShieldCheck` | 大数字 `4`（48px 等宽）+ `道渠道准入检测`；四个标签：`真实性`(BadgeCheck) `稳定性`(Activity) `性能`(Zap) `缓存命中率`(Database)；说明：`渠道上线前逐项检测，运行中持续巡检，不达标自动下线；多条上游并行，单池异常自动切换，调用方无感知。` |
| 2 | 高缓存命中率 | `DatabaseZap` | 大数字 `85%+`（绿色）+ `长会话缓存命中`；命中比例条 87%，图例带色块 `缓存读取` / `未命中`；两个标签：`会话亲和路由`(Link2) `缓存价单独计费`(Receipt)；说明：`会话亲和路由把同一上下文固定到同一渠道，缓存读取按缓存价单独计费，长对话与 Agent 场景成本明显下降。` |
| 3 | 高性能 | `Rocket` | 三行指标，每行左侧一个 34px 浅绿圆底图标：TTFT(Timer) `首 token 延迟 P50` **380** ms；TPS(Gauge) `单请求输出速度` **80+** tok/s；TPM(Layers) `单组织吞吐上限` **10M+** tok/min；说明：`境内多地就近接入，长连接复用，逐 token 流式透传。` |

- 高性能三行用 grid `minmax(0,1fr) 124px`，**数字列统一左对齐**；数字 28px 等宽，单位 12px 灰色，不换行。
- 标签组用 `flex-wrap: wrap`，标签本身 `white-space: nowrap`。不要用两等分 grid，窄卡片里会把「缓存价单独计费」挤成两行。

### ④ 接入（`quickstart.tsx`）

- 左列（`flex: 1 1 300px`）：
  - 小标签 `Quickstart`，标题 `改一行 base_url，即可切换`
  - 三步竖排，左侧一条竖线加节点圆点，第 02 步的节点和序号用绿色高亮：
    - `01` 创建密钥 —— `在控制台生成 tf- 开头的 API Key`
    - `02` 替换 base_url —— `兼容 OpenAI / Anthropic 协议，右侧高亮行即唯一改动`
    - `03` 按模型名调用 —— `模型名即路由，现有代码与工具无需改造`
  - 底部链接：`更多 SDK 与 Agent 接入方式 → 文档中心`
- 右列（`flex: 1.7 1 460px`）代码块：
  - 头部是语言 Tab `Python / Node / cURL / Claude Code`（默认 Python），右侧 `复制` 按钮，点击后显示 `已复制`，1.6s 后恢复
  - 代码带行号；**含 `api.tokenfunc.com` 的行**加浅绿底，左侧 2px 绿色竖条
  - 代码区 `overflow-x: auto`，行内 `white-space: pre`
- 代码内容（与原型一致）：

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.tokenfunc.com/v1",
    api_key="tf-••••••••",
)

resp = client.chat.completions.create(
    model="claude-sonnet-5-5",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)
```

```js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.tokenfunc.com/v1",
  apiKey: process.env.TF_KEY,
});

const resp = await client.chat.completions.create({
  model: "gpt-6.2-sol",
  messages: [{ role: "user", content: "你好" }],
});
console.log(resp.choices[0].message.content);
```

```bash
curl https://api.tokenfunc.com/v1/chat/completions \
  -H "Authorization: Bearer $TF_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.8-flash",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

```bash
# 终端中设置环境变量后直接启动
export ANTHROPIC_BASE_URL="https://api.tokenfunc.com"
export ANTHROPIC_AUTH_TOKEN="tf-••••••••"

claude
```

> base_url 域名和模型 ID 以生产环境实际值为准；如果网关对外的模型名和上游官方 ID 不同，用网关的。

- 删除：右侧模拟流式回复面板，「编码 Agent」「办公 Agent」两组代码片段（具体配置改到文档里讲，接入区只保留「更多 SDK 与 Agent 接入方式 → 文档中心」这一个入口）。

### ⑤ 价目

- 头部：小标签 `Pricing`，标题 `主流海外模型，统一价目`；右侧按钮 `完整价目`（描边）和 `打开模型广场 →`（文字按钮）。
- **厂商 Tab**：`Claude · Anthropic` / `GPT · OpenAI` / `Gemini · Google` / `Grok · xAI`，默认 Claude。Tab 组单行不换行，窄屏横向滑动，隐藏滚动条，带 `role="tablist"` / `role="tab"` / `aria-selected`。
- 表格列：`模型`（模型 ID + 定位标签胶囊） / `输入` / `缓存读取`（绿色） / `输出`，单位是每 1M token、美元。表格最小宽 600px，窄屏横向滚动，**首列 sticky 固定**。
- 表格底部是该厂商的注脚条（见下表）。
- 区块最底下的总注脚：`每 1M token，美元计价，与上游官方价同步更新。缓存命中部分按缓存价计费。`
- **数据来源**：价格一律来自 `/api/pricing`。"展示哪些模型、什么定位标签"做成前端配置（建议放在 `content.ts`，名为 `FEATURED_MODELS`），按配置里的 ID 去接口数据里取价格；**接口里没有的模型直接不显示这一行**，不要回退到写死的价格。
- 精选配置（2026-11-22 各家官方当前主力；括号里是官方当日标准价，只用于核对接口数据，**不要写进代码**）：

| 厂商 | 模型 ID | 定位标签 | 官方价（输入 / 缓存读取 / 输出） |
|---|---|---|---|
| Claude | `claude-fable-5-2` | 顶配 | $8 / $0.20 / $40 |
| | `claude-opus-5-5` | 旗舰 | $4 / $0.20 / $20 |
| | `claude-sonnet-5-5` | 均衡 | $2 / $0.10 / $10 |
| | `claude-haiku-5-5` | 轻量 | $0.10 / $0.01 / $0.50（≤100K 提示） |
| GPT | `gpt-6.2-astra` | 旗舰 | $8 / $0.40 / $40 |
| | `gpt-6.2-sol` | 均衡 | $2 / $0.10 / $10 |
| | `gpt-6.1-terra` | 高速 | $1 / $0.05 / $5 |
| | `gpt-6-luna` | 轻量 | $0.10 / $0.01 / $0.50 |
| Gemini | `gemini-4-argon` | 旗舰 | $2 / $0.10 / $10（12/1 起 $4 / $0.20 / $20） |
| | `gemini-3.8-flash` | 均衡 | $0.75 / $0.075 / $3.75（2027/1/1 起 $1.50 / $0.15 / $7.50） |
| | `gemini-3.5-flash-lite` | 轻量 | $0.30 / $0.03 / $2.50 |
| Grok | `grok-4.7` | 旗舰 | $2 / $0.50 / $6 |
| | `grok-build-0.1` | 编码 | $1 / $0.20 / $2 |
| | `grok-4.3` | 长上下文 | $1.25 / $0.20 / $2.50 |

- 各厂商注脚（放进 i18n）：
  - Claude：`claude-haiku-5-5 为 ≤100K token 提示价格，超出按长提示价计费。`
  - GPT：`短上下文标准价；长上下文与 Fast 模式按上游规则计费。`
  - Gemini：`gemini-4-argon 现价至 11/30，12/1 起上游调整为 $4 / $20；gemini-3.8-flash 现价至 12/31。`（**这条带日期，上线时请黑鹰确认是否保留，或改成不带日期的通用说法**）
  - Grok：`短上下文标准价；超过 200K token 按长上下文价计费。`
- 价格格式化：至少保留 2 位小数，最多 3 位，去掉多余的 0（如 `$15.00`、`$0.30`、`$0.125`、`$0.005`）。
- **空态**（`/api/pricing` 为空或请求失败）：虚线框居中，内容依次为刷新图标、`价目同步中`、`正在从上游拉取最新价格，稍后刷新，或前往完整价目页查看。`、按钮 `查看完整价目`。
- 删除：旧版的状态列、上下文列、厂商筛选「全部」。

### ⑥ 试用表单

- 左列：小标签 `Enterprise trial`，标题 `今天就接入`，副标题 `一个工作日内联系你，开通试用额度。`；配置了商务微信二维码时显示描边按钮 `直接加商务微信`（qr-code 图标），点击弹出二维码弹窗，**未配置时整个按钮隐藏**。
- 右列表单卡片：
  - `公司名称`，占位 `例如：某某科技有限公司`
  - `微信号或手机号`，占位 `用于商务经理添加你`
  - `预计月用量`，单选胶囊 `< $1k/月` / `$1k–10k/月` / `> $10k/月`，默认中间一项，用 `fieldset` + `legend`，按钮带 `aria-pressed`
  - 错误提示（`role="alert"`）：`请填写公司名称` / `请填写微信号或手机号`（少于 5 个字符）
  - 提交按钮 `提交申请`
  - 成功态：绿勾圆标、`已收到申请`、`商务经理会在一个工作日内通过微信添加 {联系方式}。`、按钮 `重新填写`
- 提交接口沿用现有实现，原型里的提交是本地模拟的。
- 二维码弹窗：标题 `微信扫码，联系商务`，时间说明 `工作日 9:00–21:00`，Esc 键和点击遮罩都能关闭，带 `role="dialog"` 和 `aria-modal`。
- 删除：FAQ、定价对比卡（按量 / 企业）、企业区四个 Tab 与三张服务卡。

---

## 4. 主题与样式

- **深浅双主题**，跟随项目现有的主题切换机制。原型用 CSS 变量实现，下表是参考值；实现时**映射到 tokenfunc 预设里已有的 token**，只有现有 token 覆盖不了的才新增，并在 worklog 说明。

| 语义 | 深色 | 浅色 | 说明 |
|---|---|---|---|
| bg | `#121212` | `#FFFFFF` | 页面底 |
| surface | `#181818` | `#F7F7F7` | 卡片 / 运行质量区底 |
| head | `#232323` | `#EFEFEF` | 表头 |
| line | `#2A2A2A` | `#E6E6E6` | 分隔线 |
| line-strong | `#4D4D4D` | `#CFCFCF` | 胶囊描边 |
| fg | `#FFFFFF` | `#0A0A0A` | 主文字 |
| body | `#E6E6E6` | `#2B2B2B` | 正文 |
| muted | `#B3B3B3` | `#5C5C5C` | 次要文字 |
| faint | `#8C8C8C` | `#6E6E6E` | 行号、待检测（已按 4.5:1 对比度调过） |
| accent | `#1ED760` | `#1ED760` | 品牌绿（按钮底、圆点、进度条） |
| accent-text | `#1ED760` | `#0E7A37` | **浅色主题下绿色文字必须用深绿**，`#1ED760` 在白底上对比度不够 |
| accent-soft | `rgba(30,215,96,.10)` | `rgba(30,215,96,.12)` | 图标徽标底、高亮行 |
| warn / warn-text | `#FFA42B` | `#F29A1F` / `#9A5800` | 接近阈值；浅色主题下文字用深色 |
| err | `#F3727F` | `#C2283A` | 表单错误 |

- 字体：UI 用 Geist + MiSans，等宽用 Geist Mono，沿用现有设置。
- 圆角：按钮、胶囊 500px，卡片 12px，标签 8px。
- **所有胶囊、标签、徽标、按钮、Tab 内的文字 `white-space: nowrap`**。
- 图标：`lucide-react`。对照表：arrow-right、eye-off、receipt、shield-check、badge-check、activity、zap、database、database-zap、link-2、rocket、timer、gauge、layers、copy、refresh-cw、qr-code、check、x。装饰性图标加 `aria-hidden`。

---

## 5. 文件改动清单

以下沿用旧 brief 的规划，按本手册的决定做了调整。

**修改**
- `web/src/features/landing/index.tsx`：区块顺序改为 Hero → Capabilities(3) → QualityStrip → Quickstart → Models/Pricing → Contact
- `web/src/features/landing/content.ts`：
  - 删除：旧指标常量、旧六句轮播、FAQ、pricing 卡、enterprise tabs
  - 新增：`HERO_PHRASES`（三条卖点）、`FEATURED_MODELS`（价目精选配置）、`COMPATIBLE_TOOLS`（兼容工具）、`QUALITY_METRICS`（运行质量数字，见第 6 节）、budget-bill demo 数据、各厂商注脚 key
- `components/hero.tsx`：删除 NEW 徽标和指标条；打字机改为单行前缀 + 三条卖点（第 3 节①）
- `components/capabilities.tsx`：五卡改三卡，左右交替，要点改成圆点
- `components/demos/self-check-demo.tsx`：Tab 改厂商名且不换行；自动轮换
- `components/demos/retention-card.tsx`：改成两列对照
- `components/quickstart.tsx`：删除右侧面板和两组 Agent 片段；左右两栏；代码高亮行
- 价目/模型组件：改为厂商 Tab + 精选配置 + 接口价格 + 空态
- `web/src/styles/landing.css`：清理没有引用的样式

**新增**
- `components/quality-strip.tsx`
- `components/demos/budget-bill-card.tsx`
- `components/compatible-tools.tsx`（兼容工具滚动条）
- `web/public/logos/tools/*.svg`（官方 logo 素材）

**删除**
- `enterprise-section.tsx`、`pricing-section.tsx`、`faq-section.tsx`
- `demos/failover-demo.tsx`、`demos/latency-card.tsx`、`demos/cache-bill-card.tsx`

**i18n**
- `web/src/i18n/locales/tokenfunc/{zh,en,zh-TW,fr,ru,ja,vi}.json` 增删 key；中文为准，英文见第 7 节，其余语言跑 `bun run i18n:sync`
- 模型 ID、代码片段、`TTFT/TPS/TPM`、`usage.*_tokens` 这类技术字段**不进 i18n**

**worklog**
- `docs/worklog/2026-11-22-refactor-landing-simplify.md`：记录改动、与旧 brief 的偏差、待确认项

---

## 6. 运行质量数字（上线前必须确认）

原型里的数字只是**占位**。做成 `content.ts` 里的 `QUALITY_METRICS` 常量，每项加 `// TODO(黑鹰确认)` 注释，**不要自己估一个值填进去**：

| 指标 | 原型占位 | 需要确认的内容 |
|---|---|---|
| 渠道准入检测 | 4 道 | 是否确实有这四项检测、上线前检测 + 运行中巡检 + 自动下线的流程 |
| 缓存命中率 | 85%+（长会话） | 统计口径和真实值 |
| TTFT P50 | 380 ms | 真实值 |
| TPS | 80+ tok/s | 真实值；不同模型差别很大，是否按模型或取中位数 |
| TPM | 10M+ tok/min | 这是**对外承诺的单组织容量上限**，企业客户会拿它压测，必须和实际限流配置一致 |
| 统计口径 | 近 7 日全平台请求 · 控制台可查 | 控制台是否真能查到；查不到就删掉这句 |

如果后端已有能提供这些指标的接口，优先接接口，常量只作兜底；有接口时把这一点告诉黑鹰。

---

## 7. 英文文案（en.json）

| 位置 | 中文 | English |
|---|---|---|
| Hero 小标签 | 企业级 AI 模型网关 | Enterprise AI model gateway |
| Hero 标题 | 真模型 · 供应稳定 · 数据安全 | Real models. Reliable supply. Secure data. |
| Hero 副句 1 | 高性能，低延迟 | High performance, low latency |
| Hero 副句 2 | 高缓存命中，成本更低 | High cache hit rate, lower cost |
| Hero 副句 3 | 数据安全，内容不存档 | Secure data, no content archived |
| Hero 副句 4 | 对公开票，账单可对 | VAT invoices, bills that reconcile |
| Hero 副标题 | Claude / GPT / Gemini / Grok 多来源供应…… | Multi-source supply for Claude, GPT, Gemini and Grok, with every source labeled. No downgrades, no swaps, no storage of your requests or responses — one console from org setup to billing. |
| 主按钮 | 申请企业试用 | Request enterprise trial |
| 次按钮 | 免费注册 / 查看价目 | Sign up free / View pricing |
| 01 标签 | 真模型 | Real models |
| 01 标题 | 100% 保真，不降智 | 100% fidelity, no downgrades |
| 01 描述 | 每个渠道分组标明上游来源…… | Every channel group names its upstream source. No downgrades, swaps or rewrites — you get the upstream response as-is. |
| 01 要点 | 来源逐组标注，无静默替换 / 控制台随时发起模型自检 / usage 与上游账单逐条一致 | Sources labeled per group, no silent swaps / Run a model self-check from the console anytime / usage matches upstream billing line by line |
| 自检 | 模型自检 / 待检测 / 检测中… / 通过 / 渠道分组 · 来源已标注 | Model self-check / Pending / Checking… / Passed / Channel groups · sources labeled |
| 自检四步 | 模型标识与上游返回一致 / 上下文窗口与标称一致 / 工具调用与多模态能力匹配 / usage 与上游账单逐条一致 | Model ID matches upstream response / Context window matches spec / Tool use and multimodal match / usage matches upstream billing |
| 02 标签 | 数据安全 | Data security |
| 02 标题 | 数据安全，内容不留存 | Data security: no content retained |
| 02 描述 | 作为中转服务，我们不存储…… | As a relay, we never store your request or response bodies. Content is forwarded in memory only — never written to databases, logs or disk. We keep only the usage metadata needed for billing. |
| 02 要点 | 请求体、响应体一律不存储 / 签署服务合同与 DPA / IP 白名单与访问来源限制 | Request and response bodies are never stored / Service agreement and DPA / IP allowlists and source restrictions |
| 留存卡 | 单次请求 · 我们存了什么 / 不存储 · 用完即弃 / 仅存计费元数据 / 已存储的请求 / 响应内容 | Per request · what we keep / Not stored · discarded after use / Billing metadata only / Stored request / response content |
| 03 标签 | 可对账 | Reconcilable |
| 03 标题 | 企业管控，账单可对 | Enterprise controls, bills that reconcile |
| 03 描述 | 团队预算、密钥归属、账单明细，一套后台管到底。 | Team budgets, key ownership and itemized bills, all in one console. |
| 03 要点 | 团队月度预算，超额告警与熔断 / API Key 归属到人，可冻结可限模型 / 多维账单导出，预付或月结，对公专票 | Monthly team budgets with alerts and hard stops / API keys owned by people, freezable and model-restricted / Multi-dimensional bill export, prepaid or monthly, official VAT invoices |
| 预算卡 | 团队预算 / 告警阈值 / 接近阈值 / 账单明细 / 导出 CSV / 预付 / 月结 / 对公专票 | Team budget / Alert threshold / Near limit / Itemized bill / Export CSV / Prepaid / Monthly / VAT invoice |
| 运行质量 | 运行质量 / 生产环境里的真实表现 / 统计口径：近 7 日全平台请求 · 控制台可查 | Service quality / How it performs in production / Based on all requests in the last 7 days · viewable in console |
| 供应稳定 | 供应稳定 / 道渠道准入检测 / 真实性 / 稳定性 / 性能 / 缓存命中率 | Reliable supply / channel admission checks / Authenticity / Stability / Performance / Cache hit rate |
| 供应稳定说明 | 渠道上线前逐项检测…… | Every channel is checked before going live and monitored continuously; failing channels are pulled automatically. Upstreams run in parallel and fail over automatically, invisible to callers. |
| 缓存 | 高缓存命中率 / 长会话缓存命中 / 缓存读取 / 未命中 / 会话亲和路由 / 缓存价单独计费 | High cache hit rate / cache hits on long sessions / Cache reads / Misses / Session-affinity routing / Cache reads billed at cache price |
| 缓存说明 | 会话亲和路由把同一上下文固定到同一渠道…… | Session-affinity routing pins the same context to the same channel, and cache reads are billed at the cache price — a clear cost drop for long conversations and agents. |
| 高性能 | 高性能 / 首 token 延迟 P50 / 单请求输出速度 / 单组织吞吐上限 | High performance / Time to first token, P50 / Output speed per request / Throughput limit per org |
| 高性能说明 | 境内多地就近接入，长连接复用，逐 token 流式透传。 | Multi-region access points in mainland China, persistent upstream connections, token-by-token streaming. |
| 接入 | 改一行 base_url，即可切换 | Change one line of base_url to switch |
| 接入三步 | 创建密钥 / 替换 base_url / 按模型名调用 | Create a key / Replace base_url / Call by model name |
| 接入说明 | 在控制台生成 tf- 开头的 API Key / 兼容 OpenAI / Anthropic 协议，右侧高亮行即唯一改动 / 模型名即路由，现有代码与工具无需改造 | Generate a tf- API key in the console / OpenAI and Anthropic compatible — the highlighted line is the only change / The model name is the route; existing code and tools work as-is |
| 接入链接 | 更多 SDK 与 Agent 接入方式 → 文档中心 | More SDKs and agent setups → Docs |
| 复制 | 复制 / 已复制 | Copy / Copied |
| 页脚商标声明 | Claude Code、Codex、Cursor 等工具名称与 logo 为各自所有者的商标…… | Claude Code, Codex, Cursor and other tool names and logos are trademarks of their respective owners, shown only to indicate compatibility. No official partnership implied. |
| 价目 | 主流海外模型，统一价目 / 完整价目 / 打开模型广场 | Leading global models, one price list / Full pricing / Open model hub |
| 价目表头 | 模型 / 输入 / 缓存读取 / 输出 | Model / Input / Cache read / Output |
| 定位标签 | 顶配 / 旗舰 / 均衡 / 高速 / 轻量 / 编码 / 长上下文 | Top tier / Flagship / Balanced / Fast / Lite / Coding / Long context |
| 价目空态 | 价目同步中 / 正在从上游拉取最新价格…… / 查看完整价目 | Syncing prices / Fetching the latest upstream prices. Refresh shortly or see the full price list. / View full pricing |
| 价目总注脚 | 每 1M token，美元计价…… | Per 1M tokens, in USD, synced with official upstream prices. Cached input is billed at the cache price. |
| 表单 | 今天就接入 / 一个工作日内联系你，开通试用额度。 / 直接加商务微信 | Get started today / We'll reach out within one business day to set up trial credit. / Add our sales WeChat |
| 表单字段 | 公司名称 / 微信号或手机号 / 预计月用量 / 提交申请 | Company name / WeChat ID or phone / Expected monthly spend / Submit request |
| 表单提示 | 请填写公司名称 / 请填写微信号或手机号 | Please enter your company name / Please enter a WeChat ID or phone number |
| 成功态 | 已收到申请 / 商务经理会在一个工作日内通过微信添加 {x}。 / 重新填写 | Request received / Our account manager will add {x} on WeChat within one business day. / Start over |
| 弹窗 | 微信扫码，联系商务 / 工作日 9:00–21:00 | Scan to contact sales on WeChat / Weekdays 9:00–21:00 |

---

## 8. 待黑鹰确认（开工可以，上线前必须定）

1. **品牌写法**：Hero 用的是「Token Func」，页头、页脚和其他地方是「tokenfunc」。全站统一用哪种？
2. **运行质量的六项数字与口径**（第 6 节）。
3. **Gemini 注脚里的日期**要不要保留。
4. **「不写入数据库、日志或磁盘」**需要后端确认属实（第 3 节 02）。
5. **兼容工具的 logo 素材**：哪些工具拿不到官方 logo；文档中心是否已有这 10 个工具的配置页，锚点是否和上表一致。
6. **手机端 Hero**：一行放下时字号约 27px。可以接受，还是在手机端允许逗号后换行？

---

## 9. 验收清单

**命令**
- [ ] `bun run typecheck` 通过
- [ ] `bun run lint` 通过
- [ ] landing 相关 vitest 通过；打字机、自检轮换、价目 Tab 切换、价目空态至少各有一个测试
- [ ] `bun run i18n:sync` 后 7 个语言文件 key 一致

**浏览器（`make dev`）**，桌面 1440 和手机 390 各走一遍，深浅两个主题：
- [ ] Hero 标题固定不轮播；副句打字机逐条出现，回删时下方内容不跳动；开启减弱动效时改为整句切换
- [ ] 首屏没有任何数字；按钮下方有工具滚动条；桌面 1440×900 下首屏下沿仍能露出 01 区块的顶部
- [ ] 关闭注册时，次按钮变成「查看价目」并锚到价目区
- [ ] 01 自检 Tab 在窄屏下单行可滑动，自动轮换正常
- [ ] 01–03 要点是绿色小圆点；手机端 demo 在文案下方
- [ ] 运行质量三张卡顺序为 供应稳定 → 高缓存命中率 → 高性能；所有图标正常渲染，没有色块；高性能三个数字左对齐
- [ ] 所有胶囊、标签、按钮里的文字都不换行
- [ ] 代码块高亮行正确，四种语言都能复制
- [ ] 兼容工具滚动条 10 个工具齐全、没有 Kiro 和豆包 Work；滚动无缝衔接、悬停暂停、减弱动效下可手动横滑；每项都能跳到文档对应锚点；logo 深浅主题下都清晰
- [ ] 价目 Tab 能切换；接口里缺的模型那一行不显示；`/api/pricing` 为空时显示空态；手机端表格横向滚动、首列固定
- [ ] 没配二维码时，「直接加商务微信」按钮隐藏（页头属于上游 `PublicLayout`，不在本次范围）
- [ ] 浅色主题下绿色文字和橙色文字对比度达到 4.5:1
- [ ] 删除清单里的组件已删干净，`landing.css` 里没有残留无引用的样式

**收尾**
- [ ] worklog 写好，包括与本手册的偏差和第 8 节各项的处理状态
- [ ] 在 `main` 上提交，提交说明写清删除了哪些区块和组件
