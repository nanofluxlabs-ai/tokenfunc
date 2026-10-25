# `/release-standalone` P6 监控改为生产 JSON 访问日志口径

- 日期：2026-10-25
- 分支：chore/release-skill-json-logs
- PR：
- 关键 commit：

## 背景

v2026.10.25.1 发版 P6 第一轮按 skill 里的 `grep '^\[GIN\]'` 统计访问量得到 0：生产 `LOG_FORMAT=json`，访问日志是 `"type":"access"` 的 JSON 行，`[GIN]` 文本行只在本地 `LOG_FORMAT=text` 下存在。当时临时写了 `jq` 聚合补上，skill 需同步。

## 变更

- `.claude/skills/release-standalone/SKILL.md`：服务参数表的「容器访问日志」改为 JSON 字段说明；P6 监控命令改为「落 `/tmp/p6-access.jsonl` → `jq select(.status >= 400)` 按 状态码 / 路径 / 客户端 IP 聚合」，新增非访问类 warn / error 巡检与 `access=0` 不可信的提示；易踩坑表对应行更新。

## 验证

- 把 skill 里的命令块原样抽出、替换 `<SINCE>` 为本次发版起点后对生产机执行：`access=215`（部署后约 20 分钟）、`panic=0`、4 条本机探测 401，与发版时临时命令结果一致，转义无误。

## 遗留

无。
