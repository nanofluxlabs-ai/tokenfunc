package service

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
)

// 财务中心用量 CSV：UTF-8 BOM + 注释头 + 汇总(按令牌分组) + 汇总(按令牌分组-模型) + 汇总(按模型) + 汇总(按天) + 可选调用明细。
// 分组视角排在最前，财务打开先看到各分组（不同上游资源池与倍率）的消耗构成；按模型块保留跨分组视角。

// FinanceUsageCSVPayload 导出入参
type FinanceUsageCSVPayload struct {
	AccountLabel   string
	EnterpriseName string
	StartDay       string
	EndDay         string
	Summary        *model.FinanceUsageSummary
	Daily          *model.FinanceUsageDaily
	IncludeDetail  bool
	Details        []*model.FinanceUsageDetailRow
}

var financeUnitPriceCSVHeader = []string{"输入单价", "缓存命中单价", "缓存写入(5m)单价", "缓存写入(1h)单价", "输出单价"}

// financeCSVPrice 单价列：缺省显示 -，小于 0.01 时保留 6 位
func financeCSVPrice(value *float64) string {
	if value == nil {
		return "-"
	}
	if *value < 0.01 {
		return strconv.FormatFloat(*value, 'f', 6, 64)
	}
	return strconv.FormatFloat(*value, 'f', 4, 64)
}

func financeCSVUnitPrices(prices model.FinanceUnitPrices) []string {
	return []string{financeCSVPrice(prices.Input), financeCSVPrice(prices.CacheRead), financeCSVPrice(prices.CacheWrite5m), financeCSVPrice(prices.CacheWrite1h), financeCSVPrice(prices.Output)}
}

// financeCSVRatio 倍率列：主值；多个取值时附 "(多值: v1 60%, v2 40%)"；专属分组倍率加 "专属" 标记
func financeCSVRatio(value *model.FinanceRatioValue, total int64, exclusive bool) string {
	if value == nil {
		return "-"
	}
	text := strconv.FormatFloat(value.Value, 'f', -1, 64)
	if exclusive {
		text += "(专属)"
	}
	if len(value.Shares) > 1 {
		parts := make([]string, 0, len(value.Shares))
		for _, share := range value.Shares {
			parts = append(parts, fmt.Sprintf("%s %.1f%%", strconv.FormatFloat(share.Value, 'f', -1, 64), financeSharePercent(share.Quota, total)))
		}
		text += " (多值: " + strings.Join(parts, ", ") + ")"
	}
	return text
}

func financeSharePercent(part int64, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return float64(part) / float64(total) * 100
}

func financeCSVPercent(value float64) string {
	return strconv.FormatFloat(value, 'f', 2, 64)
}

// financeWriteCSVBlock 写一个带标题行的块；块之间空一行
func financeWriteCSVBlock(w io.Writer, title string, header []string, rows [][]string, leadingBlank bool) error {
	if leadingBlank {
		if _, err := io.WriteString(w, "\n"); err != nil {
			return err
		}
	}
	writer := csv.NewWriter(w)
	if err := writer.Write([]string{title}); err != nil {
		return err
	}
	if err := writer.Write(header); err != nil {
		return err
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return err
		}
	}
	writer.Flush()
	return writer.Error()
}

