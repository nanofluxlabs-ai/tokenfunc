// Package service · quote_template.go（TokenFunc 二开）
//
// 报价单 Markdown 渲染器。数据（分组 / 模型 / 性能指标 / 元信息 / 图片计费）来自
// setting/quote_setting 配置（管理员在后台维护，保存即生效）；本文件只保留
// 报价单的「结构与文案骨架」：章节编号、表头、计费规则、各类长说明块。
package service

import (
	"bytes"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/quote_setting"
)

// QuoteRequest 是生成报价单的输入参数。
type QuoteRequest struct {
	// Discounts 各分组折扣，key 为 QuoteGroup.Key，值 0-100（50 表示 5 折）。
	// 缺失或 ≤0 的分组回填该组 DefaultDiscount。
	Discounts     map[string]float64 `json:"discounts"`
	ExchangeRate  float64            `json:"exchange_rate"`  // 1 USD = N CNY，例如 6.85
	ValidityDays  int                `json:"validity_days"`  // 有效期天数，例如 30
	GeneratedDate string             `json:"generated_date"` // YYYY-MM-DD；为空时取今日
}

// QuoteResponse 是报价单生成结果。
type QuoteResponse struct {
	Markdown      string `json:"markdown"`
	GeneratedDate string `json:"generated_date"`
	ExpiryDate    string `json:"expiry_date"`
}

// validateAndFillQuoteRequest 将零值替换为配置默认值并做范围校验。
func validateAndFillQuoteRequest(req *QuoteRequest, cfg *quote_setting.QuoteSetting) error {
	if req.Discounts == nil {
		req.Discounts = make(map[string]float64)
	}
	for _, g := range cfg.Groups {
		if req.Discounts[g.Key] <= 0 {
			req.Discounts[g.Key] = g.DefaultDiscount
		}
		if v := req.Discounts[g.Key]; v <= 0 || v > 100 {
			return fmt.Errorf("分组 %s 折扣必须在 (0, 100] 范围内，当前 %.2f", g.Key, v)
		}
	}
	if req.ExchangeRate <= 0 {
		req.ExchangeRate = cfg.Meta.DefaultExchangeRate
	}
	if req.ValidityDays <= 0 {
		req.ValidityDays = cfg.Meta.DefaultValidityDays
	}
	if req.GeneratedDate == "" {
		req.GeneratedDate = time.Now().Format("2006-01-02")
	}
	if req.ExchangeRate < 1 || req.ExchangeRate > 20 {
		return fmt.Errorf("汇率取值范围 [1, 20]，当前 %.2f", req.ExchangeRate)
	}
	if req.ValidityDays < 1 || req.ValidityDays > 365 {
		return fmt.Errorf("有效期取值范围 [1, 365] 天，当前 %d", req.ValidityDays)
	}
	if _, err := time.Parse("2006-01-02", req.GeneratedDate); err != nil {
		return errors.New("生成日期格式必须为 YYYY-MM-DD")
	}
	return nil
}

// fmtMoney 把 USD 数额格式化为 "$X.XX"（小于 1 时保留 4 位）。
func fmtMoney(usd float64) string {
	if usd < 1 {
		return fmt.Sprintf("$%.4f", usd)
	}
	return fmt.Sprintf("$%.2f", usd)
}

// fmtCNY 把 CNY 数额格式化为 "¥X.XX"。
func fmtCNY(cny float64) string {
	if cny < 1 {
		return fmt.Sprintf("¥%.4f", cny)
	}
	return fmt.Sprintf("¥%.2f", cny)
}

// fmtPair 输出一行「官方价 $X / 折后 $Y<br/>¥A / ¥B」格式。
func fmtPair(officialUSD, discountedUSD, rate float64) string {
	if officialUSD == 0 {
		return "—"
	}
	return fmt.Sprintf("官方 %s / **%s**<br/>%s / **%s**",
		fmtMoney(officialUSD),
		fmtMoney(discountedUSD),
		fmtCNY(officialUSD*rate),
		fmtCNY(discountedUSD*rate),
	)
}

