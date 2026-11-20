# TokenFunc 渠道分组与定价倍率规划

> 状态：v2（2026-11-20），第 5 节迁移已于当日在生产执行完毕（5.9）；v2 把号池改为三档结构并定下同行资源归组规则（D4 / D9 / D10），生产 label 调整待执行（5.10）；第 6 节文案改动未做
> 范围：渠道分组的命名规范、分组总表与基准倍率、用户分组矩阵、存量迁移步骤、落地页文案改动清单
> 不在范围：充值汇率与毛利核算、报价单分组（见「7. 遗留」）、代码改动
> 机制依据：分组定价功能（PR #76，`docs/worklog/2026-11-05-feat-group-pricing-matrix.md`）——渠道分组注册表 `tokenfunc_group_setting.channel_groups` 只存名称与排序，key 以 `GroupRatio` 为准；用户分组显式维护可见渠道分组列表与 `channel_order`，覆盖倍率写 `GroupGroupRatio`；计费链路不变

---

## 0. 决策摘要

| # | 决策 | 理由 |
|---|---|---|
| D1 | **渠道分组 = 同一上游平台、同一成本档、同一用途约束的渠道集合**；拆分只因成本不同、用途 / 质量承诺不同、协议语义不同 | 分组的唯一作用是"走哪个池、按什么价"，其它维度都不该进分组 |
| D2 | **客户差异一律走用户分组 × 覆盖倍率，绝不按客户 / 按价格建渠道分组** | tokensolo 的 `aws24` / `aws26` / `aws_linshi27` / `awsth32` 把客户和价格做成了渠道分组，渠道挂载与定价纠缠，后期无法清理 |
| D3 | **渠道分组一次全建（注册表 + `GroupRatio`），可见性当上架开关**：没有启用渠道的分组不勾进任何用户分组的可见列表 | 不可见的分组不会出现在令牌下拉、模型广场和 `/v1/models`，但管理员渠道编辑能选到，供应商到货只需勾可见；避免空分组误导客户（tokensolo `claudeguanss`） |
| D4 | **号池分三档，一条渠道只进一档**：`default` = 混合号池（自营普通账号 + 同行号池，按模型自动分流）；`pool_<family>` = 高质量专池（只挂自营高优先账号）；`pool_<family>_lite` = 特价池。高优先账号不再同时挂 `default`；云厂商 / 厂商 API 渠道不挂 `default` | 个人用户零配置可用；档位和倍率一一对应，客户买 `default` 价不会拿到高质量池；`default` 有明确定义，不再是垃圾桶（tokensolo `default` 池 51 条渠道 CC 与 GPT 混挂）。v1 曾定义 `default` 为 `pool_*` 并集，v2 因将接入同行资源改为三档 |
| D5 | **命名 `<platform>_<family>[_<qualifier>]`**，全小写下划线；key 不含客户名、价格、模型版本 | 可读、可 grep、与用户分组 key 正则 `^[a-z0-9][a-z0-9_-]{0,63}$` 一致 |
| D6 | **`f5` 允许进 key，但它是供应商定价代际标签**：下一代模型出现时新建分组（如 `awsb_claude_f6`）并下线旧组，不改旧 key 语义 | 按模型代际命名必然过期（tokensolo `azgpt_6` / `azgptno6`），用"新建 + 下线"而不是"改含义"来处理 |
| D7 | **号池对全部用户可见，label 标注【订阅】**（订阅账号即官方订阅，与落地页「官方订阅号池」同口径；「官逆」只用于内部与供应商沟通）；落地页"官 Key 直连 / 无逆向接口"文案同步修改（本文只列清单） | 信任承诺是"不降级不替换、返回原始响应、来源透明"，不是"全部官 Key" |
| D8 | **基准倍率沿用 tokensolo `default` 等级的数值** | 同一经营者、同一批供应商成本；上线前按汇率核一遍毛利即可 |
| D9 | **分组名回答"请求最终跑在哪"，不回答"谁卖给我们"**：同行转售的资源按真实上游平台进既有分组，档位按实测质量定，供应商名只写渠道名 | 平台来源藏不住（模型 ID 格式、响应头、报错文案一试即分），且是企业客户的合规与用途决策依据；供应商与进价才是商业机密。按供应商建组是 tokensolo `aws_linshi27` 烂掉的根源 |
| D10 | **第三方自部署开源权重单独建 `selfhost_*` 分组并标【自部署】**，接入前过模型自检，通不过不挂 | 自部署可能量化裁剪，混进订阅号池或厂商 API 分组就是掺假，直接违反信任承诺 |

