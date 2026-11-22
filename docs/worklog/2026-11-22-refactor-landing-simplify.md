# 落地页 v3 重构：九个区块收敛为六块，只讲三个核心卖点

- 日期：2026-11-22
- 分支：main（黑鹰选择直接在 main 上做）
- PR：
- 关键 commit：8098d4501（设计手册）、de00fa530（Hero）、387f8fd90（主卖点）、321763f5d（运行质量）、af9cd91d7（接入）、c0b406407（价目）、5e67c39d2（表单与收尾删除）、ea0f32b8e（i18n 与测试）、本条 worklog 所在提交（logo 素材）

## 背景

旧落地页 9 个区块、14 个卖点、Hero 六句轮播加四个写死的市场口径数字（99.95% / 380ms / 90%+ / 500+），信息密度过高，且写死数字与「绝不掺假」的承诺矛盾。黑鹰定了三个主卖点（真模型 / 数据安全 / 可对账），其余三个（供应稳定 / 高缓存 / 高性能）降为运行质量区。Claude Design 出了 v3 原型，交接手册与原型源码放在 `docs/design/`。

## 变更

区块顺序：Hero → 三个主卖点 → 运行质量 → 接入 → 价目 → 试用表单。

- **Hero**：删 NEW 徽标、六句轮播、四个指标数字；单行前缀 `TokenFunc，` + 定宽 6.1em 打字区（三条卖点），手机端逗号后换行；打字机时序按手册；新增兼容工具滚动条 `compatible-tools.tsx`（配置在 `COMPATIBLE_TOOLS`）。
- **主卖点**：五卡改三卡，锚点 fidelity / privacy / control，左右交替，要点改绿点；自检 demo 改厂商 Tab + 自动轮换；留存卡改两列对照；新增 `demos/budget-bill-card.tsx`。
- **运行质量**：新增 `quality-strip.tsx`，数字全部在 `QUALITY_METRICS`，逐项 `TODO(黑鹰确认)`。
- **接入**：左三步竖排 + 右代码块（四种语言，含 API 地址的行高亮），复制复用 `useCopyToClipboard`。
- **价目**：厂商 Tab + `FEATURED_MODELS` 精选，按 model_name 精确取 `/api/pricing` 价格，接口没有的模型不显示，空态「价目同步中」。
- **试用表单**：用量胶囊改 fieldset + legend + aria-pressed；成功态带联系方式；商标声明放在表单区底部。
- **关于页**：原来直接复用落地页五张能力卡，黑鹰拍板改为三卖点 + 三项运行质量共六张卡（只用定性说明）。
- **删除的区块与组件**：`enterprise-section.tsx`（四 Tab + 三服务卡）、`faq-section.tsx`、`pricing-section.tsx`（按量 / 企业对比卡）、`demos/failover-demo.tsx`、`demos/latency-card.tsx`、`demos/cache-bill-card.tsx`；`landing-primitives` 里无引用的 `Section` / `SectionHeading` / `CheckList`；`landing.css` 的 `tf-pulse`；content.ts 里 HERO_STATS、旧 CAPABILITIES、FAILOVER / LATENCY / CACHE_BILL、MANAGEMENT_TABS、ENTERPRISE_SERVICES、PLAYGROUND_REPLIES、SNIPPET_GROUPS、PRICING_PLANS、FAQ_ITEMS、LANDING_VENDORS。
- **i18n**：tokenfunc 语言包新增 99 个 key（七语言），删除 152 个旧落地页无引用 key；「缓存读」改「缓存读取」（全站生效）。

### 与手册的偏差（以仓库为准）

| 手册 | 实际 | 原因 |
|---|---|---|
| 文档锚点 `claude-code` 等 | `/docs/tools-claude-code` 形式的 slug | 文档路由是 `/docs/$slug` |
| 10 个工具都有文档页 | 只有 6 个；OpenCode / 千问 Work / Kimi Work / CC Switch 链到 `/docs/tools-overview` | 黑鹰拍板 |
| Key 前缀 `tf-` | `sk-` | 系统真实前缀，黑鹰拍板 |
| 代码里写死 `api.tokenfunc.com` | 用 `useApiBase()`（后台 server_address 优先），高亮含该地址的行 | 与线上实际地址一致 |
| Hero 前缀 `Token Func，` | `TokenFunc，` | 黑鹰拍板 |
| 手机 Hero 单行约 27px | <640px 逗号后换行，约 53px | 黑鹰拍板 |
| 02 描述「不写入数据库、日志或磁盘」 | 去掉「日志」 | 上游异步任务表会存 prompt、错误日志可能带上游回显，黑鹰拍板收窄 |
| Gemini 注脚带调价日期 | 通用说法「上游调价时同步更新，以当前显示为准」 | 黑鹰拍板 |
| 色板 accent-text / warn-text | 映射到已有 `text-brand-ink`、`text-warning`，未新增 token | 已有 token 覆盖 |
| 价目「完整价目」与「打开模型广场」 | 分别指向 `/pricing?view=table` 与 `/pricing` | 站内只有模型广场一个价目页 |
| 价目「默认 Claude」 | 只显示接口里至少有一个精选模型的厂商 Tab | 接口里没有的不显示 |
| 自检「待检测」、表单「提交申请」 | 用独立 key `Awaiting check`、`Submit application` | 上游 `Not checked`（未检查）、`Submit request`（提交请求）在别处使用，不能覆盖 |

