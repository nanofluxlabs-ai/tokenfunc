// Package quote_setting · 报价单（模型价目表）生成工具的配置数据层（TokenFunc 二开）。
//
// 报价单的「数据」（供应商分组、模型官方价、性能指标、导出元信息、图片计费）
// 全部收敛到本包，注册进 config.GlobalConfig 分层配置体系：
//   - DB option key 形如 `quote_setting.groups`（5 个顶层字段各占一个 key）
//   - 管理员在后台保存 → model.UpdateOption 反射回写本包内存对象，立即生效
//   - DB 无对应 key 时使用本文件内置默认值
//
// 「文案/结构」（章节骨架、表头、计费规则、长说明块）留在 service/quote_template.go
// 代码中，由组上的开关字段（FooterNote / ShowImagePricing / ThinkingAlias 等）触发。
package quote_setting

import (
	"github.com/QuantumNous/new-api/setting/config"
)

// QuoteGroup 描述一个供应商分组（报价单中的一个模型章节）。
type QuoteGroup struct {
	Key             string  `json:"key"`               // 稳定标识，如 claude_official / claude_proxy / gpt / gemini
	Name            string  `json:"name"`              // 章节标题，如 "Claude 系列模型清单（官方满血版）"
	ShortName       string  `json:"short_name"`        // 简短名，用于生成表单的折扣输入标签，如 "Claude 满血"
	Order           int     `json:"order"`             // 渲染顺序（升序）
	DefaultDiscount float64 `json:"default_discount"`  // 默认折扣 0-100，50 表示 5 折
	RenderType      string  `json:"render_type"`       // cache_table（含 5m/1h cache 价格列）/ simple_table（仅输入/缓存命中/输出）
	Intro           string  `json:"intro"`             // 组引导语首行（blockquote 第一行）
	ModelTableTitle string  `json:"model_table_title"` // 首个模型表小节标题，如 "标准模型" / "模型清单"
	TailHeader      string  `json:"tail_header"`       // 模型表末列表头，如 "TPM / RPM" / "备注"
	TailCell        string  `json:"tail_cell"`         // 模型表末列单元格，如 "共享平台稳态" / "反代"
	AppendixTitle   string  `json:"appendix_title"`    // 附录 A 小节标题，如 "Claude 官方满血版调用 ID"
	// ShowUnitLine 在组引导语中输出「单价单位：USD/CNY（含汇率）」一行
	ShowUnitLine bool `json:"show_unit_line"`
	// ShowStabilityWarning 在组引导语末尾追加第三方反代稳定性声明（长文案在代码中）
	ShowStabilityWarning bool `json:"show_stability_warning"`
	// FooterNote 组尾说明块类型：official_notes / proxy_comparison / gpt_notes / 空（无）。文案在代码中。
	FooterNote string `json:"footer_note"`
	// ShowImagePricing 在本组末尾渲染图片计费附表（数据来自 ImagePricingBlock）
	ShowImagePricing bool `json:"show_image_pricing"`
	// ThinkingAlias 模型表尾追加 claude-*-thinking 聚合行，附录 A 中输出 -thinking 别名
	ThinkingAlias bool `json:"thinking_alias"`
}

// QuoteModel 描述一行模型的官方报价与能力指标。
// 所有官方价单位：USD per 1M tokens。Cache 三项为 0 表示该模型不单独计 cache，渲染时显示 "—"。
type QuoteModel struct {
	Name          string  `json:"name"`           // 展示名，例如 "Claude Opus 4.7"
	ID            string  `json:"id"`             // 调用 ID，例如 "claude-opus-4-7"
	GroupKey      string  `json:"group_key"`      // 所属分组 QuoteGroup.Key
	Subgroup      string  `json:"subgroup"`       // standard / codex
	ContextWindow string  `json:"context_window"` // 例如 "1M" / "200K"
	MaxOutput     string  `json:"max_output"`     // 例如 "128K" / "64K"
	InputPrice    float64 `json:"input_price"`
	CacheWrite5m  float64 `json:"cache_write_5m"`
	CacheWrite1h  float64 `json:"cache_write_1h"`
	CacheRead     float64 `json:"cache_read"`
	OutputPrice   float64 `json:"output_price"`
	Note          string  `json:"note"`
}

