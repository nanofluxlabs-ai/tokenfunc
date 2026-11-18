# TKE 业务日志接入 CLS，ingress 访问日志改为 JSON

- 日期：2026-11-18
- 分支：main
- PR：
- 关键 commit：

## 背景

客户反馈缓存命中率低、请求 400 / 5xx 时，需要结合各服务日志定位原因。集群之前只开了审计日志。tokensolo 是全集群一个主题、只建全文索引，按字段查询恒为 0 命中，也做不了统计。这次改为每个服务一个主题，JSON 日志按字段建索引。

## 变更

- 新增 `deploy/k8s/manifests/logging/logconfigs.yaml`：5 条 LogConfig，分别采集 tokenfunc-api、sub2api、codex2api、crs、ingress-nginx 的容器标准输出，写入 CLS 日志集 tokenfunc-prod（东京）。
  - JSON 日志用 `json_log`，解析失败的行（panic、标准库 log、nginx error log）写入 `LogParseFailure`，不丢弃。
  - codex2api 是纯文本日志，用 `minimalist_log`。
- ingress-nginx 访问日志改为 JSON（`ingress-nginx-values.yaml` 的 `log-format-upstream` + `log-format-escape-json`）。
  - 原来的 `--set` 方式会被 JSON 里的逗号拆坏，所以从 `install-ingress.sh` 挪进了 values 文件。
- 主题、索引不在仓库里，由 tccli 创建。字段表和常用查询见工作区根仓库 `docs/runbooks/cls-logging.md`。

## 验证

- `kubectl apply --dry-run=server` 发现 `extractRule` 字段名写错，正确的是 `unMatchUpload` / `unMatchedKey`；修正后 5 条 LogConfig 都是 Synced。
- 带 `CLB_ID=lb-0jtbqlvy` 重跑 `install-ingress.sh`：ingress 仍绑定原 CLB，tokenfunc.com 正常返回 200，访问日志已是 JSON。
- tccli SearchLog 实测：
  - `level:"error"`、`status_code:200`、`request_id` 精确检索都有结果。
  - SQL 按 status、upstream 分组统计正常。
  - codex2api 全文检索正常。

## 遗留

- 主题保留期要改为 7 天，但 ModifyTopic 一直报「storage migration / billing mode update task in process」，目前仍是 30 天，需要在控制台重试。
- 网关不向上游透传 request_id，跨服务串联只能按时间和模型对齐；网关的消费明细（token、缓存）只在 `msg` 文本里。两项都需要单独改代码。
