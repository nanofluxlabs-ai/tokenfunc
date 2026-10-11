package controller

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/quote_setting"

	"github.com/gin-gonic/gin"
)

// AdminGetQuoteConfig 返回报价单完整配置；?reset=1 返回代码内置默认值（不落库，仅供前端回填）。
// GET /api/admin/enterprise/quotes/config
func AdminGetQuoteConfig(c *gin.Context) {
	if c.Query("reset") == "1" {
		defaults := quote_setting.GetDefaultQuoteSetting()
		common.ApiSuccess(c, defaults)
		return
	}
	common.ApiSuccess(c, quote_setting.GetQuoteSetting())
}

// validateQuoteConfig 保存前的完整性校验：分组合法、无孤儿模型、关键字段非空。
func validateQuoteConfig(cfg *quote_setting.QuoteSetting) error {
	groupKeys := make(map[string]bool, len(cfg.Groups))
	for _, g := range cfg.Groups {
		if strings.TrimSpace(g.Key) == "" {
			return fmt.Errorf("存在分组标识为空的分组（名称：%s）", g.Name)
		}
		if groupKeys[g.Key] {
			return fmt.Errorf("分组标识重复：%s", g.Key)
		}
		groupKeys[g.Key] = true
		if g.DefaultDiscount <= 0 || g.DefaultDiscount > 100 {
			return fmt.Errorf("分组 %s 默认折扣必须在 (0, 100] 范围内", g.Key)
		}
		if g.RenderType != quote_setting.RenderTypeCacheTable && g.RenderType != quote_setting.RenderTypeSimpleTable {
			return fmt.Errorf("分组 %s 表格样式不合法：%s", g.Key, g.RenderType)
		}
	}
	for _, m := range cfg.Models {
		if strings.TrimSpace(m.ID) == "" {
			return fmt.Errorf("存在模型 ID 为空的模型（名称：%s）", m.Name)
		}
		if !groupKeys[m.GroupKey] {
			return fmt.Errorf("模型 %s 所属分组 %s 不存在", m.ID, m.GroupKey)
		}
	}
	imageGroups := make(map[string]bool, len(cfg.ImagePricing))
	for _, b := range cfg.ImagePricing {
		if !groupKeys[b.GroupKey] {
			return fmt.Errorf("图片计费所属分组 %s 不存在", b.GroupKey)
		}
		if imageGroups[b.GroupKey] {
			return fmt.Errorf("分组 %s 存在重复的图片计费配置", b.GroupKey)
		}
		imageGroups[b.GroupKey] = true
	}
	if cfg.Meta.DefaultExchangeRate < 1 || cfg.Meta.DefaultExchangeRate > 20 {
		return fmt.Errorf("默认汇率取值范围 [1, 20]")
	}
	if cfg.Meta.DefaultValidityDays < 1 || cfg.Meta.DefaultValidityDays > 365 {
		return fmt.Errorf("默认有效期取值范围 [1, 365] 天")
	}
	return nil
}

// AdminUpdateQuoteConfig 整体保存报价单配置：校验后逐顶层字段写入 option 表并同步内存。
// PUT /api/admin/enterprise/quotes/config
func AdminUpdateQuoteConfig(c *gin.Context) {
	var cfg quote_setting.QuoteSetting
	if err := common.DecodeJson(c.Request.Body, &cfg); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := validateQuoteConfig(&cfg); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	// 借助分层配置的反射序列化，把 5 个顶层字段转成 `quote_setting.<field>` option 键值
	configMap, err := config.ConfigToMap(&cfg)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for key, value := range configMap {
		if err := model.UpdateOption("quote_setting."+key, value); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	recordManageAuditFor(c, 0, "enterprise.quote_config.update", map[string]any{
		"groups": len(cfg.Groups), "models": len(cfg.Models),
	})
	common.ApiSuccess(c, nil)
}

// AdminRenderQuote 根据折扣 / 汇率 / 有效期渲染一份 Markdown 报价单（不落库）。
// POST /api/admin/enterprise/quotes/render
func AdminRenderQuote(c *gin.Context) {
	var req service.QuoteRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	resp, err := service.GenerateQuoteMarkdown(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	common.ApiSuccess(c, resp)
}
