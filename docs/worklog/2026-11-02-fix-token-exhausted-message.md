# 网关区分「额度耗尽 / 已过期」与「无效令牌」文案

- 日期：2026-11-02
- 分支：fix-token-exhausted-message
- PR：（未建）
- 关键 commit：58f51d7ee

## 背景

上线前测试观察项 6 的运行时一半（创建端一半已在 fix-ent-token-zero-quota 收口）：`ValidateUserToken` 对「不存在 / 禁用 / 已过期 / 额度耗尽」四种失败统一返回 `ErrTokenInvalid`，`TokenAuth` 出口折叠成同一句 401「无效的令牌」。耗尽 / 过期是持有者可自行解决的状态（补额度 / 改有效期），与「key 不存在」合并纯丢排障信息（C-1 用例当时被误导先查权限）。

## 变更

- `model/errors.go`：新增哨兵 `ErrTokenExhausted` / `ErrTokenExpired`。
- `model/token.go` `ValidateUserToken`：状态分支（已是 exhausted / expired）、时间到期分支、额度耗尽分支按原因返回新哨兵；**不存在与禁用（及其余未知状态）继续返回 `ErrTokenInvalid`**——防枚举口径不变。
- `middleware/auth.go` `TokenAuth` 出口：`errors.Is` 链按原因分流到新文案；HTTP 401、`type: new_api_error`、`code: ""` 全部保持，仅 message 文本区分，对外契约不变。
- `i18n/keys.go` + `locales/{en,zh-CN,zh-TW}.yaml`：新增 `token.exhausted` / `token.expired`（后端消息只译三语）。文案：令牌额度已耗尽，请提高令牌额度或开启无限额度 / 令牌已过期，请修改有效期或重新创建令牌。

## 设计口径

- 拆分边界：只有「持有者自己造成的状态」单独文案；「不存在 / 已禁用」合并且响应逐字节一致（key 为 48 位随机串，区分耗尽 / 过期不帮助探测他人 key，区分存在性才相关）。
- `TokenAuthReadOnly`（只读查询的宽松认证）不经 `ValidateUserToken`，设计上允许耗尽 / 过期令牌查日志，不在本次范围。
- 前置结论修正：此前评估「需新增 i18n 键、热路径风险大」偏保守——中间件已有类型化分流管道（IP / 分组拒绝即先例），`ValidateUserToken` 仅 `TokenAuth` 一个消费方，实际改动 4 文件约 40 行。

## 验证

- 失败用例先行：`middleware/auth_test.go` 新增 `TestTokenAuthDistinguishesTokenStateMessages`，五态表测（耗尽-状态位 / 耗尽-实时、过期-状态位 / 过期-实时、禁用、不存在、健康通过）+ 契约守卫（禁用与不存在响应逐字节相等、全部 401、`code` 保持空串）+ en 文案抽查；改前四个可区分态全报「无效的令牌」复现。
- 修复后：`go test ./middleware ./model ./i18n` 通过；`make test-db PKG='./controller'` 全包通过（无既有用例依赖折叠文案）。

## 遗留

- Redis 开启时耗尽 / 过期状态翻转不落库（`token.go` 的 `!common.RedisEnabled` 守卫，控制台列表显示「启用 + remain 0」的迷惑来源）：涉及 token 缓存写路径一致性，需单独验证，已另列改进项，不在本次范围。
- 本改动涉及上游热路径文件（model/token.go、middleware/auth.go），已同步整理 new-api 上游 PR 草稿（.tmp/upstream-pr-token-exhausted-message.md，不入库），由黑鹰择机提交上游；上游合并后本仓库在下次同步时可回归上游版本。
