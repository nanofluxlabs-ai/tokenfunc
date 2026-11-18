# 网关 request_id 透传给上游，消费日志输出结构化 consume 事件

- 日期：2026-11-18
- 分支：main
- PR：
- 关键 commit：740202f0c

## 背景

客户常反馈某个请求缓存命中率低、400/5xx，需要在 CLS 里把网关和号池（sub2api / codex2api / crs）的日志串起来。之前有两个问题：
- 网关不把自己的 request_id 带给上游，号池日志里的 ID 和网关对不上，只能按时间、模型、渠道去对齐。
- 消费明细（prompt / completion / cache tokens、channel_id）只在 `record consume log` 的 msg 文本里，CLS 没法按字段统计缓存命中率。

## 变更

- `relay/channel/api_request.go`：在所有 HTTP 上游请求的统一出口 `doRequest` 和 WebSocket 出口 `DoWssRequest` 中，写入 `X-TokenFunc-Request-Id` 和 `X-Request-ID`，值都是网关 request_id。
  - 写入时机在渠道 header 覆盖之后，客户端经 passthrough 带来的同名头盖不掉它。
  - 按用户决定发给所有上游，不区分集群内外。
  - 各号池读取的头：crs 读 `X-TokenFunc-Request-Id`，sub2api 和 codex2api 读 `X-Request-ID`。
- `model/tokenfunc_consume_log_event.go`（新）：JSON 日志模式下，消费日志改为输出一行 `event=consume` 结构化事件。
  - 字段：user_id、token_id、channel_id、model、upstream_model、group、is_stream、prompt_tokens、completion_tokens、cache_tokens、cache_write_tokens、usage_semantic、frt_ms、quota_consumed、use_time_seconds、reasoning_effort、upstream_request_id。
  - 不带 content，也不带 admin / root 信息。
  - text 模式仍是上游原来的那行文本。
  - `model/log.go` 只改了分支调用，尽量减少与上游合并时的冲突。
- `logger/events.go`：新增 `EventConsume` 和对应的字段常量。
- `deploy/k8s/manifests/logging/logconfigs.yaml`：codex2api 的 LogConfig 从 `minimalist_log` 改为 `json_log`，配合 codex2api 新增的 `CODEX_LOG_FORMAT=json`。
- CLS 索引和排查手册在工作区根仓库：`docs/runbooks/cls/indexes.py` 和 `docs/runbooks/cls-logging.md`。

## 验证

- `go test ./relay/channel/ -count=1`：ok。
  - 新增用例 `TestDoRequestForwardsGatewayRequestID`。把 api_request.go 换回 HEAD 版本时，该用例 FAIL，说明它确实覆盖了这次的修复。
- `go test ./model/ -run 'TestLogConsumeEvent|TestLogOther' -count=1`：ok。
  - 断言缓存读写、usage_semantic 和上游 ID 都是顶层字段。
  - 断言 content 与 admin_info 不会出现在日志里。
- `go build ./...`：ok。`go vet ./model/ ./logger/ ./relay/channel/`：ok。
- `go test ./logger/ ./model/ ./relay/... ./service/ ./middleware/`：只有 `relay/channel/advancedcustom` 的 `TestAdaptorMasksDialedHostsInDialFailure/channel_proxy_host` 失败。
  - 在干净的 main（`git stash -u`）上同样失败，与本次改动无关。
  - 原因：本机 VPN 的 fake-ip 把 `egress.private.invalid` 解析成了 198.18.x。
- `kubectl apply --dry-run=server -f deploy/k8s/manifests/logging/logconfigs.yaml`：通过。

## 遗留

- 要发版后才生效。
  - LogConfig 和 CLS 索引需要在集群和 CLS 上分别执行 apply 和 `indexes.py`。
  - codex2api 的 JSON 日志要等 codex2api 发版带上 `CODEX_LOG_FORMAT=json` 才生效。在那之前，json_log 采集到的纯文本行会进 `LogParseFailure`，全文检索仍然可用。
- 发版后需要到 CLS 实测以下两点：
  - crs 的 `upstream_request_id` 是否为顶层字段（winston meta 合并方式未实测）。
  - 手册里命中率 SQL 的分母是否正确。
- `X-Request-ID` 也会发给官方 API 和第三方供应商。这是用户的选择，对方能看到网关的 request_id。
