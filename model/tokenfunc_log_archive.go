package model

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// logs 按天归档清单（TokenFunc 二开，仅 PostgreSQL）。保留任务「先归档、校验通过、再删除」的落地载体：
// 每个上海日一行，记录导出到对象存储的行数 / id 区间 / 校验值与状态。
//
// 状态机：pending（已登记 / 导出或上传失败待重试）→ verified（对象已上传且大小 / MD5 核对通过）→ purged（该天可清理行已删除）。
// row_count=0 的天直接 purged（无对象）。已 purged 的天若再出现可清理行（极少），追加 .pN 分片再清理。

type LogArchiveManifest struct {
	Day    string `json:"day" gorm:"type:varchar(10);primaryKey"`
	Status string `json:"status" gorm:"type:varchar(16);not null;default:'pending';index"`
	// Parts 已归档的分片数：正常 1。下方 RowCount / MinId / MaxId / SumQuota / ObjectKey / Bytes / Sha256 描述最新分片，TotalRows / PurgedRows 跨分片累计
	Parts     int   `json:"parts" gorm:"not null;default:0"`
	TotalRows int64 `json:"total_rows" gorm:"not null;default:0"`
	RowCount  int64 `json:"row_count" gorm:"not null;default:0"`
	MinId     int64 `json:"min_id" gorm:"not null;default:0"`
	MaxId     int64 `json:"max_id" gorm:"not null;default:0"`
	SumQuota  int64 `json:"sum_quota" gorm:"not null;default:0"`
	// ObjectKey 桶内完整 key；Bytes / Sha256 为 .csv.gz 文件的大小与摘要
	ObjectKey     string `json:"object_key" gorm:"type:varchar(255);not null;default:''"`
	Bytes         int64  `json:"bytes" gorm:"not null;default:0"`
	Sha256        string `json:"sha256" gorm:"type:varchar(64);not null;default:''"`
	SchemaVersion int    `json:"schema_version" gorm:"not null;default:0"`
	LastError     string `json:"last_error" gorm:"type:varchar(255);not null;default:''"`
	PurgedRows    int64  `json:"purged_rows" gorm:"not null;default:0"`
	PurgedAt      int64  `json:"purged_at" gorm:"not null;default:0"`
	CreatedAt     int64  `json:"created_at" gorm:"not null;default:0"`
	UpdatedAt     int64  `json:"updated_at" gorm:"not null;default:0"`
}

func (LogArchiveManifest) TableName() string { return "tf_log_archive_manifests" }

const (
	LogArchiveStatusPending  = "pending"
	LogArchiveStatusVerified = "verified"
	LogArchiveStatusPurged   = "purged"
)

// GetLogArchiveManifest 按天读清单；不存在返回 (nil, nil)
func GetLogArchiveManifest(day string) (*LogArchiveManifest, error) {
	var manifest LogArchiveManifest
	result := DB.Where("day = ?", day).Limit(1).Find(&manifest)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &manifest, nil
}

// UpsertLogArchiveManifest 以 day 为冲突键整体写入（UpdatedAt 自动刷新）
func UpsertLogArchiveManifest(manifest *LogArchiveManifest) error {
	now := time.Now().Unix()
	if manifest.CreatedAt == 0 {
		manifest.CreatedAt = now
	}
	manifest.UpdatedAt = now
	return DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "day"}}, UpdateAll: true}).Create(manifest).Error
}