// CapRow 性能指标表的一行，Cells 数量须与对应表的固定表头列数一致，允许包含 **加粗** / <br/> 等 Markdown。
type CapRow struct {
	Cells []string `json:"cells"`
}

// CapabilityTables 「服务能力速览」章节的三张表（表头文案固定在模板代码中）。
type CapabilityTables struct {
	// SourceNote 章节引言
	SourceNote string `json:"source_note"`
	// PlatformThroughput 1.1 平台吞吐能力，3 列：指标 | 数值 | 备注
	PlatformThroughput []CapRow `json:"platform_throughput"`
	// PerUserScenario 1.2 单用户场景承载，5 列：用户类型 | 平均请求频率 | 完美体验同时在线 | 推荐稳态同时在线 | 突发承载
	PerUserScenario []CapRow `json:"per_user_scenario"`
	// RateCommitmentNote 1.3 表前引言
	RateCommitmentNote string `json:"rate_commitment_note"`
	// RateCommitment 1.3 单客户速率承诺，2 列：指标 | 数值（保守稳态）
	RateCommitment []CapRow `json:"rate_commitment"`
}

// QuoteMeta 报价单导出元信息与默认参数。
type QuoteMeta struct {
	BrandName     string `json:"brand_name"`       // 品牌名，用于表头、稳定性声明、有效期条款等处
	DocTitle      string `json:"doc_title"`        // 文档主标题
	HeaderIntro   string `json:"header_intro"`     // 头部说明第一句（之后的汇率说明句由代码拼接）
	Domain        string `json:"domain"`           // 服务域名，用于附录调用示例
	ApiKeyEnvName string `json:"api_key_env_name"` // 调用示例中的 API Key 环境变量名
	ContactText   string `json:"contact_text"`     // 结尾「联系商务」正文
	// SampleClaudeModelID / SampleGPTModelID 附录 B 调用示例中的模型 ID
	SampleClaudeModelID string `json:"sample_claude_model_id"`
	SampleGPTModelID    string `json:"sample_gpt_model_id"`
	// ExchangeRateNote 计费规则中汇率条目的浮动说明（句中不含句号）
	ExchangeRateNote    string  `json:"exchange_rate_note"`
	DefaultExchangeRate float64 `json:"default_exchange_rate"` // 1 USD = N CNY
	DefaultValidityDays int     `json:"default_validity_days"`
}

// ImageTokenItem gpt-image 类模型的 token 维度计费项（USD/1M tokens）。
type ImageTokenItem struct {
	Label string  `json:"label"` // 展示标签
	Key   string  `json:"key"`   // 英文 key
	Price float64 `json:"price"`
}

// ImagePerImageItem 按张参考价（USD/image）。
type ImagePerImageItem struct {
	Quality string  `json:"quality"` // Low / Medium / High
	Price   float64 `json:"price"`
}

// ImagePricingBlock 某个供应商分组的图片模型计费附表。
// 渲染条件：分组 ShowImagePricing 开启，且此处存在 GroupKey 匹配的块。
type ImagePricingBlock struct {
	GroupKey      string              `json:"group_key"`     // 所属供应商分组 QuoteGroup.Key
	ModelID       string              `json:"model_id"`      // 如 "gpt-image-2"
	SectionTitle  string              `json:"section_title"` // 小节标题，如 "图像生成（gpt-image-2）"
	TokenItems    []ImageTokenItem    `json:"token_items"`
	PerImageItems []ImagePerImageItem `json:"per_image_items"`
	Note          string              `json:"note"` // 表后说明（blockquote 内容，不含 "> 注：" 前缀）
}

// QuoteSetting 报价单工具完整配置。5 个顶层字段各自序列化为一个 DB option key。
type QuoteSetting struct {
	Groups       []QuoteGroup        `json:"groups"`
	Models       []QuoteModel        `json:"models"`
	Capability   CapabilityTables    `json:"capability"`
	Meta         QuoteMeta           `json:"meta"`
	ImagePricing []ImagePricingBlock `json:"image_pricing"` // 每个分组至多一个块
}

// 渲染类型与组尾说明块的合法取值（供 service 层与配置校验使用）。
const (
	RenderTypeCacheTable  = "cache_table"
	RenderTypeSimpleTable = "simple_table"

	FooterNoteOfficial        = "official_notes"
	FooterNoteProxyComparison = "proxy_comparison"
	FooterNoteGPT             = "gpt_notes"
)

