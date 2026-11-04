package controller

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 管理员重置密码：无 proof 拒绝；带 proof 成功后返回一次性新密码、旧密码失效、auth_version+1、审计不含明文
func TestAdminResetUserPasswordRequiresProofThenRotatesPassword(t *testing.T) {
	_, identity, target := setupAdminUserTest(t)
	params := gin.Params{{Key: "id", Value: fmt.Sprint(target.Id)}}

	response := adminUserRequest(http.MethodPost, "/api/user/:id/reset_password", "", "", identity, common.RoleRootUser, params, AdminResetUserPassword)
	var denied securityEnrollmentResponse
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &denied))
	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.Equal(t, "SECURITY_PROOF_REQUIRED", denied.Code)
	stored, err := model.GetUserById(target.Id, true)
	require.NoError(t, err)
	assert.True(t, common.ValidatePasswordAndHash("managed-password", stored.Password))

	operation := service.VerificationOperation{
		Scope:   service.VerificationScopeAdminUserPasswordReset,
		Context: []byte(fmt.Sprintf(`{"user_id":%d}`, target.Id)),
	}
	proof := issueSecurityEnrollmentProof(t, identity, operation, service.VerificationMethodPassword)
	response = adminUserRequest(http.MethodPost, "/api/user/:id/reset_password", "", proof, identity, common.RoleRootUser, params, AdminResetUserPassword)
	var result struct {
		Success bool                          `json:"success"`
		Data    model.ResetUserPasswordResult `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.True(t, result.Success, response.Body.String())
	assert.Equal(t, target.Id, result.Data.UserId)
	assert.Equal(t, "managed-user", result.Data.Username)
	assert.Len(t, result.Data.Password, 16)

	stored, err = model.GetUserById(target.Id, true)
	require.NoError(t, err)
	assert.False(t, common.ValidatePasswordAndHash("managed-password", stored.Password))
	assert.True(t, common.ValidatePasswordAndHash(result.Data.Password, stored.Password))
	assert.Equal(t, target.AuthVersion+1, stored.AuthVersion)

	var audit model.AuditLog
	require.NoError(t, model.LOG_DB.Where("action = ?", "user.reset_password").Last(&audit).Error)
	auditJSON, err := common.Marshal(audit)
	require.NoError(t, err)
	assert.NotContains(t, string(auditJSON), result.Data.Password)
	assert.NotContains(t, string(auditJSON), proof)

	// proof 一次性：再用一次被拒
	response = adminUserRequest(http.MethodPost, "/api/user/:id/reset_password", "", proof, identity, common.RoleRootUser, params, AdminResetUserPassword)
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &denied))
	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.Equal(t, "SECURITY_PROOF_CONSUMED", denied.Code)
}

// 管理员不能重置同级（其他管理员）的密码
func TestAdminResetUserPasswordRejectsPeerRole(t *testing.T) {
	_, identity, _ := setupAdminUserTest(t)
	password, err := common.Password2Hash("peer-password")
	require.NoError(t, err)
	peer := &model.User{Username: "peer-admin", Password: password, Role: common.RoleAdminUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "peer-aff"}
	require.NoError(t, model.DB.Create(peer).Error)

	response := adminUserRequest(http.MethodPost, "/api/user/:id/reset_password", "", "", identity, common.RoleAdminUser, gin.Params{{Key: "id", Value: fmt.Sprint(peer.Id)}}, AdminResetUserPassword)
	var result securityEnrollmentResponse
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	assert.False(t, result.Success)
	stored, err := model.GetUserById(peer.Id, true)
	require.NoError(t, err)
	assert.True(t, common.ValidatePasswordAndHash("peer-password", stored.Password))
	var flows int64
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).Count(&flows).Error)
	assert.Zero(t, flows)
}
