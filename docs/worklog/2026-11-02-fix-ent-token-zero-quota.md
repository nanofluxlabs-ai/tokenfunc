# 企业密钥创建端拒绝 0 额度（未启用无限额度）

- 日期：2026-11-02
- 分支：fix-ent-token-zero-quota
- PR：（未建）
- 关键 commit：（见本分支提交）

## 背景

上线前测试观察项 6（企业 C 的 C-1 用例）：企业 key 建时未勾「无限额度」、额度留 0，创建却返回成功；首次调用网关报「无效的令牌」（ValidateUserToken 把额度耗尽与 key 不存在等折叠成同一错误），排障时极易误诊为权限问题。运行时文案区分属上游公共路径（观察项 6 的另一半，跟上游处理），本次只收创建端。

## 变更

- 后端：`validateEnterpriseTokenRequest`（controller/enterprise_tokens.go，创建与编辑共用）把非无限额度的合法区间从 `< 0` 收紧为 `<= 0`，报错文案改为明确的 `key quota must be greater than zero unless unlimited quota is enabled`。
- 前端：`token-mutate-sheet.tsx` 的 superRefine 在固定额度模式下要求 `quota_dollars > 0`，表单内联报错，不再等提交后由网关拒绝；周期模式不受影响（周期额度本就要求 > 0）。
- i18n：新增两条键（表单文案 `Quota must be greater than zero`、后端 API 消息）补齐 `locales/tokenfunc/` 全部 7 语言，`bun run i18n:sync` 后无 missing / untranslated。

## Bug 根因

校验器只拒绝负数与超上限，`remain_quota == 0` 放行 → key 落库即为「启用态 + 0 额度 + 非无限」的死 key，创建成功提示与实际不可用矛盾；运行时（Redis 开启）耗尽态又不落库，列表里看着正常，首发调用才在网关暴露。前端 zod 同样 `min(0)` 且默认值 0，与后端口径一致地放行。

## 验证

- 失败用例先行：后端 `TestEnterpriseConsoleTokenManagement` 新增「zero quota without unlimited」表项（改前创建成功→断言失败复现）；前端 sheet 新增「固定额度 0 → 内联报错阻止提交，改正数后正常提交」（改前直接提交成功→断言失败复现）。
- 修复后：`make test-db PKG='./controller'` 全包通过（含既有站点/企业 key 上限、启停、批量用例）；`bunx vitest run src/features/enterprise-console src/features/enterprises` 33 文件 184 用例通过；`bunx tsc -b`、oxlint 干净。
- 既有用例适配：原「编辑到固定额度 0」造耗尽态的夹具改为编辑成正数后直写 DB `remain_quota=0` 模拟用完（现实中耗尽由用量产生），下游「耗尽 key 不能启用 / 批量启用跳过」行为断言不变；正向固定额度用例用完即删，不挤占后续 key 配额计数。

## 遗留

- 运行时「额度耗尽」与「无效令牌」文案区分（观察项 6 另一半）涉上游 `model/token.go` / `middleware/auth.go` 热路径与对外错误契约，跟上游处理，不在本次范围。
- 上游个人令牌 `AddToken`（controller/token.go）存在同样的 0 额度缺口，按「上游保持原样」约定不动，已记录在测试台账。
