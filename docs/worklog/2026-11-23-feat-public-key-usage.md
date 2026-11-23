# 公开的 API 密钥用量查询页 /key-usage

- 日期：2026-11-23
- 分支：main
- PR：
- 关键 commit：

## 背景

员工只持有 key、不能登录，只能 curl `/v1/enterprise/employee/me` 自查；普通用户也没有「粘贴 key 看额度」的网页。上游 new-api（核对 v1.0.0-rc.51）只有 `/api/usage/token`、`/api/log/token` 接口，没有页面，页脚外链第三方 new-api-key-tool。用户要求做公开查询页：额度、员工归属、调用记录（分页 + 时间与模型筛选）。

## 变更

- 后端：
  - 新接口 `GET /api/key-usage/logs`（key 只读鉴权 + 按 IP 限流，次数沿用搜索限流 10 次/分钟）：本 key 的消费记录分页，可按时间与模型过滤，时间范围受日志最长查询天数限制，可见字段与用户日志一致。
  - `/api/usage/token`：分配到企业团队或成员的 key 即使勾了「允许查询账户余额」也不返回 `user_quota`（企业钱包余额），与员工自查接口口径一致。
  - 限流不用上游 `SearchRateLimit`：它按用户 ID 计数，企业员工的 key 都属于主账号，会让整个企业共用一个桶。

## 验证

- `make test-db PKG='-count=1 -run "TestKeyUsage|TestCreditBilling|TestAccessToken" ./controller/ ./router/'`：ok。
- 反向验证：去掉余额兜底后，团队 key 与成员 key 的用例都因返回 `user_quota` 失败。

## 遗留

无