// ListLogArchiveManifests 按天倒序分页（管理端「归档清单」页）
func ListLogArchiveManifests(startIdx int, num int) ([]LogArchiveManifest, int64, error) {
	items := make([]LogArchiveManifest, 0)
	var total int64
	query := DB.Model(&LogArchiveManifest{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("day DESC").Offset(startIdx).Limit(num).Find(&items).Error
	return items, total, err
}

// LogArchiveManifestSummary 清单概览：各状态天数与最近一个已清理日
type LogArchiveManifestSummary struct {
	PendingDays  int64  `json:"pending_days"`
	VerifiedDays int64  `json:"verified_days"`
	PurgedDays   int64  `json:"purged_days"`
	PurgedRows   int64  `json:"purged_rows"`
	MaxPurgedDay string `json:"max_purged_day"`
	// RowMismatchDays 已清理但累计行数与删除行数不一致的天数（巡检用）
	RowMismatchDays int64 `json:"row_mismatch_days"`
}

func GetLogArchiveManifestSummary() (LogArchiveManifestSummary, error) {
	var summary LogArchiveManifestSummary
	var rows []struct {
		Status string
		Days   int64
		Rows   int64
		MaxDay string
	}
	err := DB.Model(&LogArchiveManifest{}).Select("status, COUNT(*) AS days, COALESCE(SUM(purged_rows), 0) AS rows, MAX(day) AS max_day").
		Group("status").Scan(&rows).Error
	if err != nil {
		return summary, err
	}
	for _, row := range rows {
		switch row.Status {
		case LogArchiveStatusPending:
			summary.PendingDays = row.Days
		case LogArchiveStatusVerified:
			summary.VerifiedDays = row.Days
		case LogArchiveStatusPurged:
			summary.PurgedDays, summary.PurgedRows, summary.MaxPurgedDay = row.Days, row.Rows, row.MaxDay
		}
	}
	err = DB.Model(&LogArchiveManifest{}).Where("status = ? AND total_rows <> purged_rows", LogArchiveStatusPurged).Count(&summary.RowMismatchDays).Error
	return summary, err
}

// LogArchiveObjectKey 该天第 part 个分片的桶内相对路径（不含统一前缀）：首片 logs/D.csv.gz，追加分片 logs/D.pN.csv.gz
func LogArchiveObjectKey(day string, part int) []string {
	name := day + ".csv.gz"
	if part > 1 {
		name = fmt.Sprintf("%s.p%d.csv.gz", day, part)
	}
	return []string{"logs", name}
}

// ---------------------------------------------------------------------------
// 导出 / 复核 / 删除共用的筛选
// ---------------------------------------------------------------------------

// LogArchiveFilter 某天可归档行的筛选：时间半开区间、排除的类型（资金流水）、排除的用户（账期护栏）、id 上限（复核与删除只动已导出的行）
type LogArchiveFilter struct {
	StartTs        int64
	EndTs          int64
	ExcludeTypes   []int
	ExcludeUserIds []int
	MaxId          int64
}

func (f LogArchiveFilter) apply(tx *gorm.DB) *gorm.DB {
	tx = tx.Where("created_at >= ? AND created_at < ?", f.StartTs, f.EndTs)
	if len(f.ExcludeTypes) > 0 {
		tx = tx.Where("type NOT IN ?", f.ExcludeTypes)
	}
	if len(f.ExcludeUserIds) > 0 {
		tx = tx.Where("user_id NOT IN ?", f.ExcludeUserIds)
	}
	if f.MaxId > 0 {
		tx = tx.Where("id <= ?", f.MaxId)
	}
	return tx
}

// LogArchiveStats 一次导出的行数 / id 区间 / quota 合计，写进清单供导回后对账
type LogArchiveStats struct {
	Rows     int64
	MinId    int64
	MaxId    int64
	SumQuota int64
}

// LogArchiveRowFunc 每行回调：columns 为 SELECT * 的列名（DB 顺序），values 为同序的扫描值
type LogArchiveRowFunc func(columns []string, values []any) error

// IterateLogArchiveRows 按 (created_at, id) 升序游标分页遍历 logs 全部列，逐行回调；命中 idx_created_at_id。
// 全列 SELECT * 刻意不写死列清单：logs 加列后归档文件自动带上，文件首行即列名。
func IterateLogArchiveRows(ctx context.Context, f LogArchiveFilter, batch int, fn LogArchiveRowFunc) (LogArchiveStats, error) {
	var stats LogArchiveStats
	if batch <= 0 {
		batch = 5000
	}
	var afterCreatedAt, afterId int64
	first := true
	for {
		if err := ctx.Err(); err != nil {
			return stats, err
		}
		tx := f.apply(LOG_DB.WithContext(ctx).Table("logs").Select("*"))
		if !first {
			tx = tx.Where("(created_at > ? OR (created_at = ? AND id > ?))", afterCreatedAt, afterCreatedAt, afterId)
		}
		rows, err := tx.Order("created_at ASC, id ASC").Limit(batch).Rows()
		if err != nil {
			return stats, err
		}
		columns, err := rows.Columns()
		if err != nil {
			rows.Close()
			return stats, err
		}
		idIdx, createdIdx, quotaIdx := -1, -1, -1
		for i, column := range columns {
			switch column {
			case "id":
				idIdx = i
			case "created_at":
				createdIdx = i
			case "quota":
				quotaIdx = i
			}
		}
		if idIdx < 0 || createdIdx < 0 {
			rows.Close()
			return stats, fmt.Errorf("logs archive: id / created_at column missing in %v", columns)
		}
		n := 0
		for rows.Next() {
			values := make([]any, len(columns))
			ptrs := make([]any, len(columns))
			for i := range values {
				ptrs[i] = &values[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				rows.Close()
				return stats, err
			}
			id := archiveValueInt64(values[idIdx])
			afterCreatedAt, afterId = archiveValueInt64(values[createdIdx]), id
			stats.Rows++
			if stats.MinId == 0 || id < stats.MinId {
				stats.MinId = id
			}
			stats.MaxId = max(stats.MaxId, id)
			if quotaIdx >= 0 {
				stats.SumQuota += archiveValueInt64(values[quotaIdx])
			}
			if err := fn(columns, values); err != nil {
				rows.Close()
				return stats, err
			}
			n++
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return stats, err
		}
		first = false
		if n < batch {
			return stats, nil
		}
	}
}

// archiveValueInt64 把 driver 返回的整数值折叠为 int64
func archiveValueInt64(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int32:
		return int64(n)
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case []byte:
		var out int64
		_, _ = fmt.Sscan(string(n), &out)
		return out
	}
	return 0
}

// CountLogArchiveRows 清理前复核：按同一筛选条件数行，必须与清单行数一致才允许删除
func CountLogArchiveRows(f LogArchiveFilter) (int64, error) {
	var count int64
	err := f.apply(LOG_DB.Model(&Log{})).Count(&count).Error
	return count, err
}

// DeleteLogArchiveRowsBatch 按 id 升序分批删除，返回本批删除行数
func DeleteLogArchiveRowsBatch(f LogArchiveFilter, limit int) (int64, error) {
	sub := f.apply(LOG_DB.Model(&Log{}).Select("id")).Order("id ASC").Limit(limit)
	result := LOG_DB.Where("id IN (?)", sub).Delete(&Log{})
	return result.RowsAffected, result.Error
}

// MinLogCreatedAtExcludingTypes 最早一条可归档行的时间；没有返回 0
func MinLogCreatedAtExcludingTypes(excludeTypes []int) (int64, error) {
	var minTs int64
	tx := LOG_DB.Model(&Log{})
	if len(excludeTypes) > 0 {
		tx = tx.Where("type NOT IN ?", excludeTypes)
	}
	err := tx.Select("COALESCE(MIN(created_at), 0)").Scan(&minTs).Error
	return minTs, err
}

// ListOpenCreditPeriodOwners 进行中授信账期的企业主账号及账期起点（归档护栏：出账前不删这些用户从账期起点前一天起的日志）
func ListOpenCreditPeriodOwners() (map[int]int64, error) {
	var rows []struct {
		UserId  int
		StartAt int64
	}
	err := DB.Table("ent_credit_periods p").Select("e.user_id, p.start_at").
		Joins("JOIN enterprises e ON e.id = p.enterprise_id").
		Where("p.status = ?", EnterpriseCreditPeriodOpen).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	owners := make(map[int]int64, len(rows))
	for _, row := range rows {
		if existing, ok := owners[row.UserId]; !ok || row.StartAt < existing {
			owners[row.UserId] = row.StartAt
		}
	}
	return owners, nil
}