// WriteFinanceUsageCSV 流式写出用量 CSV
func WriteFinanceUsageCSV(w io.Writer, payload FinanceUsageCSVPayload) error {
	summary := payload.Summary
	sanitize := func(value string) string { return strings.NewReplacer("\n", " ", "\r", " ").Replace(value) }
	if _, err := io.WriteString(w, "\uFEFF"); err != nil {
		return err
	}
	comments := []string{fmt.Sprintf("# 账号: %s", sanitize(payload.AccountLabel))}
	if payload.EnterpriseName != "" {
		comments = append(comments, fmt.Sprintf("# 企业: %s", sanitize(payload.EnterpriseName)))
	}
	comments = append(comments,
		fmt.Sprintf("# 账期: %s ~ %s", payload.StartDay, payload.EndDay),
		fmt.Sprintf("# 总消费: $%s (%d 次调用)", summary.TotalAmountUSD, summary.TotalCalls),
		"# 单价: USD / 1M tokens，按消费时的模型倍率 × 分组倍率快照换算（专属分组倍率优先）",
		"# 缓存写入分两档: 5m 与 1h（仅请求显式携带 ttl:\"1h\" 时产生）；按模型 / 按天块的缓存写入为两档合计",
		"# 金额验算: Σ(各维度 token 数 × 该维度单价 ÷ 1000000) ≈ 金额(USD)；每次调用按整数额度扣费，逐笔取整会带来极小尾差",
		"# 单价显示 - 表示该行按次计费，或日志中缺少对应倍率信息",
		"#",
	)
	for _, line := range comments {
		if _, err := io.WriteString(w, line+"\n"); err != nil {
			return err
		}
	}

	// 汇总(按令牌分组)：从分组-模型行归并
	type groupTotal struct {
		label      string
		calls      int64
		quota      int64
		groupRatio *model.FinanceRatioValue
		exclusive  bool
	}
	groupOrder := make([]string, 0)
	groups := make(map[string]*groupTotal)
	for _, row := range summary.ByGroupModel {
		total, exists := groups[row.Group]
		if !exists {
			total = &groupTotal{label: row.GroupLabel}
			groups[row.Group] = total
			groupOrder = append(groupOrder, row.Group)
		}
		total.calls += row.Count
		total.quota += row.Quota
		if total.groupRatio == nil && row.Ratios.GroupRatio != nil {
			total.groupRatio = row.Ratios.GroupRatio
			total.exclusive = row.Ratios.GroupRatioExclusive
		}
	}
	groupRows := make([][]string, 0, len(groupOrder))
	for _, group := range groupOrder {
		total := groups[group]
		groupRows = append(groupRows, []string{
			total.label, strconv.FormatInt(total.calls, 10), model.FinanceQuotaToUSD(total.quota),
			financeCSVPercent(financeSharePercent(total.quota, summary.TotalQuota)), financeCSVRatio(total.groupRatio, total.quota, total.exclusive),
		})
	}
	if err := financeWriteCSVBlock(w, "汇总(按令牌分组)", []string{"令牌分组", "调用次数", "金额(USD)", "占比(%)", "分组倍率"}, groupRows, false); err != nil {
		return err
	}

	// 汇总(按令牌分组-模型)
	groupModelRows := make([][]string, 0, len(summary.ByGroupModel))
	for _, row := range summary.ByGroupModel {
		cells := []string{
			row.GroupLabel, row.ModelName, strconv.FormatInt(row.Count, 10), strconv.FormatInt(row.InputTokens, 10), strconv.FormatInt(row.CachedTokens, 10),
			strconv.FormatInt(row.CacheCreationTokens-row.CacheCreation1hTokens, 10), strconv.FormatInt(row.CacheCreation1hTokens, 10), strconv.FormatInt(row.CompletionTokens, 10),
		}
		cells = append(cells, financeCSVUnitPrices(row.UnitPrices)...)
		cells = append(cells, row.AmountUSD, financeCSVPercent(row.Percentage),
			financeCSVRatio(row.Ratios.ModelRatio, row.Quota, false), financeCSVRatio(row.Ratios.GroupRatio, row.Quota, row.Ratios.GroupRatioExclusive))
		groupModelRows = append(groupModelRows, cells)
	}
	header := []string{"令牌分组", "模型", "调用次数", "输入 token", "缓存命中", "缓存写入(5m)", "缓存写入(1h)", "输出 token"}
	header = append(header, financeUnitPriceCSVHeader...)
	header = append(header, "金额(USD)", "占比(%)", "模型倍率", "分组倍率")
	if err := financeWriteCSVBlock(w, "汇总(按令牌分组-模型)", header, groupModelRows, true); err != nil {
		return err
	}

	// 汇总(按模型)
	modelRows := make([][]string, 0, len(summary.ByModel))
	for _, row := range summary.ByModel {
		modelRows = append(modelRows, []string{
			row.ModelName, strconv.FormatInt(row.Calls, 10), strconv.FormatInt(row.InputTokens, 10), strconv.FormatInt(row.CachedTokens, 10),
			strconv.FormatInt(row.CacheCreationTokens, 10), strconv.FormatInt(row.CompletionTokens, 10), row.AmountUSD, financeCSVPercent(row.Percentage),
		})
	}
	if err := financeWriteCSVBlock(w, "汇总(按模型)", []string{"模型", "调用次数", "输入 token", "缓存命中", "缓存写入", "输出 token", "金额(USD)", "占比(%)"}, modelRows, true); err != nil {
		return err
	}

	// 汇总(按天)
	dailyRows := make([][]string, 0, len(payload.Daily.ByDay))
	for _, row := range payload.Daily.ByDay {
		dailyRows = append(dailyRows, []string{
			row.Day, strconv.FormatInt(row.Calls, 10), strconv.FormatInt(row.InputTokens, 10), strconv.FormatInt(row.CachedTokens, 10),
			strconv.FormatInt(row.CacheCreationTokens, 10), strconv.FormatInt(row.CompletionTokens, 10), row.AmountUSD, financeCSVPercent(row.Percentage),
		})
	}
	if err := financeWriteCSVBlock(w, "汇总(按天)", []string{"日期", "调用次数", "输入 token", "缓存命中", "缓存写入", "输出 token", "金额(USD)", "占比(%)"}, dailyRows, true); err != nil {
		return err
	}
	if !payload.IncludeDetail {
		return nil
	}

	// 调用明细
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		location = time.FixedZone("CST", 8*3600)
	}
	detailRows := make([][]string, 0, len(payload.Details))
	for _, row := range payload.Details {
		cells := []string{
			time.Unix(row.CreatedAt, 0).In(location).Format("2006-01-02 15:04:05"), row.ModelName, row.Group, row.TokenName,
			strconv.FormatInt(row.InputTokens, 10), strconv.FormatInt(row.CachedTokens, 10),
			strconv.FormatInt(row.CacheCreationTokens-row.CacheCreation1hTokens, 10), strconv.FormatInt(row.CacheCreation1hTokens, 10), strconv.FormatInt(row.CompletionTokens, 10),
		}
		cells = append(cells, financeCSVUnitPrices(row.UnitPrices)...)
		modelRatio, groupRatio := "-", "-"
		if row.ModelRatio != nil {
			modelRatio = strconv.FormatFloat(*row.ModelRatio, 'f', -1, 64)
		}
		if row.GroupRatio != nil {
			groupRatio = strconv.FormatFloat(*row.GroupRatio, 'f', -1, 64)
		}
		cells = append(cells, row.AmountUSD, modelRatio, groupRatio)
		detailRows = append(detailRows, cells)
	}
	detailHeader := []string{"时间(UTC+8)", "模型", "令牌分组", "Token 名称", "输入 token", "缓存命中", "缓存写入(5m)", "缓存写入(1h)", "输出 token"}
	detailHeader = append(detailHeader, financeUnitPriceCSVHeader...)
	detailHeader = append(detailHeader, "消费额度(USD)", "模型倍率", "分组倍率")
	return financeWriteCSVBlock(w, "调用明细", detailHeader, detailRows, true)
}