---

## 1. 命名字典

### 1.1 platform（上游平台）

| platform | 含义 | 渠道类型 |
|---|---|---|
| `pool` | 自营订阅号池：tokenfunc-sub2api / tokenfunc-codex2api / tokenfunc-crs | 59 / 1 / 14 |
| `awsb` | AWS Bedrock，供应商转售 | 14 或 1，看供应商协议 |
| `azure` | Azure OpenAI / Azure AI Foundry | 3 |
| `vertex` | Google Vertex AI | 41 |
| `anthropic` / `openai` / `deepseek` / `xai` / `moonshot` / `zhipu` / `minimax` | 厂商 API；自持 key 还是第三方转售不进 key，记在渠道备注 | 14 / 1 / 43 / 48 / 25 / 16 / 35 |
| `selfhost` | 第三方自部署的开源权重模型（如同行自建的 Kimi K3 / GLM 5.3），与订阅号池、厂商 API 是三个不同来源 | 按供应商，多为 1（OpenAI 兼容） |
| `media` | 图像 / 视频生成 | 按供应商 |

### 1.2 family（模型族）

`claude` / `gpt` / `gemini` / `grok` / `cn`（GLM · Kimi · MiniMax 国产订阅）/ `image` / `video`。platform 本身已经唯一指向模型族时省略（如 `deepseek`）。

### 1.3 qualifier（限定词）

| qualifier | 含义 | 客户可见说法 |
|---|---|---|
| `coding` | 不可蒸：供应商只允许编程 / 对话用途，批量生成或数据蒸馏会被供应商封号 | 不可蒸 |
| `f5` | 池内含 Claude Fable 5.x，供应商报价更高 | 含F5 |
| `lite` | 特价低质量池，不承诺稳定性 | 特价 |

未带 `coding` 的 Bedrock 分组标 `可蒸`：供应商允许批量生成 / 数据蒸馏用途。

号池（`pool`）的档位靠 key 形态区分，不另加限定词：

| key 形态 | 档位 | 挂什么 |
|---|---|---|
| `default` | 混合号池 | 自营普通账号 + 同行号池，按模型自动分流 |
| `pool_<family>` | 高质量专池 | 只挂自营高优先账号 |
| `pool_<family>_lite` | 特价池 | 低质量 / 限速账号，不承诺稳定性 |

档位按实测质量定，不按自营 / 同行定：同行号池实测够格也可进 `pool_<family>`。

### 1.4 label 格式

`【平台】模型族 · 限定词`，限定词按 `含F5 · 可蒸` 的顺序，整个 label 控制在 30 个字符内（含【】与分隔符），否则分组列表里展示不全。限定词用缩略语（`可蒸` / `不可蒸` / `含F5` / `特价`），含义以 1.3 表为准；需要向客户解释时引用本文，不往 label 里堆字。

号池 label 写成 `【订阅】<模型族> <档位>号池`，模型族列具体名字不写"综合""国产"这类泛称：`【订阅】Claude 高质量号池`、`【订阅】GLM · Kimi · MiniMax 高质量号池`、`【订阅】GPT 特价号池`；混合池写全模型族 `【订阅】Claude · GPT · 国产 混合号池`。

---

## 2. 渠道分组总表

倍率口径：相对上游官方 USD 列表价的倍数，由 `GroupRatio` 承载；`default` 用户分组按基准倍率计费，企业用户分组按覆盖倍率。

### 2.1 Phase 1

全部分组在迁移时一次建好（注册表 + `GroupRatio`）；只有 `default` / `pool_gpt` / `pool_claude` / `pool_cn` 勾进用户分组的可见列表，`awsb_*` / `azure_gpt` / `vertex_gemini` 到货当天再勾可见（见 2.4）。

