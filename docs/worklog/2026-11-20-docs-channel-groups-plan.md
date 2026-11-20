# 渠道分组与定价倍率规划文档

- 日期：2026-11-20
- 分支：main
- PR：
- 关键 commit：

## 背景

分组定价功能（PR #76）上线后，生产只有 `default` / `gptpro` / `claudepro` 三个渠道分组，且已经开始混挂（glm 在 gptpro、kimi 在 claudepro）。接下来要接入 AWS Bedrock Claude（可蒸 / 不可蒸、含 / 不含 Fable 5）、Azure GPT、Vertex Gemini 等多种来源，需要先定下命名规范、分组总表、基准倍率和用户分组矩阵，避免重蹈 tokensolo 的坑：35+ 渠道分组命名混杂、按客户和价格建渠道分组、default 池混挂 51 条渠道、空分组误导客户、按模型代际命名过期。

## 变更

- 新增 `docs/tokenfunc/channel-groups.md`：8 条决策、命名字典（platform / family / qualifier）、Phase 1 / Phase 2 渠道分组总表与基准倍率（沿用 tokensolo `default` 等级数值）、成本参考、用户分组矩阵、渠道挂载规则、`gptpro → pool_gpt` / `claudepro → pool_claude` / 拆出 `pool_cn` 的迁移步骤与校验 SQL、可直接贴后台的 option JSON、落地页文案改动清单。
- 不改代码，不改生产配置。

## 验证

- 文档内 21 个分组 key 全部匹配 `^[a-z0-9][a-z0-9_-]{0,63}$`。
- 5 段 JSON 附录 `jq` 可解析；迁移后 `GroupRatio` 与注册表 key 集合一致。
- 引用的代码位置复核存在：`service/tokenfunc_group.go` 的 `ResolveUsingGroupCandidates`、`router/channel-router.go` 的 `POST /fix`、`router/tokenfunc-group-router.go` 的 `PUT /settings`、`setting/auto_group.go` 的 `DefaultMaxTokenAutoGroups = 5`、落地页 / 登录页 / 关于页的英文源文案。
- 第 5 节全部 SELECT 与 UPDATE 在本地 `dev` schema 跑过一遍（UPDATE 在事务内回滚），语法通过。

## 遗留

- 生产迁移（第 5 节）未执行，等黑鹰安排。
- 落地页"官 Key 直连 / 无逆向接口"文案改动（第 6 节）未做，应在号池对个人用户开放前完成。
- `ChannelGroupMeta` 缺 description 字段、报价单内置分组命名对齐，列为 Phase 2 代码项。
