# 密钥/令牌创建端拒绝 0 额度（未启用无限额度）

- 日期：2026-11-02
- 分支：fix-ent-token-zero-quota
- PR：（未建）
- 关键 commit：（见本分支提交）

## 背景

上线前测试观察项 6（企业 C 的 C-1 用例）：企业 key 建时未勾「无限额度」、额度留 0，创建却返回成功；首次调用网关报「无效的令牌」（ValidateUserToken 把额度耗尽与 key 不存在等折叠成同一错误），排障时极易误诊为权限问题。随后在个人令牌页复测发现上游个人令牌 `AddToken`/`UpdateToken`（controller/token.go）存在同样缺口（用户本地实测：root 把既有令牌改成固定额度 0 保存成功、无任何提示），按用户决定一并封堵（「上游保持原样」约定的一次显式例外）。运行时文案区分属上游公共路径（观察项 6 的另一半，跟上游处理），本次只收创建/编辑端。

## 变更

- 后端（企业）：`validateEnterpriseTokenRequest`（controller/enterprise_tokens.go，创建与编辑共用）把非无限额度的合法区间从 `< 0` 收紧为 `<= 0`，报错文案改为明确的 `key quota must be greater than zero unless unlimited quota is enabled`。
- 后端（个人令牌，上游文件显式例外）：`AddToken`/`UpdateToken` 同口径把 `< 0` 收紧为 `<= 0`，复用同一报错键；`UpdateToken` 加 `statusOnly == ""` 守卫——令牌列表的启停开关走 `?status_only=true`，请求体只带 `{id, status}`，额度字段绑定为零值且不落库，不得误伤。
- 前端（企业）：`token-mutate-sheet.tsx` 的 superRefine 在固定额度模式下要求 `quota_dollars > 0`，表单内联报错，不再等提交后由网关拒绝；周期模式不受影响（周期额度本就要求 > 0）。
- 前端（个人令牌）：`api-key-form.ts` 的 superRefine 对非无限额度要求 `remain_quota_dollars > 0`（默认值 10 且默认勾无限，不影响新建默认流）；编辑已耗尽令牌（remain 0）时保存会要求先补额度，与后端「耗尽令牌启用需先补额度」的既有口径一致。
- i18n：新增两条键（表单文案 `Quota must be greater than zero`、后端 API 消息）补齐 `locales/tokenfunc/` 全部 7 语言，`bun run i18n:sync` 后无 missing / untranslated。

## Bug 根因

校验器只拒绝负数与超上限，`remain_quota == 0` 放行 → key 落库即为「启用态 + 0 额度 + 非无限」的死 key，创建成功提示与实际不可用矛盾；运行时（Redis 开启）耗尽态又不落库，列表里看着正常，首发调用才在网关暴露。前端 zod 同样 `min(0)` 且默认值 0，与后端口径一致地放行。上游个人令牌路径与企业路径缺口同构。

## 验证

- 失败用例先行：后端 `TestEnterpriseConsoleTokenManagement` 新增「zero quota without unlimited」表项、`TestTokenRejectsZeroQuotaWithoutUnlimited`（create/update 双路 + status_only 守卫，改前创建成功→断言失败复现）；前端 sheet 新增「固定额度 0 → 内联报错阻止提交，改正数后正常提交」、`auto-group-form.test.ts` 新增固定额度校验 describe（0/负数拒绝、正数与无限放行）（改前直接提交成功→断言失败复现）。
- 修复后：`make test-db PKG='./controller'` 全包通过（含既有站点/企业 key 上限、启停、批量、审计矩阵用例）；`bunx vitest run src/features/keys` 8 文件 80 用例、`src/features/enterprise-console src/features/enterprises` 33 文件 184 用例通过；`bunx tsc -b`、oxlint 干净。
- 既有用例适配：企业侧原「编辑到固定额度 0」造耗尽态的夹具改为编辑成正数后直写 DB `remain_quota=0` 模拟用完（现实中耗尽由用量产生），下游「耗尽 key 不能启用 / 批量启用跳过」行为断言不变；正向固定额度用例用完即删，不挤占后续 key 配额计数。
- status_only 守卫回归验证：耗尽态（状态 exhausted + remain 0 + 非无限）下启用仍被既有守卫拒绝（提示补额度或改无限）、停用正常成功；审计矩阵的 disable/enable 用例全库型（sqlite/mysql/postgres × 独立日志库）通过。

## 遗留

- 运行时「额度耗尽」与「无效令牌」文案区分（观察项 6 另一半）涉上游 `model/token.go` / `middleware/auth.go` 热路径与对外错误契约，跟上游处理，不在本次范围。
- 上游既有行为记录（未改）：status_only 停用会把 exhausted 状态覆盖为 disabled，此后启用不再触发「耗尽不能启用」守卫（仍因 remain 0 在网关被拒并翻回耗尽态）；如需彻底收紧需上游调整状态机，跟上游。
- 上游文件 controller/token.go 的两处 `<=0` 收紧是「上游保持原样」约定的显式例外（用户拍板），后续合并上游时注意保留。