| order | key | label | 基准倍率 | 渠道类型 | 说明 |
|---|---|---|---|---|---|
| 0 | default | 【订阅】Claude · GPT · 国产 混合号池 | 1.0 | 59 / 1 / 14 | 混合号池：自营普通账号 + 同行号池，按模型自动分流，个人零配置可用 |
| 1 | pool_gpt | 【订阅】GPT 高质量号池 | 1.0 → 1.2 | 1 (codex2api) / 59 | 原 `gptpro`；高质量专池 |
| 2 | pool_claude | 【订阅】Claude 高质量号池 | 1.0 → 1.2 | 14 (crs) / 59 | 原 `claudepro`；高质量专池 |
| 3 | pool_cn | 【订阅】GLM · Kimi · MiniMax 高质量号池 | 1.0 → 1.2 | 59 | 新建，接收现挂在 gptpro 的 glm 与挂在 claudepro 的 kimi；高质量专池 |
| 10 | awsb_claude_coding | 【AWS Bedrock】Claude · 不可蒸 | 1.0 | 14 / 1 | 不可蒸，不含 Fable 5；tokensolo `awsb_coding` |
| 11 | awsb_claude | 【AWS Bedrock】Claude · 可蒸 | 1.3 | 14 / 1 | 不含 Fable 5；tokensolo `awszl` / `awsquan` |
| 12 | awsb_claude_f5 | 【AWS Bedrock】Claude · 含F5 · 可蒸 | 1.4 | 14 / 1 | tokensolo `awsf5` |
| 13 | awsb_claude_coding_f5 | 【AWS Bedrock】Claude · 含F5 · 不可蒸 | 1.1 | 14 / 1 | 预留，暂无供应商，不建 |
| 20 | azure_gpt | 【Azure】GPT | 1.1 | 3 | tokensolo `azgpt` |
| 30 | vertex_gemini | 【Vertex】Gemini | 1.2 | 41 | tokensolo `gemini_quan` |

`pool_*` 的 `1.0 → 1.2`：现在只有自营一档账号，三个专池与 `default` 挂的是同一批渠道，两档同价；同行号池挂进 `default` 那天，把自营高优先账号从 `default` 摘掉并把 `pool_*` 调到 1.2，之前不上调（否则"高质量"是多收钱不多给货）。

Bedrock 四格的关系：

```
                 不含 Fable 5            含 Fable 5
可批量蒸馏   awsb_claude        1.3   awsb_claude_f5          1.4
仅编程对话   awsb_claude_coding 1.0   awsb_claude_coding_f5   1.1（预留）
```

同一条供应商渠道只挂一格；供应商同时给"可蒸 + 含 F5"货时挂 `awsb_claude_f5`，不要为了凑模型把它同时挂到 `awsb_claude`。

### 2.2 Phase 2

按供应商到位顺序建，倍率参考 tokensolo `default` 等级。

| order | key | label | 基准倍率 | 渠道类型 | 对应 tokensolo |
|---|---|---|---|---|---|
| 21 | azure_claude | 【Azure】Claude | 1.3 | 3 | `azclaude` |
| 40 | anthropic_claude | 【Anthropic】Claude | 1.4 | 14 | `anth_Guan` |
| 41 | openai_gpt | 【OpenAI】GPT | 1.1 | 1 | `gpt_oai` |
| 50 | deepseek | 【DeepSeek】 | 1.0 | 43 | 生产 2026-10 曾有 DeepSeek 渠道 |
| 51 | xai_grok | 【xAI】Grok | 1.2 | 48 | `grok` |
| 52 | moonshot_kimi | 【Moonshot】Kimi | 1.3 | 25 | `kimi_guan` |
| 53 | zhipu_glm | 【智谱】GLM | 1.0 | 16 | — |
| 54 | minimax | 【MiniMax】 | 1.0 | 35 | — |
| 55 | selfhost_cn | 【自部署】GLM · Kimi | 待实测，预期全场最低档 | 按供应商 | 同行自建开源权重；接入前过模型自检（D10） |
| 60 | pool_gpt_lite | 【订阅】GPT 特价号池 | 0.4 | 59 | `gpttj`；只对企业用户分组可见 |
| 70 | media_image | 【图像】GPT Image | 1.0 | 按供应商 | `gptimage` |
| 71 | media_video | 【视频】Seedance | 1.0 | 按供应商 | `sd_gj` |

### 2.3 可见性 = 上架开关

上游 new-api 的规则是：分组在 `GroupRatio` 里但不在 `UserUsableGroups` 里，用户就看不到、选不到。二开（PR #76）把基线 `UserUsableGroups` 清空，改为每个用户分组显式勾选自己的可见列表（`group_special_usable_group` 的 `+:` 项），规则没有关掉，只是粒度从全局变成按用户分组。各入口对不可见分组的处理：