// cnNumerals 章节序号转中文数字（报价单顶级章节数有限，超出范围回退阿拉伯数字）。
var cnNumerals = []string{"零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
	"十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"}

func cnSectionNum(n int) string {
	if n >= 0 && n < len(cnNumerals) {
		return cnNumerals[n]
	}
	return strconv.Itoa(n)
}

// sortedQuoteGroups 返回按 Order 升序的分组副本。
func sortedQuoteGroups(cfg *quote_setting.QuoteSetting) []quote_setting.QuoteGroup {
	groups := make([]quote_setting.QuoteGroup, len(cfg.Groups))
	copy(groups, cfg.Groups)
	sort.SliceStable(groups, func(i, j int) bool { return groups[i].Order < groups[j].Order })
	return groups
}

// GenerateQuoteMarkdown 渲染一份完整 Markdown 报价单。
func GenerateQuoteMarkdown(req QuoteRequest) (*QuoteResponse, error) {
	cfg := quote_setting.GetQuoteSetting()
	if err := validateAndFillQuoteRequest(&req, cfg); err != nil {
		return nil, err
	}

	// 计算有效期
	startDate, _ := time.Parse("2006-01-02", req.GeneratedDate)
	expiryDate := startDate.AddDate(0, 0, req.ValidityDays).Format("2006-01-02")
	rate := req.ExchangeRate
	groups := sortedQuoteGroups(cfg)

	var buf bytes.Buffer
	writeQuoteHeader(&buf, req, expiryDate, rate, cfg.Meta)
	writeServiceCapability(&buf, cfg.Capability)
	for i, g := range groups {
		writeGroupSection(&buf, g, cfg, i+2, req.Discounts[g.Key]/100.0, rate)
	}
	writeBillingRules(&buf, rate, cfg.Meta, len(groups)+2)
	writeValidityFooter(&buf, req.GeneratedDate, expiryDate, req.ValidityDays, len(groups)+3, cfg.Meta.BrandName)
	writeAppendix(&buf, groups, cfg)

	return &QuoteResponse{
		Markdown:      buf.String(),
		GeneratedDate: req.GeneratedDate,
		ExpiryDate:    expiryDate,
	}, nil
}

func writeQuoteHeader(buf *bytes.Buffer, req QuoteRequest, expiry string, rate float64, meta quote_setting.QuoteMeta) {
	fmt.Fprintf(buf, "# %s\n", meta.DocTitle)
	fmt.Fprintln(buf)
	fmt.Fprintf(buf, "**版本**：%s  ·  **有效期**：%d 天（至 **%s**）\n\n",
		req.GeneratedDate, req.ValidityDays, expiry)
	fmt.Fprintf(buf,
		"> %s所有官方报价以 **USD per 1M tokens** 为单位，折算人民币时统一采用汇率 **1 USD = %.2f CNY**（与签约同期一致，正式扣费按当期实际汇率结算）。\n\n",
		meta.HeaderIntro, rate)
	fmt.Fprintln(buf, "---")
	fmt.Fprintln(buf)
}

// writeCapRows 输出性能指标表的行（cells 按 | 连接）。
func writeCapRows(buf *bytes.Buffer, rows []quote_setting.CapRow) {
	for _, r := range rows {
		fmt.Fprintln(buf, "| "+strings.Join(r.Cells, " | ")+" |")
	}
}

func writeServiceCapability(buf *bytes.Buffer, cap quote_setting.CapabilityTables) {
	buf.WriteString("## 一、服务能力速览\n\n")
	fmt.Fprintf(buf, "> %s\n\n", cap.SourceNote)

	buf.WriteString("### 1.1 平台吞吐能力（全平台共享）\n\n| 指标 | 数值 | 备注 |\n|---|---|---|\n")
	writeCapRows(buf, cap.PlatformThroughput)

	buf.WriteString("\n### 1.2 单用户场景承载（保守口径）\n\n| 用户类型 | 平均请求频率 | 完美体验同时在线 | 推荐稳态同时在线 | 突发承载 |\n|---|---|---|---|---|\n")
	writeCapRows(buf, cap.PerUserScenario)

	buf.WriteString("\n### 1.3 单客户速率承诺（保守口径）\n\n")
	fmt.Fprintf(buf, "> %s\n\n", cap.RateCommitmentNote)
	buf.WriteString("| 指标 | 数值（保守稳态） |\n|---|---|\n")
	writeCapRows(buf, cap.RateCommitment)

	buf.WriteString("\n---\n\n")
}

