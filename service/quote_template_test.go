// 报价单渲染 golden 测试：用固定参数渲染并与 testdata/quote_golden.md 逐字节比对，
// 锁定模板输出。更新基线：go test ./service/ -run TestGenerateQuoteMarkdownGolden -update-golden
package service

import (
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/setting/quote_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var updateGolden = flag.Bool("update-golden", false, "重新生成报价单 golden 基线文件")

// TestGenerateQuoteDynamicGroup 验证动态新增供应商分组（如 Gemini）零代码出新章节：
// 新分组出现在指定顺序位置、折扣读 Discounts map、附录 A 自动追加、后续章节编号顺延。
func TestGenerateQuoteDynamicGroup(t *testing.T) {
	cfg := quote_setting.GetQuoteSetting()
	backup := *cfg
	t.Cleanup(func() { *cfg = backup })

	cfg.Groups = append(cfg.Groups, quote_setting.QuoteGroup{
		Key: "gemini", Name: "Gemini 系列模型清单", Order: 4,
		DefaultDiscount: 50, RenderType: quote_setting.RenderTypeSimpleTable,
		Intro:           "通过 TokenFunc 直连访问 Google Gemini API。",
		ModelTableTitle: "标准模型", TailHeader: "TPM / RPM", TailCell: "共享平台稳态",
		AppendixTitle: "Gemini 系列调用 ID", ShowUnitLine: true,
	})
	cfg.Models = append(cfg.Models, quote_setting.QuoteModel{
		Name: "Gemini 3 Pro", ID: "gemini-3-pro", GroupKey: "gemini", Subgroup: "standard",
		ContextWindow: "1M", MaxOutput: "64K", InputPrice: 1.25, CacheRead: 0.31, OutputPrice: 10.0,
	})

	resp, err := GenerateQuoteMarkdown(QuoteRequest{
		Discounts:     map[string]float64{"gemini": 60},
		GeneratedDate: "2026-06-11",
	})
	require.NoError(t, err)
	for _, want := range []string{
		"## 五、Gemini 系列模型清单",              // 新分组按 Order 排在第 5 章
		"折扣口径：**官方价 × 60.0% 折后**",         // 折扣来自 Discounts map
		"| **Gemini 3 Pro** | 1M | 64K |", // 模型行渲染
		"### A.4 Gemini 系列调用 ID",          // 附录 A 自动追加
		"gemini-3-pro",
		"## 六、计费与结算规则", // 后续章节编号顺延
		"## 七、有效期与备注",
	} {
		assert.Contains(t, resp.Markdown, want)
	}
}

// TestGenerateQuoteRequestValidation 覆盖默认值回填与范围校验。
func TestGenerateQuoteRequestValidation(t *testing.T) {
	resp, err := GenerateQuoteMarkdown(QuoteRequest{GeneratedDate: "2026-06-11"})
	require.NoError(t, err)
	assert.Equal(t, "2026-07-11", resp.ExpiryDate, "默认有效期 30 天")
	assert.Contains(t, resp.Markdown, "1 USD = 6.85 CNY", "默认汇率")
	assert.Contains(t, resp.Markdown, "折扣口径：**官方价 × 20.0% 折后**", "缺失折扣回填分组默认值")

	for name, req := range map[string]QuoteRequest{
		"折扣超过 100": {Discounts: map[string]float64{"gpt": 120}},
		"汇率超界":     {ExchangeRate: 0.5},
		"有效期超界":    {ValidityDays: 400},
		"日期格式错误":   {GeneratedDate: "2026/06/11"},
	} {
		_, err := GenerateQuoteMarkdown(req)
		assert.Error(t, err, name)
	}
}

func TestGenerateQuoteMarkdownGolden(t *testing.T) {
	req := QuoteRequest{
		Discounts: map[string]float64{
			"gpt":             50,
			"claude_official": 50,
			"claude_proxy":    20,
		},
		ExchangeRate:  6.85,
		ValidityDays:  30,
		GeneratedDate: "2026-06-11",
	}
	resp, err := GenerateQuoteMarkdown(req)
	require.NoError(t, err)
	require.Equal(t, "2026-06-11", resp.GeneratedDate)
	require.Equal(t, "2026-07-11", resp.ExpiryDate)

	goldenPath := filepath.Join("testdata", "quote_golden.md")
	if *updateGolden {
		require.NoError(t, os.MkdirAll("testdata", 0o755))
		require.NoError(t, os.WriteFile(goldenPath, []byte(resp.Markdown), 0o644))
		t.Logf("golden 基线已更新: %s (%d bytes)", goldenPath, len(resp.Markdown))
		return
	}

	want, err := os.ReadFile(goldenPath)
	require.NoError(t, err, "读取 golden 基线失败（先用 -update-golden 生成）")
	if resp.Markdown != string(want) {
		got := filepath.Join(t.TempDir(), "quote_got.md")
		_ = os.WriteFile(got, []byte(resp.Markdown), 0o644)
		t.Errorf("报价单输出与 golden 基线不一致，实际输出已写入 %s，可 diff %s 对比", got, goldenPath)
	}
}
