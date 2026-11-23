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
- 前端 `features/key-usage` + 路由 `/key-usage`（公开，PublicLayout）：
  - 粘贴 key → 额度卡片（`/api/usage/token/`）、可用模型（`/v1/models`）、企业成员卡片（`/v1/enterprise/employee/me`，403 不显示）、调用记录（新接口，`PeriodFilter` 时间筛选 + 模型下拉 + 服务端分页）。
  - 请求用原生 `fetch` + `credentials: 'omit'`：axios `api` 的拦截器会用登录态覆盖 Authorization；key 只在内存，不进 URL / 存储，筛选与页码同步在 URL。
  - 额度查询成功后才发其余请求，无效 key 只消耗一次；错误在页面内提示，关闭全局错误 toast。
  - 模型下拉 = 当前可用模型 ∪ 本月常用模型 ∪ 当前页出现的模型：key 的模型限制会变，历史记录里可能有已不可用的模型。
  - 未查询时直接展示完整结构：额度卡片显示「—」，企业成员卡与调用记录显示说明文字，筛选控件置灰，用户进来就知道能查到什么。
  - 模型下拉放在日期区间与「查询 / 重置」之间，与日期一起点「查询」生效、「重置」一并清空（一次 navigate 写入，避免两次写 URL 互相覆盖）；为此给 `PeriodFilter` / `DayRangeControls` 加可选插槽与 `onApply` / `onReset`，其余调用方不变。
- 入口：文档侧栏「开始使用」分组加链接（registry `DOCS_NAV_LINKS`，不是文档正文，不参与预渲染、sitemap 与翻页），点击进入独立的 `/key-usage`；企业接入「员工自查」一节链接到该页（中英）。最初放在页脚，用户要求改到文档侧栏后已移除。
- i18n：新文案追加到 `i18n/locales/tokenfunc/*.json` 七语言。

## 验证

- `make test-db PKG='-count=1 -run "TestKeyUsage|TestCreditBilling|TestAccessToken" ./controller/ ./router/'`：ok。
- 反向验证：去掉余额兜底后，团队 key 与成员 key 的用例都因返回 `user_quota` 失败。
- 前端：`bun check -b`、oxlint、oxfmt 通过；`vitest run src/components/layout src/features/key-usage src/features/docs` 17 个文件 179 个用例通过（key-usage 新增 4 个：只带 key 头、不带 cookie、URL 不含 key、403 视为非员工、401、粘贴规范化）。
- 浏览器（5173 → 3000，已登录 root 的情况下）：用 seed 企业成员 key 查询，额度 / 企业卡片 / 调用记录正常，说明请求未被登录态覆盖；模型筛选与翻页请求参数正确，URL 只含 model / page；无效 key 显示「API 密钥无效或已停用」且无全局 toast；文档侧栏「开始使用」中出现入口并能跳转；未查询时的占位与「模型选好后点查询才请求」已验证。

## 遗留

- 手机宽度未实测（PeriodFilter 在窄屏收成抽屉，表格走 DataTablePage 的移动布局）。
- 调用记录只含消费记录（type=2），错误记录不展示。