| 入口 | 数据来源 | 不可见分组 |
|---|---|---|
| 令牌分组下拉 `GET /api/tokenfunc/groups/self` | `ListUserSelectableChannelGroups` | 不出现 |
| 模型广场 `GET /api/pricing` 的 `usable_group` / `group_ratio` | `GetUserUsableGroups` | 不出现，模型也被过滤 |
| `/v1/models`、企业留空令牌 auto 候选 | `ResolveUsingGroupCandidates` | 不进候选 |
| 令牌保存时的分组校验 | `IsUserSelectableGroup` | 拒绝 |
| 管理员渠道编辑的分组下拉 `GET /api/tokenfunc/groups/channel` | `ListChannelGroups` 全量注册表 | 出现，可以挂渠道 |

例外：用户分组 key 与渠道分组 key 同名时永远可见（上游规则），只影响 `default`。

上架流程：供应商到货 → 渠道管理挂到对应分组 → 分组定价页在 `default`（及签约企业）的可见列表里勾上该分组 → 保存。下架反过来：先取消勾选，再禁用渠道。

### 2.4 成本参考

tokensolo 2026-11-19 渠道快照里的成本倍率（人民币 / 官方价 $1）：

| 上游 | 成本倍率 |
|---|---|
| 号池 | 0.14 – 0.8 |
| Azure GPT | 1.2 – 2.2 |
| AWS Bedrock Claude | 1.7 – 2.5 |
| Gemini | 1.7 – 2.0 |
| Anthropic 官转 | 2.6 – 3.2 |

每个分组上线前按 `基准倍率 × 充值汇率 − 成本倍率` 核一遍毛利；企业覆盖倍率低于基准时同样核。

---

## 3. 用户分组矩阵

### 3.1 `default`（individual）

- 可见：全部 Phase 1 分组（`pool_gpt_lite` 不可见）
- `channel_order`：`default, pool_gpt, pool_claude, pool_cn, awsb_claude_coding, awsb_claude, awsb_claude_f5, azure_gpt, vertex_gemini`
- 倍率：全部走基准，不写覆盖
- 留空令牌：`default` 既是用户分组又是渠道分组，候选只有它自己，走混合号池

### 3.2 企业（enterprise）

- 一客户一用户分组，key 用客户英文 / 拼音简称（`ddjs` 沿用），kind = enterprise
- 只勾签约的渠道分组；倍率写覆盖；`channel_order` 首位 = 该客户主用池，留空令牌按候选顺序走 auto
- 候选上限 `MaxTokenAutoGroups`（默认 5）：企业勾选超过 5 个池时留空令牌会被截断，勾选多时先调大
- 价格档位（如"同行 2.9"）建成可共享的用户分组 `tier_<name>`，多客户共用；不建渠道分组

`ddjs`（多点计算科技）迁移后：

| 渠道分组 | 基准 | 覆盖 | 生效 |
|---|---|---|---|
| pool_gpt | 1.0 | 0.5 | 0.5 |
| pool_claude | 1.0 | 0.5 | 0.5 |
| pool_cn | 1.0 | 0.5 | 0.5 |

---

## 4. 渠道挂载规则

一条渠道只属于一个分组（D4）。渠道分组字段虽是逗号分隔的多值，本文不使用多值；过渡期例外见末段。

| 渠道 | 挂到 |
|---|---|
| 自营高优先账号：codex2api / crs / sub2api 主力账号 | `pool_gpt` / `pool_claude` / `pool_cn` |
| 自营普通账号、同行 Claude / GPT / 国产号池 | `default`；实测质量够格可进 `pool_<family>`，差的进 `pool_<family>_lite` |
| 特价 / 限速账号 | `pool_<family>_lite`，不挂 `default` |
| Bedrock（自营或同行） | 四格之一，按供应商合同的可蒸 / 含F5 条款归格，不按供应商拆 |
| Azure / Vertex / 厂商 API（自营或同行） | 各自分组，不挂 `default`；同行低价渠道是同平台同产品就进原组（低成本是利润，不是分类），限速 / 无保障 / 旧区域才建 `_lite` |
| 同行自部署开源权重 | `selfhost_<family>`，不进 `pool_*` 也不进厂商 API 分组 |