### 兼容工具 logo 来源

全部来自官方站点、官方 CDN 或官方 GitHub 仓库，没有临摹或重画；10 个工具无缺失。SVG 已检查不含 script、foreignObject、外链 href 和事件属性。

| 工具 | 文件 | 来源 | 备注 |
|---|---|---|---|
| Claude Code | claude-code.svg | https://claude.com/icon.svg （claude.com/product/claude-code 的 favicon） | 用母公司 Claude mark |
| Codex | codex.png | https://images.ctfassets.net/kftzwdyauwt9/YgXvGzKvVcDvpJGOFyroe/777616dd860276400c9c955688dce373/codex-app.png.png?w=256&fm=png （openai.com/codex 页面的 Codex App 图标） | 无官方 SVG，用官方 CDN 缩到 256px |
| OpenCode | opencode.svg | https://opencode.ai/favicon.svg | 深色底块 |
| OpenClaw | openclaw.svg | https://openclaw.ai/favicon.svg | |
| Hermes | hermes.png / hermes-dark.png | https://raw.githubusercontent.com/NousResearch/hermes-agent/main/apps/desktop/assets/appx/Square44x44Logo.targetsize-256.png 与 …/main/apps/desktop/public/nous-girl-dark.png | 官方 SVG 是描摹路径，116KB / 138KB，改用同仓库图形一致的 256px PNG（12KB / 18KB） |
| Cursor | cursor.svg / cursor-dark.svg | https://cursor.com/marketing-static/favicon-light.svg 与 …/favicon.svg （cursor.com/brand） | 官方浅色 / 深色两版 |
| WorkBuddy | workbuddy.svg | https://assets.workbuddy.cn/web/workbuddy/7b25e1f24385a28a7c133de175ff1dc2bc6b455e/assets/logo.svg （workbuddy.cn favicon） | |
| 千问 Work | qwen-work.png | https://img.alicdn.com/imgextra/i4/O1CN01HdCyPs1MZh3Szwmxo_!!6000000001449-2-tps-180-180.png （qwenwork.cn 的 apple-touch-icon） | 官网无 SVG 图标 |
| Kimi Work | kimi-work.png | https://www.kimi.com/landing-ui/assets/_next/static/media/kimi-logo.59a55296.png （kimi.com/zh-cn/products/kimi-work） | 无独立图标，用 Kimi App 图标 |
| CC Switch | cc-switch.svg | https://raw.githubusercontent.com/farion1231/cc-switch/main/src/assets/icons/logo.svg | |

## 验证

- 每个区块提交前：`bun run typecheck` 通过；`bun run lint` 共 142 个 error，与改动前 main 相同（全在上游与脚本文件），落地页与关于页 0 个。
- `bunx vitest run src/features/landing src/features/about src/i18n`：10 个文件 36 个用例全部通过（新增打字机、自检、价目、Hero 四个测试文件）。
- `bun run i18n:sync` 后 tokenfunc 七个语言文件均为 1566 个 key，互相无差异；上游语言包无改动。
- 浏览器（`make api TF_API_PORT=3010` + `make web TF_WEB_PORT=5174`）：
  - 1440 宽：区块顺序正确；标题单行 100px；01 区块顶部在页面 772px 处，1440×900 首屏能露出；自检自动轮换；运行质量三卡顺序正确、高性能数字左对齐；无破图。
  - 390 宽（同源 iframe 模拟，Chrome 窗口最窄 614）：无横向溢出；标题换两行 53px；三个卖点均为文案在上 demo 在下；自检 Tab 单行；标签不换行。
  - 浅色主题：绿色文字最低对比度 5.02:1，橙色 4.63:1。
  - 本地与生产游客 `/api/pricing` 都返回 0 个模型，价目区只能看到空态，有数据时的表格由单元测试覆盖。

## 遗留

- **手册第 8 节待确认项**：
  1. 品牌写法：已定 Hero 用 TokenFunc，其余不动。
  2. 运行质量六项数字与口径：未确认，`QUALITY_METRICS` 是原型占位，上线前必须定；后端没有能直接提供这些指标的接口。
  3. Gemini 注脚日期：已改为不带日期。
  4. 「不写入数据库或磁盘」：文案已收窄，上线前仍需核对错误日志与异步任务表是否落正文。
  5. 兼容工具 logo 与文档页：logo 10 个齐全；OpenCode、千问 Work、Kimi Work、CC Switch 缺文档配置页，暂链到工具概览页。
  6. 手机端 Hero：已定逗号后换行。
- **生产价目为空**：生产游客 `/api/pricing` 返回 0 个模型（11-06 迁移后既有），上线后价目区会一直显示「价目同步中」，需要先解决游客定价可见性。
- OpenCode、千问 Work、Kimi Work 的官方图标是黑色底块，深色主题下底块融入背景，图形仍可辨认；如需更清楚可给图标加浅色描边。
- 账单 demo 副行在窄屏改为单行截断（浏览器验收时发现折行拆开了 key）。
- 关于页六张卡里运行质量的说明含「渠道上线前逐项检测」等表述，同样依赖第 2 项确认。
