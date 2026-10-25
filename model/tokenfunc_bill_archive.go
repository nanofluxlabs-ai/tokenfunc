package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 账单账期包归档登记（TokenFunc 二开）。已出账账单由 service.ArchiveBill 生成三个对象上传对象存储：
//   - bills/{bill_no}/statement.csv.gz：对账单冻结件，与账单详情页「导出 CSV（含明细）」逐字节同口径，发客户的财务凭证；
//   - bills/{bill_no}/statement.json.gz：冻结件的 JSON 旁路件（service.FinanceUsageCSVPayload 原样序列化），
//     账期内 logs 被清理后财务中心的逐条明细从这里读，不反解析中文表头的 CSV；
//   - bills/{bill_no}/raw-logs.csv.gz：该企业主账号本账期的原始日志全列，对内复查用。
//
// 登记信息写进 ent_bills.archive_info（jsonb）并置 archived_at。logs 保留任务不删「仍有未归档账单的账期」内的天。

// BillArchiveObject 账期包里单个对象的登记
type BillArchiveObject struct {
	Key    string `json:"key"`
	Bytes  int64  `json:"bytes"`
	Sha256 string `json:"sha256"`
	Rows   int64  `json:"rows"`
}

// BillArchiveInfo 序列化进 EnterpriseBill.ArchiveInfo。
// StatementJSON 自 schema_version 2 起才有；v1 归档的账单重新归档即补齐（对象同名覆盖，幂等）
type BillArchiveInfo struct {
	Statement     *BillArchiveObject `json:"statement,omitempty"`
	StatementJSON *BillArchiveObject `json:"statement_json,omitempty"`
	RawLogs       *BillArchiveObject `json:"raw_logs,omitempty"`
	SchemaVersion int                `json:"schema_version"`
	ArchivedAt    int64              `json:"archived_at"`
}

// BillArchiveSchemaVersion 账期包格式版本：1 = statement.csv.gz + raw-logs.csv.gz；2 = 另加 statement.json.gz
const BillArchiveSchemaVersion = 2

// 账期包的文件名，也是下载接口的 :file 参数
const (
	BillArchiveFileStatement     = "statement"
	BillArchiveFileStatementJSON = "statement-json"
	BillArchiveFileRawLogs       = "raw-logs"
)

var ErrBillArchiveNotFound = errors.New("bill archive object not found")

// BillArchiveObjectName 文件名 → 对象基名（也是下载时账单号后面的后缀）
func BillArchiveObjectName(file string) string {
	if file == BillArchiveFileStatementJSON {
		return "statement.json.gz"
	}
	return file + ".csv.gz"
}

// BillArchiveObjectKey 账期包对象在统一前缀下的路径段
func BillArchiveObjectKey(billNo string, file string) []string {
	return []string{"bills", billNo, BillArchiveObjectName(file)}
}

// GetArchiveInfo 解析归档登记；未归档或解析失败返回零值
func (b *EnterpriseBill) GetArchiveInfo() BillArchiveInfo {
	var info BillArchiveInfo
	if len(b.ArchiveInfo) == 0 {
		return info
	}
	_ = common.Unmarshal(b.ArchiveInfo, &info)
	return info
}

// ArchiveObject 按文件名取登记的对象；未归档或文件名不认识时报错
func (b *EnterpriseBill) ArchiveObject(file string) (*BillArchiveObject, error) {
	info := b.GetArchiveInfo()
	var object *BillArchiveObject
	switch file {
	case BillArchiveFileStatement:
		object = info.Statement
	case BillArchiveFileStatementJSON:
		object = info.StatementJSON
	case BillArchiveFileRawLogs:
		object = info.RawLogs
	default:
		return nil, fmt.Errorf("%w: unknown file %q", ErrBillArchiveNotFound, file)
	}
	if b.ArchivedAt == 0 || object == nil || object.Key == "" {
		return nil, ErrBillArchiveNotFound
	}
	return object, nil
}

// GetEnterpriseBillByNo 按账单号取账单（回放工具用）
func GetEnterpriseBillByNo(billNo string) (*EnterpriseBill, error) {
	var bill EnterpriseBill
	err := DB.First(&bill, "bill_no = ?", billNo).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &bill, err
}

// ListBillsPendingArchive 已出账、未作废、未归档的账单，按出账时间升序（存量账单按顺序回填）
func ListBillsPendingArchive(limit int) ([]*EnterpriseBill, error) {
	bills := make([]*EnterpriseBill, 0)
	err := DB.Where("archived_at = 0 AND status <> ? AND bill_no <> ''", EnterpriseBillVoid).
		Order("issued_at ASC, id ASC").Limit(limit).Find(&bills).Error
	return bills, err
}

// MarkBillArchived 写入归档登记并置 archived_at（取 info.ArchivedAt）
func MarkBillArchived(billId int64, info BillArchiveInfo) error {
	raw, err := common.Marshal(info)
	if err != nil {
		return err
	}
	return DB.Model(&EnterpriseBill{}).Where("id = ?", billId).Updates(map[string]any{
		"archive_info": JSONValue(raw), "archived_at": info.ArchivedAt, "updated_at": common.GetTimestamp(),
	}).Error
}

// MinUnarchivedBillPeriodStart 未归档（且未作废）账单里最早的账期开始时间；没有返回 0。
// logs 保留任务据此止步：这些账期的原始日志要先进账期包再删。
func MinUnarchivedBillPeriodStart() (int64, error) {
	var start int64
	err := DB.Model(&EnterpriseBill{}).Where("archived_at = 0 AND status <> ? AND bill_no <> ''", EnterpriseBillVoid).
		Select("COALESCE(MIN(period_start), 0)").Scan(&start).Error
	return start, err
}

// BillUsageSource 账期内 logs 已清理时逐条明细的来源：账期包带 JSON 旁路件读冻结件，否则不可用
func BillUsageSource(bill *EnterpriseBill) string {
	if _, err := bill.ArchiveObject(BillArchiveFileStatementJSON); err == nil {
		return FinanceUsageSourceArchive
	}
	return FinanceUsageSourceArchiveUnavailable
}

// BillPeriodLogsPurged 账单账期内是否已有被归档删除的天（账单详情页据此提示明细可能不完整）
func BillPeriodLogsPurged(bill *EnterpriseBill) (bool, error) {
	if bill.PeriodEnd <= bill.PeriodStart {
		return false, nil
	}
	var count int64
	err := DB.Model(&LogArchiveManifest{}).Where("status = ? AND day >= ? AND day <= ?", LogArchiveStatusPurged,
		FinanceDay(bill.PeriodStart), FinanceDay(bill.PeriodEnd-1)).Count(&count).Error
	return count > 0, err
}
