package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/authz"
)

// 企业控制台（TokenFunc 二开）的访问令牌作用域，单独注册以免改动上游的静态资源列表
func init() {
	accessTokenStaticResources = append(accessTokenStaticResources, AccessTokenResource{
		Resource: "enterprise",
		LabelKey: "Enterprise console",
		group:    AccessTokenGroupPersonal,
		minRole:  common.RoleCommonUser,
		Actions: []authz.ActionDefinition{
			accessTokenView("View your enterprise departments, employees, projects, and employee API keys."),
			accessTokenEdit("Manage enterprise departments, employees, projects, and employee API key assignments."),
		},
	})
}