// ---------------------------------------------------------------------------
// 个人财务对账·充值账单 CSV：BOM + 注释头 + 流水明细 + 汇总(按来源)
// ---------------------------------------------------------------------------

// FinanceTopupCSVPayload 充值账单导出入参
type FinanceTopupCSVPayload struct {
	AccountLabel   string
	EnterpriseName string
	StartDay       string
	EndDay         string
	Summary        model.FinanceTopupSummary
	Entries        []model.FinanceTopupEntry
}

var financeTopupTypeLabels = map[string]string{
	model.FinanceTopupTypeTopup:        "充值",
	model.FinanceTopupTypeAdjust:       "管理员调整",
	model.FinanceTopupTypeRefund:       "退款",
	model.FinanceTopupTypeSubscription: "订阅购买",
}

var financeTopupSourceLabels = map[string]string{
	model.FinanceTopupSourceOnline:              "在线支付",
	model.FinanceTopupSourceRedemption:          "兑换码",
	model.FinanceTopupSourceEnterpriseTopup:     "企业线下充值",
	model.FinanceTopupSourceSubscriptionBalance: "余额购买订阅",
	model.FinanceTopupSourceAdminAdjust:         "管理员调整",
	model.FinanceTopupSourceRefund:              "退款",
}

func financeCSVLabel(labels map[string]string, key string) string {
	if label, ok := labels[key]; ok {
		return label
	}
	return key
}