// subgroupTitle 模型子组在小节标题中的展示文案；standard 用组上配置的 ModelTableTitle。
func subgroupTitle(g quote_setting.QuoteGroup, subgroup string) string {
	switch subgroup {
	case "standard":
		return g.ModelTableTitle
	case "codex":
		return "代码专用（Codex）"
	default:
		return subgroup
	}
}

// writeModelTableHeader 按渲染类型输出模型表表头。
func writeModelTableHeader(buf *bytes.Buffer, g quote_setting.QuoteGroup) {
	if g.RenderType == quote_setting.RenderTypeCacheTable {
		fmt.Fprintf(buf, "| 模型 | Context | 最大输出 | 输入 (Input) | 5m Cache Write | 1h Cache Write | Cache Read | 输出 (Output) | %s |\n|---|---|---|---|---|---|---|---|---|\n", g.TailHeader)
		return
	}
	fmt.Fprintf(buf, "| 模型 | Context | 最大输出 | 输入 (Input) | 缓存命中 (Cache Read) | 输出 (Output) | %s |\n|---|---|---|---|---|---|---|\n", g.TailHeader)
}

// writeModelRow 按渲染类型输出一行模型价格。
func writeModelRow(buf *bytes.Buffer, g quote_setting.QuoteGroup, m quote_setting.QuoteModel, k, rate float64) {
	var cols []string
	if g.RenderType == quote_setting.RenderTypeCacheTable {
		cols = []string{
			fmt.Sprintf("**%s**", m.Name),
			m.ContextWindow,
			m.MaxOutput,
			fmtPair(m.InputPrice, m.InputPrice*k, rate),
			fmtPair(m.CacheWrite5m, m.CacheWrite5m*k, rate),
			fmtPair(m.CacheWrite1h, m.CacheWrite1h*k, rate),
			fmtPair(m.CacheRead, m.CacheRead*k, rate),
			fmtPair(m.OutputPrice, m.OutputPrice*k, rate),
			g.TailCell,
		}
	} else {
		cols = []string{
			fmt.Sprintf("**%s**", m.Name),
			m.ContextWindow,
			m.MaxOutput,
			fmtPair(m.InputPrice, m.InputPrice*k, rate),
			fmtPair(m.CacheRead, m.CacheRead*k, rate),
			fmtPair(m.OutputPrice, m.OutputPrice*k, rate),
			g.TailCell,
		}
	}
	fmt.Fprintln(buf, "| "+strings.Join(cols, " | ")+" |")
}

// groupSubgroups 返回组内模型出现过的子组（按首次出现顺序，standard 恒排最前）。
func groupSubgroups(models []quote_setting.QuoteModel, groupKey string) []string {
	var order []string
	seen := make(map[string]bool)
	for _, m := range models {
		if m.GroupKey != groupKey || seen[m.Subgroup] {
			continue
		}
		seen[m.Subgroup] = true
		order = append(order, m.Subgroup)
	}
	sort.SliceStable(order, func(i, j int) bool {
		return order[i] == "standard" && order[j] != "standard"
	})
	return order
}

