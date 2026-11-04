package model

import (
	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// ResetUserPasswordResult 管理员重置密码的结果：明文密码只在这里出现一次，不入库、不进审计
type ResetUserPasswordResult struct {
	UserId   int    `json:"user_id"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// ResetUserPasswordRandom 管理员为用户随机重置密码（TokenFunc 二开）：
// 16 位随机密码，auth_version+1 顶掉旧会话与访问令牌（与用户自改密码同口径）；不动状态、余额与分组。
func ResetUserPasswordRandom(userId int) (*ResetUserPasswordResult, error) {
	password := common.GetRandomString(16)
	hash, err := common.HashAccountPassword(password)
	if err != nil {
		return nil, err
	}
	var user User
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Select("id", "username").First(&user, "id = ?", userId).Error; err != nil {
			return err
		}
		if _, err := IncrementUserAuthVersionWithTx(tx, user.Id); err != nil {
			return err
		}
		return tx.Model(&User{}).Where("id = ?", user.Id).Update("password", hash).Error
	})
	if err != nil {
		return nil, err
	}
	if err := PublishUserAuthCache(user.Id); err != nil {
		common.SysError(common.LogText("failed to refresh user cache after admin password reset: %s", err.Error()))
	}
	return &ResetUserPasswordResult{UserId: user.Id, Username: user.Username, Password: password}, nil
}