var quoteSetting = defaultQuoteSetting()

func init() {
	config.GlobalConfig.Register("quote_setting", &quoteSetting)
}

// GetQuoteSetting 返回当前生效配置（指针，渲染层只读使用）。
func GetQuoteSetting() *QuoteSetting {
	return &quoteSetting
}

// GetDefaultQuoteSetting 返回代码内置默认配置的副本（供「重置为默认值」）。
func GetDefaultQuoteSetting() QuoteSetting {
	return defaultQuoteSetting()
}

// defaultQuoteSetting 内置默认数据：三个分组（Claude 满血 / Claude 反代 / GPT）与 22 个模型的官方价。
func defaultQuoteSetting() QuoteSetting {
	return QuoteSetting{
		Groups: []QuoteGroup{
			{
				Key: "claude_official", Name: "Claude 系列模型清单（官方满血版）", ShortName: "Claude 满血", Order: 1,
				DefaultDiscount: 50, RenderType: RenderTypeCacheTable,
				Intro:           "通过 TokenFunc 自营渠道接入，模型行为、能力、上下文长度均**与 Anthropic 官方 API 一致**。",
				ModelTableTitle: "标准模型", TailHeader: "TPM / RPM", TailCell: "共享平台稳态",
				AppendixTitle: "Claude 官方满血版调用 ID",
				ShowUnitLine:  true, FooterNote: FooterNoteOfficial,
			},
			{
				Key: "claude_proxy", Name: "Claude 系列模型清单（第三方反代版）", ShortName: "Claude 反代", Order: 2,
				DefaultDiscount: 20, RenderType: RenderTypeCacheTable,
				Intro:           "经第三方反代聚合服务接入，模型 ID 命名与官方略有差异（采用点号版本号）。",
				ModelTableTitle: "模型清单", TailHeader: "备注", TailCell: "反代",
				AppendixTitle:        "Claude 反代版调用 ID（点号版本号）",
				ShowStabilityWarning: true, FooterNote: FooterNoteProxyComparison, ThinkingAlias: true,
			},
			{
				Key: "gpt", Name: "GPT 系列模型清单", ShortName: "GPT", Order: 3,
				DefaultDiscount: 50, RenderType: RenderTypeSimpleTable,
				Intro:           "通过 TokenFunc 直连访问，已在生产环境完成稳定性压测。",
				ModelTableTitle: "标准模型", TailHeader: "TPM / RPM", TailCell: "共享平台稳态",
				AppendixTitle: "GPT 系列调用 ID",
				ShowUnitLine:  true, FooterNote: FooterNoteGPT, ShowImagePricing: true,
			},
		},
		Models: []QuoteModel{
			// === Claude 官方满血版 ===
			{Name: "Claude Fable 5", ID: "claude-fable-5", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 10.0, CacheWrite5m: 12.5, CacheWrite1h: 20.0, CacheRead: 1.0, OutputPrice: 50.0, Note: "Anthropic 最强模型，能力高于 Opus"},
			{Name: "Claude Opus 4.8", ID: "claude-opus-4-8", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "Claude Opus 4.7", ID: "claude-opus-4-7", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "Claude Opus 4.6", ID: "claude-opus-4-6", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "Claude Opus 4.5", ID: "claude-opus-4-5-20251101", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "200K", MaxOutput: "64K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "Claude Opus 4.1", ID: "claude-opus-4-1-20250805", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "200K", MaxOutput: "32K", InputPrice: 15.0, CacheWrite5m: 18.75, CacheWrite1h: 30.0, CacheRead: 1.5, OutputPrice: 75.0},
			{Name: "Claude Sonnet 4.6", ID: "claude-sonnet-4-6", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "64K", InputPrice: 3.0, CacheWrite5m: 3.75, CacheWrite1h: 6.0, CacheRead: 0.3, OutputPrice: 15.0},
			{Name: "Claude Sonnet 4.5", ID: "claude-sonnet-4-5-20250929", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "200K", MaxOutput: "64K", InputPrice: 3.0, CacheWrite5m: 3.75, CacheWrite1h: 6.0, CacheRead: 0.3, OutputPrice: 15.0},
			{Name: "Claude Haiku 4.5", ID: "claude-haiku-4-5-20251001", GroupKey: "claude_official", Subgroup: "standard", ContextWindow: "200K", MaxOutput: "64K", InputPrice: 1.0, CacheWrite5m: 1.25, CacheWrite1h: 2.0, CacheRead: 0.1, OutputPrice: 5.0},

			// === Claude 反代版（与官方满血版共享官方价，仅折扣不同） ===
			{Name: "claude-opus-4.8", ID: "claude-opus-4.8", GroupKey: "claude_proxy", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "claude-opus-4.7", ID: "claude-opus-4.7", GroupKey: "claude_proxy", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "claude-opus-4.6", ID: "claude-opus-4.6", GroupKey: "claude_proxy", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "claude-opus-4.5", ID: "claude-opus-4.5", GroupKey: "claude_proxy", Subgroup: "standard", ContextWindow: "200K", MaxOutput: "64K", InputPrice: 5.0, CacheWrite5m: 6.25, CacheWrite1h: 10.0, CacheRead: 0.5, OutputPrice: 25.0},
			{Name: "claude-sonnet-4.6", ID: "claude-sonnet-4.6", GroupKey: "claude_proxy", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "64K", InputPrice: 3.0, CacheWrite5m: 3.75, CacheWrite1h: 6.0, CacheRead: 0.3, OutputPrice: 15.0},
			{Name: "claude-sonnet-4.5", ID: "claude-sonnet-4.5", GroupKey: "claude_proxy", Subgroup: "standard", ContextWindow: "200K", MaxOutput: "64K", InputPrice: 3.0, CacheWrite5m: 3.75, CacheWrite1h: 6.0, CacheRead: 0.3, OutputPrice: 15.0},
			{Name: "claude-haiku-4.5", ID: "claude-haiku-4.5", GroupKey: "claude_proxy", Subgroup: "standard", ContextWindow: "200K", MaxOutput: "64K", InputPrice: 1.0, CacheWrite5m: 1.25, CacheWrite1h: 2.0, CacheRead: 0.1, OutputPrice: 5.0},

			// === GPT 标准模型 ===
			{Name: "gpt-5.5", ID: "gpt-5.5", GroupKey: "gpt", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 5.0, CacheRead: 0.5, OutputPrice: 30.0, Note: "短上下文价；输入 >272K tokens 整单按长上下文价：输入/缓存 ×2、输出 ×1.5"},
			{Name: "gpt-5.4", ID: "gpt-5.4", GroupKey: "gpt", Subgroup: "standard", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 2.5, CacheRead: 0.25, OutputPrice: 15.0, Note: "短上下文价；输入 >272K tokens 整单按长上下文价：输入/缓存 ×2、输出 ×1.5"},
			{Name: "gpt-5.4-mini", ID: "gpt-5.4-mini", GroupKey: "gpt", Subgroup: "standard", ContextWindow: "400K", MaxOutput: "128K", InputPrice: 0.75, CacheRead: 0.075, OutputPrice: 4.5},
			{Name: "gpt-5", ID: "gpt-5", GroupKey: "gpt", Subgroup: "standard", ContextWindow: "400K", MaxOutput: "128K", InputPrice: 1.25, CacheRead: 0.125, OutputPrice: 10.0},

			// === GPT Codex ===
			{Name: "gpt-5.3-codex", ID: "gpt-5.3-codex", GroupKey: "gpt", Subgroup: "codex", ContextWindow: "1M", MaxOutput: "128K", InputPrice: 1.75, CacheRead: 0.175, OutputPrice: 14.0},
			{Name: "gpt-5-codex", ID: "gpt-5-codex", GroupKey: "gpt", Subgroup: "codex", ContextWindow: "400K", MaxOutput: "128K", InputPrice: 1.25, CacheRead: 0.125, OutputPrice: 10.0},
		},
		Capability: CapabilityTables{
			SourceNote: "以下指标来源于 TokenFunc 生产环境（`tokenfunc.com`）真实分级压测，可复核。",
			PlatformThroughput: []CapRow{
				{Cells: []string{"**完美体验吞吐**（TTFB P95 ≤ 2s）", "≥ 200 RPS / **12,000 req/min**", "服务端零排队，延迟接近上游基线"}},
				{Cells: []string{"**推荐稳态吞吐**（TTFB P95 ≤ 3s）", "500 RPS / 30,000 req/min", "多渠道并发自动均摊"}},
				{Cells: []string{"**临界承载上限**（TTFB P95 ≤ 5s）", "770 RPS / 46,000 req/min", "服务端仍未饱和，延迟可控"}},
				{Cells: []string{"**短期突发上限**", "1,500+ RPS / 90,000 req/min", "流量峰值平滑，无 5xx 错误"}},
				{Cells: []string{"**端到端首字节延迟**（基线）", "TTFB 中位 1.5s / P95 < 4s", "含跨洋链路 60ms RTT"}},
				{Cells: []string{"**流式响应可用性**", "100%（S1–S2 实测）", "推荐稳态下零错误率"}},
				{Cells: []string{"**故障隔离**", "服务级 cgroup 软硬限", "单业务高峰不影响同集群其他服务"}},
			},
			PerUserScenario: []CapRow{
				{Cells: []string{"普通开发者（IDE 补全 / 对话间歇）", "20–40s 一次", "4,000–8,000 人", "10,000–20,000 人", "30,000+ 人"}},
				{Cells: []string{"密集开发（连续代码生成）", "5–10s 一次", "1,000–2,000 人", "2,500–5,000 人", "7,500 人"}},
				{Cells: []string{"Agent 自动循环", "3–5s 一次", "600–1,000 人", "1,500–2,500 人", "4,500 人"}},
			},
			RateCommitmentNote: "模型清单中各模型默认共享下述速率池。如需更高配额（专属吞吐池 / 独立白名单 / SLA 升级），请联系商务单独签订。",
			RateCommitment: []CapRow{
				{Cells: []string{"单客户 RPM 上限", "**≥ 12,000 req/min**（共享平台稳态吞吐）"}},
				{Cells: []string{"单客户 TPM 上限", "**≥ 6,000,000 tokens/min**（按 500 tokens/req 估算，重型对话场景按实际请求体放大）"}},
				{Cells: []string{"流式 TTFB", "中位 1.5s / P95 < 4s"}},
				{Cells: []string{"单请求最长保持", "与上游一致，无平台侧额外截断"}},
			},
		},
		Meta: QuoteMeta{
			BrandName:           "TokenFunc",
			DocTitle:            "TokenFunc 模型与报价清单",
			HeaderIntro:         "本文件包含 TokenFunc 平台当前对外开放的 Claude 系列与 GPT 系列模型清单、能力指标、官方报价以及我方折扣价。",
			Domain:              "tokenfunc.com",
			ApiKeyEnvName:       "TOKENFUNC_API_KEY",
			ContactText:         "如有定制化模型清单、专属配额、私有部署、Token 折扣升级等需求，请联系 TokenFunc 商务团队，签订专项 SLA 协议。",
			SampleClaudeModelID: "claude-opus-4-7",
			SampleGPTModelID:    "gpt-5.5",
			ExchangeRateNote:    "实际结算按当期央行中间价 ± 0.05 浮动",
			DefaultExchangeRate: 6.85,
			DefaultValidityDays: 30,
		},
		ImagePricing: []ImagePricingBlock{
			{
				GroupKey:     "gpt",
				ModelID:      "gpt-image-2",
				SectionTitle: "图像生成（gpt-image-2）",
				TokenItems: []ImageTokenItem{
					{Label: "文本输入 (text input)", Key: "text_input", Price: 5.0},
					{Label: "图像输入 (image input)", Key: "image_input", Price: 8.0},
					{Label: "缓存图像输入 (cached image input)", Key: "cached_image_input", Price: 2.0},
					{Label: "图像输出 (image output)", Key: "image_output", Price: 30.0},
				},
				PerImageItems: []ImagePerImageItem{
					{Quality: "Low", Price: 0.006},
					{Quality: "Medium", Price: 0.053},
					{Quality: "High", Price: 0.211},
				},
				Note: "按张参考价为 1024×1024 正方形输出；横版（1536×1024）/ 竖版（1024×1536）单价约低 20%。Edit 模式因参考图按高质量输入计费，实际成本会高于纯生成。",
			},
		},
	}
}