同行资源的三条规则（D9 / D10）：

1. 供应商名只写渠道名，格式 `<供应商简称> · <分组 key> · <序号>`（如 `laotian · awsb_claude_f5 · 01`），客户只看到分组。
2. 不为供应商建分组、不为进价建分组。
3. 自部署渠道接入前跑落地页的模型自检，通不过不挂。

过渡期（2026-11-20 起，同行号池接入前）：生产只有自营一档账号，现有 7 条号池渠道仍同时挂 `default` 与各自的 `pool_*`，保证 `default` 有货。同行号池接入当天把这 7 条从 `default` 摘掉，同时按 2.1 上调 `pool_*` 倍率。

---

## 5. 存量迁移：gptpro → pool_gpt，claudepro → pool_claude，拆出 pool_cn

全部走后台操作，SQL 只做快照、校验与兜底。生产现状（2026-11-19）：渠道 8 条，用户分组 `default` / `ddjs`，令牌分组全部为 `default` 或空。

### 5.1 迁移前快照

```sql
SELECT id, name, type, "group", status FROM channels ORDER BY id;
SELECT "group", count(*) FROM tokens GROUP BY 1;
SELECT "group", count(*) FROM users GROUP BY 1;
SELECT key, value FROM options WHERE key IN (
  'GroupRatio',
  'GroupGroupRatio',
  'UserUsableGroups',
  'group_ratio_setting.group_special_usable_group',
  'tokenfunc_group_setting.channel_groups',
  'tokenfunc_group_setting.user_groups',
  'AutoGroups'
);
```

### 5.2 建新分组（系统设置 › 分组定价，Root）

1. 渠道分组区按 2.1 表一次新增全部 Phase 1 分组（`pool_gpt` / `pool_claude` / `pool_cn` / `awsb_claude_coding` / `awsb_claude` / `awsb_claude_f5` / `azure_gpt` / `vertex_gemini`），倍率、label、order 照表；`awsb_claude_coding_f5` 不建。
2. 用户分组区：`ddjs` 只勾三个号池，倍率 0.5，顺序 gpt → claude → cn；`default` 只勾三个号池。`awsb_*` / `azure_gpt` / `vertex_gemini` 不勾，等到货。
3. 一次保存。接口是 `PUT /api/tokenfunc/groups/settings`，一个事务落库。

### 5.3 改渠道分组字段（渠道管理）

| 渠道 | 现分组 | 改为 |
|---|---|---|
| #1 / #7 / #11 Codex 系 | gptpro | `default,pool_gpt` |
| #12 crs | claudepro | `default,pool_claude` |
| #8 glm-5.3 | gptpro | `default,pool_cn` |
| #4 kimi-k3 | claudepro | `default,pool_cn` |
| 其余 | — | 按模型族归位 |

编辑渠道时会重建该渠道的 abilities；全部改完后再调一次 `POST /api/channel/fix` 兜底重建。

### 5.4 令牌

```sql
SELECT count(*) FROM tokens WHERE "group" IN ('gptpro', 'claudepro');
-- 非 0 再执行
UPDATE tokens
SET "group" = CASE "group" WHEN 'gptpro' THEN 'pool_gpt' ELSE 'pool_claude' END
WHERE "group" IN ('gptpro', 'claudepro');
```

### 5.5 删旧分组

分组定价页删除 `gptpro` / `claudepro`。前提：channels、tokens、`GroupGroupRatio`、`group_special_usable_group` 都不再引用；保存一次。

### 5.6 校验

```sql
SELECT count(*) FROM channels WHERE "group" ~ '(^|,)(gptpro|claudepro)(,|$)';
SELECT count(*) FROM tokens   WHERE "group" IN ('gptpro', 'claudepro');
SELECT count(*) FROM users    WHERE "group" IN ('gptpro', 'claudepro');
SELECT key FROM options WHERE value LIKE '%gptpro%' OR value LIKE '%claudepro%';
SELECT "group", count(*) FROM abilities GROUP BY 1;
```

五条查询全部为 0 或不含旧 key。然后：