// WriteFinanceTopupCSV 流式写出充值账单 CSV
func WriteFinanceTopupCSV(w io.Writer, payload FinanceTopupCSVPayload) error {
	sanitize := func(value string) string { return strings.NewReplacer("\n", " ", "\r", " ").Replace(value) }
	if _, err := io.WriteString(w, "\uFEFF"); err != nil {
		return err
	}
	comments := []string{fmt.Sprintf("# 账号: %s", sanitize(payload.AccountLabel))}
	if payload.EnterpriseName != "" {
		comments = append(comments, fmt.Sprintf("# 企业: %s", sanitize(payload.EnterpriseName)))
	}
	comments = append(comments,
		fmt.Sprintf("# 账期: %s ~ %s", payload.StartDay, payload.EndDay),
		fmt.Sprintf("# 净入账: $%s (%d 笔)", payload.Summary.TotalAmountUSD, payload.Summary.TotalEntries),
		"# 口径: 钱包的非消费流水，含在线充值、兑换码、企业线下充值、管理员调整(可为负)、退款、余额购买订阅(负数)；在线支付的订阅不动钱包，不在此列",
		"#",
	)
	for _, line := range comments {
		if _, err := io.WriteString(w, line+"\n"); err != nil {
			return err
		}
	}
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		location = time.FixedZone("CST", 8*3600)
	}
	detailRows := make([][]string, 0, len(payload.Entries))
	for _, entry := range payload.Entries {
		detailRows = append(detailRows, []string{
			time.Unix(entry.CreatedAt, 0).In(location).Format("2006-01-02 15:04:05"),
			financeCSVLabel(financeTopupTypeLabels, entry.Type), financeCSVLabel(financeTopupSourceLabels, entry.Source), entry.PaymentMethod,
			entry.AmountUSD, entry.RefNo, entry.Content,
		})
	}
	if err := financeWriteCSVBlock(w, "流水明细", []string{"时间(UTC+8)", "类型", "来源", "支付方式", "金额(USD)", "单号", "备注"}, detailRows, false); err != nil {
		return err
	}
	sourceRows := make([][]string, 0, len(payload.Summary.BySource))
	for _, row := range payload.Summary.BySource {
		sourceRows = append(sourceRows, []string{
			financeCSVLabel(financeTopupTypeLabels, row.Type), financeCSVLabel(financeTopupSourceLabels, row.Source), row.PaymentMethod,
			strconv.FormatInt(row.Count, 10), row.AmountUSD, financeCSVPercent(row.Percentage),
		})
	}
	return financeWriteCSVBlock(w, "汇总(按来源)", []string{"类型", "来源", "支付方式", "笔数", "金额(USD)", "占比(%)"}, sourceRows, true)
}
