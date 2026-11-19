# 同步上游 new-api v1.0.0-rc.51（基线 rc.47）

- 日期：2026-11-19
- 分支：sync/upstream-v1.0.0-rc.51
- PR：#77
- 关键 commit：1a193ef0f（merge）、81f05eab9（适配）、29cac5fcf（评估脚本）

## 背景

距上次同步 26 天、累积 rc.48 ~ rc.51 四个 rc。rc.51 含 3 个安全修复（zstd 解压炸弹、MaskSensitiveInfo 二次复杂度、vchart tooltip XSS）、计费口径修复（prompt_tokens_details 里的 cache_creation_input_tokens 按缓存写入价计，此前按普通输入价）、Redis 鉴权缓存自愈，以及插件体系大改（提供商插件 / 请求插件 / 市场 / 节点同步表）和 JSON 底层换 moego。

## 变更

- 合并 79 个上游 commit，解 28 个文件冲突：
  - 日志：上游把访问日志 / panic recovery 改为经 `common.LogWriter` / `ErrorLogWriter` 写当前文件。我方自定义访问日志（text / JSON 两种）保留，改为处理完再取 path / query，与上游测试语义一致；`PanicRecover` 保留 JSON 分支走 `LogPanic`；删除我方重复的 `dynamicLogWriter`，调用点改用上游变量。
  - `RecordRelayErrorLog` 被上游抽出，我方外部渠道健康分类留在 `ProcessChannelError`，`AppendLogClientInfo` 接进新函数。
  - `BatchInsertChannels` 取上游 `slices.Chunk`（子切片共享底层数组，主键自然写回），删掉我方的手工写回。
  - moejs 模块改名 `MoeForge/moejs`：Dockerfile、release / electron 工作流、`scripts/tokenfunc/tke-local-image.sh` 的 PGO 路径同步。
  - 侧栏：上游新增「插件」「请求处理」两项，按二开结构放进「运维中心」分组。
- 二开适配：插件路由保留命名空间加入二开控制台页与 `/docs`（`pkg/jsplugin/routing_tokenfunc.go`），否则插件路由可抢占这些页面；`ReloadChannelHealthStates` 在 DB 未初始化时返回。
- 修 `scripts/tokenfunc/upstream-diff.sh`：`git log | head -1` 在 pipefail 下 SIGPIPE 退出 141。

## 验证

- `go build ./... && go vet ./...`；relaykit / tokenkit `GOWORK=off go build ./...`：通过
- `make test`：首轮 3 个失败（访问日志 ?key=、保留命名空间、健康态空指针）已修；复跑仅 `TestTaskMediaResponseHeaderTimeoutDoesNotTruncateBody` 因与前端测试并发负载超时，单独跑 3/3 通过
- `make test-db`：全部通过（53 个包 ok）
- 前端 `bun run typecheck` 通过；`bun run test` 3621/3623，2 个 20s 超时用例单独跑通过；`bun run i18n:sync` 后 locale 无 diff、`_extras` 为空
- 迁移幂等：`make api TF_API_PORT=3003` 后 `DEBUG=true` 再启，`ALTER TABLE` 0 行、SQL 1524 行；启动日志 `tokenfunc v0.0.0 已启动`
- 冒烟（:3003）：`/api/status` theme=tokenfunc；企业列表、报价配置、分组、授信账期、财务总览 / 导出 CSV、手工充值参数校验、请求插件实例、节点同步 `/api/system-info/sync` 均正常；本地 mock 上游走 `/v1/chat/completions` 流式 + 非流式，消费日志 12+5 token、quota 7
- 敏感词旧 option 已被迁移删除

## 遗留

- rc.51 之后 main 上的 3a407cc9b（已删除用户的 key 返回 401）、1c63cc8c9（请求侧错误不再禁用渠道）、请求插件作用域修复，等 rc.52 再合
- moego 为 alpha 版本，上线后关注 relay 错误率与 CPU
- 本机磁盘 96.7% 会触发上游系统过载保护（阈值 95%），本地 relay 验证需临时关 `performance_setting.monitor_enabled`
- 插件市场默认指向 www.newapi.ai / newapi.pro（仅超管可见），白标是否要改市场源待定
