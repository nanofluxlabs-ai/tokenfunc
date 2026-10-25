package service

import (
	"compress/gzip"
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// 账期包冻结件读取（TokenFunc 二开）。账期内 logs 被 90 天清理删掉后，财务中心账单详情的逐条明细改读
// bills/{bill_no}/statement.json.gz（ArchiveBill 产出的 JSON 旁路件，与 statement.csv.gz 同一载荷）。
// 一次下载整份载荷放进程内缓存（按账单 id，10 分钟，上限 20 份），同一账单翻页不重复下载；
// 明细超过 billStatementInlineDetailMaxRows 时只缓存汇总 / 按天，明细改为提示下载冻结件。
// 旧归档（schema_version 1）没有 JSON 件，返回 model.ErrBillArchiveNotFound，调用方回落实时 logs。

const (
	billStatementCacheTTL     = 10 * time.Minute
	billStatementCacheMaxBill = 20
	// billStatementInlineDetailMaxRows 进程内缓存并在线分页的明细上限；超过只保留汇总 / 按天
	billStatementInlineDetailMaxRows = model.FinanceUsageExportMaxRows
)

type billStatementCacheEntry struct {
	payload   *FinanceUsageCSVPayload
	sha256    string
	expiresAt time.Time
}

var (
	billStatementCacheMu sync.Mutex
	billStatementCache   = map[int64]billStatementCacheEntry{}
)

// LoadBillStatementPayload 读取账单的冻结件 JSON 旁路件。返回的载荷在缓存期内被多个请求共享，调用方只读不改。
// IncludeDetail 为 false 表示明细行数超过在线上限，已被丢弃，只能下载冻结件
func LoadBillStatementPayload(ctx context.Context, bill *model.EnterpriseBill) (*FinanceUsageCSVPayload, error) {
	object, err := bill.ArchiveObject(model.BillArchiveFileStatementJSON)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	billStatementCacheMu.Lock()
	entry, ok := billStatementCache[bill.Id]
	billStatementCacheMu.Unlock()
	// 重新归档后 sha256 变化，旧缓存作废
	if ok && entry.sha256 == object.Sha256 && now.Before(entry.expiresAt) {
		return entry.payload, nil
	}
	store, err := LogArchiveStore()
	if err != nil {
		return nil, err
	}
	body, err := store.Get(ctx, object.Key)
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", object.Key, err)
	}
	defer body.Close()
	reader, err := gzip.NewReader(body)
	if err != nil {
		return nil, fmt.Errorf("gunzip %s: %w", object.Key, err)
	}
	defer reader.Close()
	payload := &FinanceUsageCSVPayload{}
	if err := common.DecodeJson(reader, payload); err != nil {
		return nil, fmt.Errorf("decode %s: %w", object.Key, err)
	}
	if payload.Summary == nil || payload.Daily == nil {
		return nil, fmt.Errorf("%s: statement payload has no summary", object.Key)
	}
	if len(payload.Details) > billStatementInlineDetailMaxRows {
		payload.Details, payload.IncludeDetail = nil, false
	}
	billStatementCacheMu.Lock()
	defer billStatementCacheMu.Unlock()
	for id, cached := range billStatementCache {
		if !now.Before(cached.expiresAt) {
			delete(billStatementCache, id)
		}
	}
	if len(billStatementCache) >= billStatementCacheMaxBill {
		oldestId, oldestAt := int64(0), time.Time{}
		for id, cached := range billStatementCache {
			if oldestAt.IsZero() || cached.expiresAt.Before(oldestAt) {
				oldestId, oldestAt = id, cached.expiresAt
			}
		}
		delete(billStatementCache, oldestId)
	}
	billStatementCache[bill.Id] = billStatementCacheEntry{payload: payload, sha256: object.Sha256, expiresAt: now.Add(billStatementCacheTTL)}
	return payload, nil
}

// resetBillStatementCacheForTest 清空进程内冻结件缓存
func resetBillStatementCacheForTest() {
	billStatementCacheMu.Lock()
	defer billStatementCacheMu.Unlock()
	billStatementCache = map[int64]billStatementCacheEntry{}
}
