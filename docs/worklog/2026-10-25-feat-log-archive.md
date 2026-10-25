# logs 表 90 天保留 + 归档到 S3 兼容对象存储（腾讯云 COS）

- 日期：2026-10-25
- 分支：feat/log-archive
- PR：
- 关键 commit：ba11ea300（后端）、ee30d5e4c（前端）

## 背景

黑鹰拍板：logs 只在 PG 保留 90 天，更早的按天归档到腾讯云 COS（东京，S3 兼容接口）长期保存，并要一个只读「归档清单」页。前置 PR #32 的预聚合表保证被删掉的天在财务中心 / 推广中心的基础列上不缺数。设计参考 tokensolo 的保留任务，按 tokenfunc 重写。

## 变更

- `pkg/objectstore`：aws-sdk-go-v2 S3 客户端薄封装（Put / Head / Get / Key），关闭 SDK 默认 CRC 校验头以兼容 COS；新增依赖 `aws-sdk-go-v2/service/s3`（smithy-go 随之升级）。
- 配置：`common/tokenfunc_constants.go` + `common/init.go` 接 `DB_LOG_RETENTION_DAYS`（默认 0 = 禁用）、`DB_LOG_RETENTION_RUN_AT`（03:00）、`DB_LOG_RETENTION_MAX_DAYS_PER_RUN`（30）、`DB_LOG_RETENTION_BATCH_LIMIT`（2000）、`DB_LOG_RETENTION_BATCH_PAUSE_MS`（200）、`LOG_ARCHIVE_S3_{ENDPOINT,REGION,BUCKET,PREFIX,ACCESS_KEY,SECRET_KEY,PATH_STYLE}`。与文件日志的 `LOG_RETENTION_DAYS` 刻意分名。
- 迁移：`tf_log_archive_manifests`（day 主键；状态 pending → verified → purged；行数 / id 区间 / quota 合计 / 对象 key / 大小 / sha256 / schema_version / 错误 / 删除行数）。
- 后端 model（`model/tokenfunc_log_archive.go`）：清单 CRUD 与概览；`LogArchiveFilter` 下的全列游标导出（SELECT *，列集合跟随表结构）、复核计数、按 id 分批删除；进行中授信账期的企业主账号查询（护栏）。
- 后端 service：`log_archive_store.go`（临时文件 gzip + sha256/md5，上传后核对大小与 ETag；CSV 首行列名）；`log_retention_task.go`（每分钟 tick，到 `RUN_AT` 后当天只跑一次，用 options 键 `tf_log_retention_last_run` 记录，多副本 + Redis 锁；每轮从最早可归档天到截止日逐天「导出 → 上传校验 → 复核行数 → 分批删除 → 清单 purged」，预算 3 小时）。四条红线：对象存储未配置拒绝删除；只删 ≤ 预聚合游标的天；永不删充值 / 管理员调额 / 退款；进行中授信账期的企业主账号从账期起点前一天起延后删除。保留期地板 30 天。失败只记 pending + last_error 并给 root 发通知（24h 去重），次日重试。
- 后端接口（Root）：`GET /api/admin/log-archive/status`（配置 / 游标 / 截止日 / 最近一轮结果 + 清单概览）、`GET /api/admin/log-archive/manifests`、`POST /api/admin/log-archive/manifests/:day/retry`（同样受保留期 / 游标 / 护栏约束，不能提前清理）；访问令牌作用域 `ops:read` / `ops:write`；审计 `log_archive.retry`。
- 前端：`features/log-archive` + 路由 `/log-archive`（仅 Root）+ 运维中心菜单「日志归档」。四张状态卡、待处理 / 行数不一致告警条、按天清单（状态徽标 / 行数 / 对象 key 可复制 / 大小 / 已删行 / 错误 / 更新时间 / 重试）、确认后重试。
- 发现并记录的既有问题：`SectionPageLayout` 只渲染 Title / Actions / Content 三个槽位，其它子节点被丢弃；本页弹窗放在布局外层。已合并的推广中心页「用户下钻 Sheet」也放在槽位外，从未打开过，另开 hotfix 修。
- i18n：35 个新 key 七种语言全部手写译文。

## 验证

- `GOWORK=off go build ./... && go vet ./pkg/... ./model/ ./service/ ./controller/ ./router/ ./middleware/`：通过；`go test ./router/ ./middleware/`：ok（路由作用域覆盖）。
- `make test-db PKG='-count=1 ./model/ ./service/ ./controller/'`：model 17.9s / service 6.0s / controller 62.9s 全部 ok。新增 `service/log_retention_task_test.go`（内存对象存储替身）：游标为空拒绝删除、游标之后的天不动、受保护类型与未到期的天保留、CSV 可解压解析且行数 / quota 合计与清单一致、预聚合仍给出被删天的消耗、重跑不重复归档、上传失败不删且 pending + last_error、重试在保留期内 / 未预聚合时拒绝、恢复后成功、授信账期护栏、tick 门控（禁用 / 未到点 / 当天只跑一次）、保留期地板与 RUN_AT 解析、未配置对象存储拒绝。
- 前端：`bun run typecheck`、oxlint 新文件 0 error、`bunx vitest run src/features/log-archive` 2 用例通过（状态卡 / 告警 / 清单行；重试只对非 purged 行提供且确认后调接口）；全量 `bun run test` 与 `i18n:sync` 见 PR。
- 迁移幂等：两次启动，第二次 `ALTER TABLE` 为 0（SQL 行 1398，panic 0）；未开启时启动日志 `retention_days=0 ... store_configured=true`，清单表 0 行、options 无 `tf_log_retention_*`，只空转。
- COS 真实桶探测（aws cli，用 `.env` 子账号）：`HeadBucket` / `PutObject` 返回 NoSuchBucket，`.env` 的 `LOG_ARCHIVE_S3_BUCKET` 缺腾讯云要求的 `-APPID` 后缀，待黑鹰改后再做一次真实上传 / 回读验证。

## 遗留

- 真实 COS 端到端验证待桶名修正；生产 `.env` 需补 `DB_LOG_RETENTION_DAYS=90` 与 `LOG_ARCHIVE_S3_*`。
- 没有从 COS 回放导入的工具；账单快照存 OSS 为 PR-4。
- 归档后财务中心用户消耗的 token / 钱包订阅拆分列与模型消费（渠道维度）对已删天为空（#34 已说明）；个人对账的消费明细同样只到保留期内。