// writeGroupSection 渲染一个供应商分组章节：引导语 → 各子组模型表 → 图片附表 → 组尾说明。
// sec 是顶级章节号（服务能力速览为 1，分组从 2 起）。
func writeGroupSection(buf *bytes.Buffer, g quote_setting.QuoteGroup, cfg *quote_setting.QuoteSetting, sec int, k, rate float64) {
	fmt.Fprintf(buf, "## %s、%s\n\n", cnSectionNum(sec), g.Name)

	// 引导语 blockquote：首行文案（数据）+ 折扣口径 + 可选单价单位行 + 可选稳定性声明
	fmt.Fprintf(buf, "> %s\n", g.Intro)
	fmt.Fprintf(buf, "> 折扣口径：**官方价 × %.1f%% 折后**\n", k*100)
	if g.ShowUnitLine {
		fmt.Fprintf(buf, "> 单价单位：**USD per 1M tokens** / **CNY per 1M tokens（1 USD = %.2f CNY）**\n", rate)
	}
	if g.ShowStabilityWarning {
		fmt.Fprintf(buf, `>
> ⚠️ **稳定性声明**：本组模型经第三方反代提供，**供应链不受 %s 控制**，可能出现以下情况：
> - 单次请求失败率高于官方满血版（建议接入自动 retry / fallback 逻辑）
> - 高峰期 TPM/RPM 会按反代上游池子动态浮动
> - 个别模型可能临时下线、限速、或返回限流错误
> - 不承诺 SLA，**不适合用于核心生产链路**
>
> 适合：成本敏感场景 / 个人开发 / 内部工具 / 非关键路径 Agent 实验。
`, cfg.Meta.BrandName)
	}
	buf.WriteString("\n")

	// 子组模型表
	sub := 0
	for _, sg := range groupSubgroups(cfg.Models, g.Key) {
		sub++
		fmt.Fprintf(buf, "### %d.%d %s\n\n", sec, sub, subgroupTitle(g, sg))
		writeModelTableHeader(buf, g)
		for _, m := range cfg.Models {
			if m.GroupKey == g.Key && m.Subgroup == sg {
				writeModelRow(buf, g, m, k, rate)
			}
		}
		if sg == "standard" && g.ThinkingAlias {
			buf.WriteString("| **claude-\\*-thinking** | 同对应基模 | 同对应基模 | 同对应基模 × 反代折扣 | — | — | — | 同对应基模 × 反代折扣 | 反代 / Extended Thinking 强制开启 |\n")
		}
		buf.WriteString("\n")
	}

	// 图片计费附表（取本组专属的计费块，无则跳过）
	if g.ShowImagePricing {
		if img := findImagePricingBlock(cfg.ImagePricing, g.Key); img != nil {
			sub++
			writeImagePricingBlock(buf, *img, cfg.Meta, sec, sub, k, rate)
		}
	}

	// 组尾说明块（文案在代码）
	if g.FooterNote != "" {
		sub++
		writeGroupFooterNote(buf, g.FooterNote, sec, sub)
	}

	buf.WriteString("---\n\n")
}

// findImagePricingBlock 返回指定分组的图片计费块，无则返回 nil。
func findImagePricingBlock(blocks []quote_setting.ImagePricingBlock, groupKey string) *quote_setting.ImagePricingBlock {
	for i := range blocks {
		if blocks[i].GroupKey == groupKey {
			return &blocks[i]
		}
	}
	return nil
}

// writeImagePricingBlock 渲染图片模型计费附表（token 计费 + 按张参考价两张表）。
func writeImagePricingBlock(buf *bytes.Buffer, img quote_setting.ImagePricingBlock, meta quote_setting.QuoteMeta, sec, sub int, k, rate float64) {
	fmt.Fprintf(buf, "### %d.%d %s\n\n", sec, sub, img.SectionTitle)

	fmt.Fprintf(buf, "**按 token 计费（标准 API 模式）**\n\n| 计费项 | 官方价 | %s 折后 |\n|---|---|---|\n", meta.BrandName)
	for _, item := range img.TokenItems {
		official := fmt.Sprintf("%s / 1M tokens", fmtMoney(item.Price))
		discount := fmt.Sprintf("**%s / 1M tokens**（%s）", fmtMoney(item.Price*k), fmtCNY(item.Price*k*rate))
		fmt.Fprintf(buf, "| %s | %s | %s |\n", item.Label, official, discount)
	}

	fmt.Fprintf(buf, "\n**按张参考价（1024×1024，由 token 折算）**\n\n| 质量档位 | 官方估算价（每张） | %s 折后（每张） |\n|---|---|---|\n", meta.BrandName)
	for _, p := range img.PerImageItems {
		official := fmt.Sprintf("~%s", fmtMoney(p.Price))
		discount := fmt.Sprintf("**~%s（%s）**", fmtMoney(p.Price*k), fmtCNY(p.Price*k*rate))
		fmt.Fprintf(buf, "| %s | %s | %s |\n", p.Quality, official, discount)
	}

	fmt.Fprintf(buf, "\n> 注：%s\n\n", img.Note)
}

