package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const EnterpriseQuoteMaxItems = 200

// EnterpriseQuoteItem 报价单里的一行：挂牌价来自系统定价，折后价由服务端计算并快照
type EnterpriseQuoteItem struct {
	ModelName       string  `json:"model_name"`
	VendorName      string  `json:"vendor_name"`
	Group           string  `json:"group"`
	InputUSD        float64 `json:"input_usd"`  // 挂牌价 USD / 1M 输入 tokens
	OutputUSD       float64 `json:"output_usd"` // 挂牌价 USD / 1M 输出 tokens
	CacheUSD        float64 `json:"cache_usd"`  // 挂牌价 USD / 1M 缓存命中 tokens，0 表示不适用
	DiscountPercent float64 `json:"discount_percent"`
	QuotedInputUSD  float64 `json:"quoted_input_usd"`
	QuotedOutputUSD float64 `json:"quoted_output_usd"`
	QuotedCacheUSD  float64 `json:"quoted_cache_usd"`
	Note            string  `json:"note"`
}

// EnterpriseQuote 报价单（一次性生成，不做版本管理；保存快照便于追溯）
type EnterpriseQuote struct {
	Id              int64     `json:"id"`
	QuoteNo         string    `json:"quote_no" gorm:"type:varchar(32);uniqueIndex"`
	CustomerName    string    `json:"customer_name" gorm:"type:varchar(128);not null;index"`
	CustomerContact string    `json:"customer_contact" gorm:"type:varchar(64);not null;default:''"`
	CustomerEmail   string    `json:"customer_email" gorm:"type:varchar(128);not null;default:''"`
	Currency        string    `json:"currency" gorm:"type:varchar(8);not null;default:'USD'"`
	DiscountPercent float64   `json:"discount_percent" gorm:"type:numeric(6,2);not null;default:0"`
	ValidUntil      int64     `json:"valid_until" gorm:"not null;default:0"`
	Notes           string    `json:"notes" gorm:"type:text"`
	Items           JSONValue `json:"items" gorm:"type:jsonb"`
	SellerSnapshot  JSONValue `json:"seller_snapshot" gorm:"type:jsonb"`
	CreatedBy       int       `json:"created_by" gorm:"not null;default:0"`
	CreatedAt       int64     `json:"created_at" gorm:"not null;index"`
}

func (EnterpriseQuote) TableName() string { return "ent_quotes" }

var ErrEnterpriseQuoteInvalid = errors.New("invalid quote")

func round4(value float64) float64 {
	return float64(int64(value*10000+0.5)) / 10000
}

// CreateEnterpriseQuote 校验、计算折后价并保存报价单
func CreateEnterpriseQuote(quote *EnterpriseQuote, items []EnterpriseQuoteItem) (*EnterpriseQuote, error) {
	quote.CustomerName = strings.TrimSpace(quote.CustomerName)
	if quote.CustomerName == "" || len([]rune(quote.CustomerName)) > 128 {
		return nil, fmt.Errorf("%w: customer name is required (max 128 chars)", ErrEnterpriseQuoteInvalid)
	}
	if quote.DiscountPercent < 0 || quote.DiscountPercent > 100 {
		return nil, fmt.Errorf("%w: discount must be between 0 and 100", ErrEnterpriseQuoteInvalid)
	}
	if len(items) == 0 || len(items) > EnterpriseQuoteMaxItems {
		return nil, fmt.Errorf("%w: between 1 and %d models are required", ErrEnterpriseQuoteInvalid, EnterpriseQuoteMaxItems)
	}
	now := common.GetTimestamp()
	if quote.ValidUntil != 0 && quote.ValidUntil < now {
		return nil, fmt.Errorf("%w: validity must be in the future", ErrEnterpriseQuoteInvalid)
	}
	seen := map[string]bool{}
	for i := range items {
		item := &items[i]
		item.ModelName = strings.TrimSpace(item.ModelName)
		if item.ModelName == "" || seen[item.ModelName] {
			return nil, fmt.Errorf("%w: duplicate or empty model at row %d", ErrEnterpriseQuoteInvalid, i+1)
		}
		seen[item.ModelName] = true
		if item.InputUSD < 0 || item.OutputUSD < 0 || item.CacheUSD < 0 {
			return nil, fmt.Errorf("%w: negative price at row %d", ErrEnterpriseQuoteInvalid, i+1)
		}
		if item.DiscountPercent == 0 {
			item.DiscountPercent = quote.DiscountPercent
		}
		if item.DiscountPercent < 0 || item.DiscountPercent > 100 {
			return nil, fmt.Errorf("%w: discount at row %d must be between 0 and 100", ErrEnterpriseQuoteInvalid, i+1)
		}
		factor := 1 - item.DiscountPercent/100
		item.QuotedInputUSD = round4(item.InputUSD * factor)
		item.QuotedOutputUSD = round4(item.OutputUSD * factor)
		item.QuotedCacheUSD = round4(item.CacheUSD * factor)
	}
	itemsJSON, err := common.Marshal(items)
	if err != nil {
		return nil, err
	}
	sellerJSON, _ := common.Marshal(GetEnterpriseSellerProfile())
	quote.Items = JSONValue(itemsJSON)
	quote.SellerSnapshot = JSONValue(sellerJSON)
	if quote.Currency == "" {
		quote.Currency = EnterpriseDefaultCurrency
	}
	quote.Id = 0
	quote.CreatedAt = now
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(quote).Error; err != nil {
			return err
		}
		quote.QuoteNo = fmt.Sprintf("Q-%s-%06d", time.Unix(now, 0).In(enterpriseBillingLocation).Format("200601"), quote.Id)
		return tx.Model(&EnterpriseQuote{}).Where("id = ?", quote.Id).Update("quote_no", quote.QuoteNo).Error
	})
	if err != nil {
		return nil, err
	}
	return quote, nil
}

func ListEnterpriseQuotes(keyword string, startIdx int, num int) ([]*EnterpriseQuote, int64, error) {
	query := DB.Model(&EnterpriseQuote{})
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("customer_name ILIKE ? OR quote_no ILIKE ?", like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	quotes := make([]*EnterpriseQuote, 0)
	err := query.Order("id DESC").Limit(num).Offset(startIdx).Find(&quotes).Error
	return quotes, total, err
}

func GetEnterpriseQuote(id int64) (*EnterpriseQuote, error) {
	var quote EnterpriseQuote
	err := DB.First(&quote, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &quote, err
}
