# 企业档位令牌分组留空改为「自动」：按该用户分组的渠道分组优先级找第一个有该模型的分组

- 日期：2026-11-06
- 分支：main（直接提交）
- PR：
- 关键 commit：cb65afebe

## 背景

v2026.11.06.1 上线分组定价后，黑鹰问：生产企业「多点计算科技」配成用户分组 `ddjs`，分配 gptpro / claudepro 两个渠道分组（倍率 0.5），企业管理员建 key 选「跟随企业分组」，请求会路由到哪个分组？

当时的实现是 `ResolveDefaultUsingGroup`：令牌分组留空 → 固定取该用户分组可用渠道分组里排第一的，**没有按模型跨分组回退**。gptpro / claudepro 两个池模型完全不同，留空的 key 只能用排第一的池，打 Claude 模型直接「无可用渠道」。黑鹰拍板：改成和上游 `auto` 一样的语义，按该用户分组自己的渠道分组优先级自动选第一个有该模型的分组，文案也改成「自动」。

## 变更

- `service/tokenfunc_group.go`：新增 `ResolveUsingGroupCandidates(userGroup)`：用户分组本身是可选渠道分组（default 这类）→ 只返回自己；不是（企业档位）→ 该用户分组可用渠道分组按自己的 `channel_order` 排序全部返回；都没有 → 原样。`ResolveDefaultUsingGroup` 改为取候选第一个，口径不变。
- `middleware/auth.go`：令牌分组留空时候选多于一个 → `ContextKeyUsingGroup = "auto"` 并在 `SetupContextForToken` 之后写 `ContextKeyTokenAutoGroups = 候选`，**完全借用上游 auto 机制**（`CacheGetRandomSatisfiedChannel` 逐分组找渠道、跨分组重试、`ContextKeyAutoGroup` 回写、`service/quota.go` 按实际命中的分组取倍率、WebSocket 续连校验）；候选只有一个时与原来一样直接钉住该分组，不走 auto。
- `controller/model.go`：`/v1/models` 令牌分组留空时 `ownerGroups` = 候选列表，模型列表为并集，与 relay 口径一致。
- `controller/enterprise_tokens.go`：选项接口 `default_group` 改为 `auto_groups`（有序候选），`models_by_group[""]` 为候选并集；创建 / 编辑 key 不选分组时模型白名单按候选并集校验。
- 前端：企业密钥抽屉与列表的「跟随企业分组」改为「自动（按分组优先级）」，下拉项说明显示候选顺序（如 `Claude → GPT`）；`TokenOptions.auto_groups`；用户分组定价表的提示文案补一句「企业档位的令牌分组留空时，按此顺序找第一个有该模型的渠道分组」；旧文案 key 7 语言一起删。

为什么普通用户（用户分组 = 渠道分组）不一起改成 auto：留空令牌自动跨到别的可见分组会让用户在没有选择的情况下按另一个分组的倍率计费，上游语义也是「留空 = 用户分组」；企业档位的候选列表与倍率是管理员为该企业刻意配置的，自动选是预期行为。

上游 auto 的边界照样生效：`MaxTokenAutoGroups`（默认 5）会截断候选，企业分配超过 5 个渠道分组时只取前 5；上游全局「自动分组顺序」（`AutoGroups`）与此无关，企业密钥下拉也不展示上游 `auto`。

## 验证

- `GOWORK=off go build ./...`、`gofmt -l`、`go vet` 三包无输出。
- `go test ./service/ -run TestResolveUsingGroupCandidates`：default 只走自己、`ent_std` 按自己顺序 `[ent_pool gptpro]`、未登记分组按全局顺序、无可见分组原样返回。
- `go test ./middleware/ -run TestTokenAuthEmptyGroupFollowsUserGroupCandidates`：sqlite 夹具，`ddjs` 企业主留空 key → `using_group=auto` + `token_auto_groups=[claudepro gptpro]` 且 `GetRequestAutoGroups` 读到同样顺序；显式选 gptpro 仍钉住；default 用户留空仍为 default。
- `controller/enterprise_console_test.go` 选项接口断言 `auto_groups=["default"]`，`make test-db` 五包回归见本次提交记录。
- 前端 `bun check -b`、`oxfmt --check`、`oxlint`、`vitest run src/features/enterprise-console src/features/users/groups src/i18n`。

## 遗留

- 候选受上游 `MaxTokenAutoGroups`（默认 5）截断，企业分配超过 5 个渠道分组时需调大该上限。
- 留空令牌的日志分组会按上游 auto 口径记录为实际命中的分组，列表筛选「auto」时与上游行为一致。
- 本地未用真实两池企业账号走 relay（本地无 Claude / GPT 双池渠道），生产发版后用多点计算科技的 key 各打一个 GPT 与 Claude 模型验证。