// writeGroupFooterNote 渲染组尾说明块；标题与正文均为固定文案，仅小节号动态。
func writeGroupFooterNote(buf *bytes.Buffer, footerType string, sec, sub int) {
	switch footerType {
	case quote_setting.FooterNoteOfficial:
		fmt.Fprintf(buf, "### %d.%d Claude 官方满血版说明\n\n", sec, sub)
		buf.WriteString(`- 行为、上下文、扩展思考（Extended Thinking）、Prompt Caching、Tool Use、Vision、Computer Use、Files API、Streaming 等特性与 ` + "`claude.ai`" + ` 官方 API 完全一致。
- 支持 ` + "`claude-*-thinking`" + ` 模型别名（自动启用 reasoning），也支持在请求体中通过 ` + "`thinking: {type: \"enabled\", budget_tokens: N}`" + ` 控制思考预算。
- 默认 inference 全球路由；如需指定 US 区域，可通过 ` + "`inference_geo: \"us\"`" + ` 参数（10% 加价）。

`)
	case quote_setting.FooterNoteProxyComparison:
		fmt.Fprintf(buf, "### %d.%d 反代版 vs 官方满血版对照\n\n", sec, sub)
		buf.WriteString(`| 指标 | 官方满血版 | 第三方反代版 |
|---|---|---|
| SLA 承诺 | 共享平台 99.5% 月度可用率 | **无 SLA**（best effort） |
| 模型一致性 | 与官方 API 完全一致 | 行为与官方对齐，**输出风格、reasoning 行为可能存在差异** |
| 上下文窗口 | 与官方一致 | 与官方一致（个别反代源限制 32K，请以接入时实测为准） |
| Prompt Cache | 完整支持 5m / 1h cache | 部分反代源不支持，回退至普通输入计费 |
| 适用场景 | 核心生产 / 商业服务 | 成本敏感 / 内部实验 / 非关键路径 |

`)
	case quote_setting.FooterNoteGPT:
		fmt.Fprintf(buf, "### %d.%d GPT 系列说明\n\n", sec, sub)
		buf.WriteString(`- **长上下文计费**：` + "`gpt-5.5` / `gpt-5.4`" + ` 单次请求输入（含缓存）> 272K tokens 时整次请求按「长上下文」单价计费：输入 / 缓存读 / 缓存写 ×2、输出 ×1.5（与 OpenAI 官方口径一致，2026-03 起生效）。
- **思考模式（Reasoning Effort）**：所有 ` + "`gpt-5.x`" + ` 系列均支持在请求体中通过 ` + "`reasoning: {effort: \"low\" | \"medium\" | \"high\" | \"xhigh\"}`" + ` 控制思考深度；ChatGPT 网页端「Thinking」展示名对应 ` + "`effort: \"high\"`" + `。

`)
	}
}

