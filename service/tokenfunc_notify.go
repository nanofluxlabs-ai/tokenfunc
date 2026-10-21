package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// NotifyRootUser 给 root 用户发一条通知。
// 上游 rc.45 把渠道类通知改成按「订阅了渠道通知的管理员」分发并删掉了这个 helper；
// 二开的渠道健康与企业线索通知语义是「一定送达 root」，不走订阅开关，所以在这里保留原实现。
func NotifyRootUser(notifyType string, subject string, content string) {
	var root model.User
	if err := model.DB.Where("role = ?", common.RoleRootUser).First(&root).Error; err != nil {
		common.SysLog(common.LogText("failed to notify root user: %s", err.Error()))
		return
	}
	user := root.ToBaseUser()
	if err := NotifyUser(user.Id, user.Email, user.GetSetting(), dto.NewNotify(notifyType, subject, content, nil)); err != nil {
		common.SysLog(common.LogText("failed to notify root user: %s", err.Error()))
	}
}
