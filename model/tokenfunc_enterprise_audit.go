package model

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 企业控制台审计视角（TokenFunc 二开，只支持 PostgreSQL）：企业主账号 / 企业管理员查看本企业成员在控制台里的操作。
// 口径：action 以 enterprise. 开头、参数里的 enterprise_id 为本企业、操作者是普通用户（平台管理员的操作不给企业看）。
// 不按成员 user_id 集合过滤：成员可以绑定已有个人账号，按账号过滤会带出绑定前后的个人记录。

// EnterpriseAuditSupported 企业审计依赖 PG 的 json 运算符
func EnterpriseAuditSupported() error {
	return financeRequirePostgres()
}

// applyEnterpriseAuditScope enterpriseId 为 0 时不限定
func applyEnterpriseAuditScope(query *gorm.DB, enterpriseId int) *gorm.DB {
	if enterpriseId <= 0 {
		return query
	}
	return query.Where("action LIKE ?", "enterprise.%").
		Where("actor_role = ?", common.RoleCommonUser).
		Where("other->'op'->'params'->>'enterprise_id' = ?", strconv.Itoa(enterpriseId))
}

// redactAuditForCustomer 平台外部用户不展示请求方法与路由（平台内部信息）；访问令牌记录除外，那是用户自己调用的开放接口
func redactAuditForCustomer(entry *AuditLog, viewerRole int) {
	if viewerRole >= common.RoleAdminUser || entry.Category == AuditCategoryAccessToken {
		return
	}
	entry.Method = ""
	entry.Route = ""
}