func writeBillingRules(buf *bytes.Buffer, rate float64, meta quote_setting.QuoteMeta, sec int) {
	fmt.Fprintf(buf, `## %s、计费与结算规则

### %d.1 通用规则

1. **单位**：所有官方价均为 USD per 1M tokens；折后价同步给出 USD 与 CNY 两种币种。
2. **汇率**：默认锁定 **1 USD = %.2f CNY** 报价，%s。
3. **计量精度**：按 1 token 实际消耗计费，无最低消费门槛。
4. **Token 统计**：Input / Output / Cache 三类分别累计，账单按日维度细分，可在控制台导出对账。

### %d.2 Prompt Cache 计费说明

| 操作 | 单价倍率（相对 Input 单价） | 持续时长 |
|---|---|---|
| 5-minute cache write | 1.25× | 5 分钟内有效 |
| 1-hour cache write | 2.0× | 1 小时内有效 |
| Cache read（命中） | 0.1× | 与对应 write 同生命周期 |

> 单次命中即可回本（1.25 write + 0.1 read = 1.35×，相比原始 2× 节省 32%%）；1 小时版在两次命中回本。

### %d.3 长上下文计费

- **GPT-5.5 / GPT-5.4**：单次请求总输入（含缓存）> 272K tokens 时**整次请求**按「长上下文」单价：输入 / 缓存读 / 缓存写 ×2、输出 ×1.5（OpenAI 官方口径，2026-03 起）；≤ 272K 按短上下文价。
- **Claude Opus 4.7 / 4.6 / Sonnet 4.6**：内置 1M 上下文窗口，**全窗口统一单价**，无额外加价。

### %d.4 突发配额与白名单

如下情况需要联系商务申请专属配额：
- 单分钟 RPM > 12,000
- 单分钟 TPM > 6,000,000
- 单请求 input tokens > 500K
- 需要 99.9%% SLA 或 24/7 专属支持

---

`, cnSectionNum(sec), sec, rate, meta.ExchangeRateNote, sec, sec, sec)
}

func writeValidityFooter(buf *bytes.Buffer, generated, expiry string, days, sec int, brand string) {
	fmt.Fprintf(buf, `## %s、有效期与备注

- **本报价有效期**：%s 至 **%s**（%d 天）。
- 超出有效期后，%s 将根据上游官方价格调整重新报价；老客户续约可锁定本次价格再 %d 天。
- 本文件不构成最终合同；正式合作请通过商务签订专项服务协议。
- 因上游服务调整（如 OpenAI / Anthropic 价格变更、模型下线、API 政策变动）导致的供应能力变化，%s 保留 7 个自然日的协商调价窗口。

---

`, cnSectionNum(sec), generated, expiry, days, brand, days, brand)
}

func writeAppendix(buf *bytes.Buffer, groups []quote_setting.QuoteGroup, cfg *quote_setting.QuoteSetting) {
	buf.WriteString("## 附录 A：模型 ID 速查\n\n")

	for i, g := range groups {
		fmt.Fprintf(buf, "### A.%d %s\n\n```\n", i+1, g.AppendixTitle)
		for _, m := range cfg.Models {
			if m.GroupKey != g.Key {
				continue
			}
			if g.ThinkingAlias {
				fmt.Fprintf(buf, "%s   /   %s-thinking\n", m.ID, m.ID)
			} else {
				fmt.Fprintln(buf, m.ID)
			}
		}
		if g.ShowImagePricing {
			if img := findImagePricingBlock(cfg.ImagePricing, g.Key); img != nil {
				fmt.Fprintf(buf, "%s        // 图像生成\n", img.ModelID)
			}
		}
		buf.WriteString("```\n\n")
	}

	meta := cfg.Meta
	fmt.Fprintf(buf, `---

## 附录 B：调用示例

### B.1 OpenAI 兼容协议（GPT / Claude 通用）

`+"```bash"+`
curl https://%s/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $%s" \
  -d '{
    "model": "%s",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
`+"```"+`

### B.2 启用 Reasoning / Thinking 模式

`+"```bash"+`
# GPT 系列 — 通过 reasoning.effort 控制
curl https://%s/v1/responses \
  -d '{
    "model": "%s",
    "input": [{"role": "user", "content": "解一个复杂数学题..."}],
    "reasoning": {"effort": "high"}
  }'

# Claude 系列 — 通过 thinking.budget_tokens 控制
curl https://%s/v1/messages \
  -d '{
    "model": "%s",
    "max_tokens": 16000,
    "thinking": {"type": "enabled", "budget_tokens": 8000},
    "messages": [...]
  }'
`+"```"+`

---

**联系商务**

%s

*— END —*
`, meta.Domain, meta.ApiKeyEnvName, meta.SampleClaudeModelID,
		meta.Domain, meta.SampleGPTModelID,
		meta.Domain, meta.SampleClaudeModelID,
		meta.ContactText)
}