- 用 ddjs 账号调 `GET /api/tokenfunc/groups/self`，`groups[]` 为三个新池，`default_group = pool_gpt`
- ddjs 留空令牌各打一次 glm-5.3 与 gpt-5.6，日志里使用分组分别是 `pool_cn` / `pool_gpt`，倍率 0.5
- default 用户令牌打 glm-5.3，使用分组 `default`，倍率 1
- 模型广场以 default 用户查看，只有四个号池分组；`awsb_*` / `azure_gpt` / `vertex_gemini` 不出现
- 渠道管理新建渠道的分组下拉能看到全部 9 个分组

### 5.7 附录：本次迁移后的 option 值

`GroupRatio`（Phase 1 全量）：

```json
{
  "default": 1,
  "pool_gpt": 1,
  "pool_claude": 1,
  "pool_cn": 1,
  "awsb_claude_coding": 1,
  "awsb_claude": 1.3,
  "awsb_claude_f5": 1.4,
  "azure_gpt": 1.1,
  "vertex_gemini": 1.2
}
```

`tokenfunc_group_setting.channel_groups`：

```json
{
  "default":            {"label": "【订阅】Claude · GPT · 国产 混合号池", "order": 0},
  "pool_gpt":           {"label": "【订阅】GPT 高质量号池", "order": 1},
  "pool_claude":        {"label": "【订阅】Claude 高质量号池", "order": 2},
  "pool_cn":            {"label": "【订阅】GLM · Kimi · MiniMax 高质量号池", "order": 3},
  "awsb_claude_coding": {"label": "【AWS Bedrock】Claude · 不可蒸", "order": 10},
  "awsb_claude":        {"label": "【AWS Bedrock】Claude · 可蒸", "order": 11},
  "awsb_claude_f5":     {"label": "【AWS Bedrock】Claude · 含F5 · 可蒸", "order": 12},
  "azure_gpt":          {"label": "【Azure】GPT", "order": 20},
  "vertex_gemini":      {"label": "【Vertex】Gemini", "order": 30}
}
```

`GroupGroupRatio`（只记与基准不同的覆盖）：

```json
{"ddjs": {"pool_gpt": 0.5, "pool_claude": 0.5, "pool_cn": 0.5}}
```

`group_ratio_setting.group_special_usable_group`（显式可见列表，只勾有货的三个号池；`awsb_*` / `azure_gpt` / `vertex_gemini` 到货再加）：

```json
{
  "default": ["+:pool_gpt", "+:pool_claude", "+:pool_cn"],
  "ddjs":    ["+:pool_gpt", "+:pool_claude", "+:pool_cn"]
}
```

`tokenfunc_group_setting.user_groups` 中 `ddjs.channel_order`：`["pool_gpt", "pool_claude", "pool_cn"]`。

---

### 5.9 执行记录（2026-11-20）

生产实际状态与 5.3 的假设不同：迁移时渠道分组为 `default` / `gptpro` / `claudepro` / `gptfree`(0.3) / `gz_deepsek`，`gptpro` / `claudepro` 下已无渠道，8 条渠道除 #10（`default,gptfree`）、#2（`gz_deepsek`）外全在 `default`。按规范一并改名：

| 旧 key | 新 key | 倍率 | 渠道 |
|---|---|---|---|
| gptpro | pool_gpt | 1 | #5 Codex Pro、#11 codex2api（禁用中） |
| claudepro | pool_claude | 1 | #12 crs（禁用中） |
| 新建 | pool_cn | 1 | #8 GLM、#4 Kimi、#6 MiniMax |
| gptfree | pool_gpt_lite | 0.3 | #10 Codex 0.5x |
| gz_deepsek | deepseek | 1 | #2 DeepSeek |

- 通过 Root 令牌走接口执行，脚本与各步请求体在 `.tmp/group-migration-20261120/`（不入库）；顺序：snapshot → groups（新旧 key 并存）→ pricing → channels + `POST /channel/fix`（8/8）→ cleanup → verify。
- 一次建全 Phase 1 的 11 个分组（含 `deepseek`、`pool_gpt_lite`），`awsb_*` / `azure_gpt` / `vertex_gemini` 不可见。
- `default` 可见：default, pool_gpt, pool_claude, pool_cn, pool_gpt_lite；`ddjs` 可见：pool_gpt 0.5, deepseek 1, pool_claude 0.45, pool_cn 0.5（pool_cn 为新加，此前 ddjs 拿不到国产模型）。`vip` 用户分组（0 人）未动。
- `TopupGroupRatio` 里的 `gptpro` 一并清掉。
- 校验：渠道 / options 无旧 key；三个副本的分组列表均为 11 个；root（default 分组）的令牌分组接口返回 4 个新池名称，`default` 自身描述仍是上游占位 "User group"，待 `fix(group)` 135038735 发版后显示注册表名称；`/v1/models` 16 个与迁移前一致。ddjs 留空令牌的实打未做（无 ddjs 密钥）。

### 5.10 号池 label 调整（v2 决策，待执行）

5.9 执行时用的是 v1 的 label（`【订阅】综合` / `【订阅】GPT` / `【订阅】Claude` / `【订阅】国产` / `【订阅】GPT 特价`），v2 改为 1.4 的号池格式，目标值见 5.7 的注册表 JSON（`pool_gpt_lite` 为 `【订阅】GPT 特价号池`）。只动 `tokenfunc_group_setting.channel_groups`，不碰 `GroupRatio`、渠道与计费。

前置：先发版 `fix(group)` 135038735。不发版就改名，客户侧令牌下拉与模型广场仍显示旧名（根因见 `docs/worklog/2026-11-20-fix-channel-group-label-sync.md`）。

## 6. 落地页 / 文案改动清单

D7 的后续代码项，本次不改。口径：来源逐组标注（厂商 API / 云平台 / 订阅号池），不降级不替换，返回上游原始响应。

| 位置 | 现文案 | 改为 |
|---|---|---|
| `web/src/features/landing/content.ts` fidelity 卡 description | Official API keys connect directly to each vendor. The model you request is the model that runs… | 去掉 "Official API keys connect directly"；改为"每个渠道分组都标明上游来源（厂商 API / 云平台 / 订阅号池）。请求哪个模型就运行哪个模型，不降级、不替换，返回上游原始响应" |
| 同文件 fidelity 卡 point | Official keys, no reverse-engineered endpoints | 来源透明标注，无静默替换 |
| `web/src/features/landing/components/hero.tsx` 顶部徽标 | OFFICIAL · 直连 Claude / GPT / Gemini / Grok 官方源头渠道 | 厂商 API · 云平台 · 订阅号池，来源逐组标注 |
| `hero.tsx` 主文案；`web/src/features/about/components/brand-about.tsx` 同句 | 企业级用户专用，官方直连 Anthropic、OpenAI、Google、xAI… | 企业级用户专用，Claude / GPT / Gemini / Grok 多来源供应、来源逐组标注… |
| `web/src/features/auth/auth-layout.tsx` SIGN_IN_STATS | Official pool | Subscription pool |
| 同文件 SIGN_UP_POINTS 第 1 条 | Official direct access, real models with no substitution | 来源透明，真模型不掺假 |
| 同文件登录页副标题 | Official direct access to Claude / GPT / Gemini / Grok… | 同 hero 口径 |
| `web/src/i18n/locales/tokenfunc/zh.json` 对应译文 | — | 同步 6 条 |
| `setting/quote_setting/config.go` 报价单内置分组 | Claude 官方满血版 / 第三方反代版 | Phase 2 对齐到本文分组命名 |

保留不动："500+ 官方订阅号池"（订阅号本身是官方订阅，表述准确）、"美元计价，与上游官方价同步"、"返回上游原始响应"、模型自检四步。

---

## 7. 遗留

- `ChannelGroupMeta` 没有 description 字段，用途限制只能塞进 label；需要更长说明（如供应商封号条款原文）时加字段并在模型广场 / 令牌下拉展示，属代码项。
- `awsb_claude_coding_f5` 暂无供应商，不建；其余无货分组已建但不可见，到货勾可见即可。
- 报价单内置分组（`setting/quote_setting/config.go`）与本文分组是两套命名，Phase 2 对齐。
- 企业勾选池数超过 `MaxTokenAutoGroups`（默认 5）时留空令牌被截断，需同步调大。
- 第 6 节文案改动未执行，落地页仍写"官 Key 直连 / 无逆向接口"，与号池全员可见冲突，应在号池对个人用户开放前改完。
- 5.10 号池 label 调整未执行，等 `fix(group)` 135038735 发版。
- 同行号池接入当天的两件事（第 4 节末段）：把 7 条自营渠道从 `default` 摘掉；`pool_*` 倍率 1.0 → 1.2。
- `selfhost_cn` 倍率待实测后定；模型自检通过标准沿用落地页四步。
