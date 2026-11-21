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
- 第二版（同日）：黑鹰指出上游的"分组不显示"能力；核实二开没有关掉它，只是把全局 `UserUsableGroups` 基线改成按用户分组显式勾选。据此把 D3 从"没货不建"改为"一次全建、可见性当上架开关"，新增 2.3 节列出各入口对不可见分组的处理，5.2 / 5.7 附录改为 Phase 1 全量建、可见列表只勾三个号池。

- 第三版（同日，v2）：黑鹰确认 `pool_*` 以后会挂与 `default` 不同的高优先账号，并将接入同行资源。D4 从"`default` = `pool_*` 并集"改为号池三档（混合 / 高质量 / 特价，一条渠道只进一档）；新增 D9（分组名回答请求跑在哪、不回答谁卖的，同行资源按真实上游平台进既有分组，供应商名只写渠道名）与 D10（自部署开源权重单独建 `selfhost_*`，接入前过模型自检）；号池 label 改为 `【订阅】<模型族> <档位>号池`；第 4 节挂载规则重写并写明过渡期；5.10 记录生产 label 调整：同日已执行（注册表 + 重提 default / ddjs 定价表重写快照，分两轮、每轮等三副本同步）；执行中发现统一保存按本副本内存整表写回会跨副本互相覆盖，记入第 7 节遗留。

- 第四版（2026-11-21，v3）：黑鹰指出 D4"一条渠道只进一档"不对——分组是渠道的能力标签同时也是价签，一条渠道挂多个分组是正常的容量共享（tokensolo `awsb claudeboy.vip 2.4x` 同时挂 4 组）。核对 `model/ability.go`：挂载即 (分组, 模型, 渠道) 行，分组可用模型 = 组内渠道模型清单并集，优先级全组共用、无按组裁模型能力。D4 改为"可多挂、逐组核价"，第 4 节改写为两条提醒（别挂进比成本便宜的组；便宜组挂贵渠道会把贵模型按便宜价卖，介意就复制渠道行裁模型清单），过渡期 7 条号池渠道双挂改为合规现状。同时新增 3.3 `internal`（团队内部：可见全部 11 个分组、自营池排前、基准 1.0、auto 候选被 `MaxTokenAutoGroups=5` 截到五个自营池是预期）与 3.4 `beta`（好友测试：只可见 `default`、基准 1.0、免费靠赠额度、注册后管理员改组）；两组不写低倍率的原因是账单价格要真实、内部消耗要能折算成本。第 7 节补按用户分组限速依赖全局开关的提醒。生产建组记录见下方"生产执行"。

## 验证

- 文档内 21 个分组 key 全部匹配 `^[a-z0-9][a-z0-9_-]{0,63}$`。
- 5 段 JSON 附录 `jq` 可解析；迁移后 `GroupRatio` 与注册表 key 集合一致。
- 可见性链路复核：`service/group.go` 的 `GetUserUsableGroups` / `IsUserSelectableGroup`、`service/tokenfunc_group.go` 的 `ListUserSelectableChannelGroups`、`controller/pricing.go` 的 `usable_group` 过滤、`controller/tokenfunc_group.go` 的 `/channel` 用全量 `ListChannelGroups`，渠道抽屉 `channel-mutate-drawer.tsx` 走 `use-group-options`。
- 引用的代码位置复核存在：`service/tokenfunc_group.go` 的 `ResolveUsingGroupCandidates`、`router/channel-router.go` 的 `POST /fix`、`router/tokenfunc-group-router.go` 的 `PUT /settings`、`setting/auto_group.go` 的 `DefaultMaxTokenAutoGroups = 5`、落地页 / 登录页 / 关于页的英文源文案。
- 第 5 节全部 SELECT 与 UPDATE 在本地 `dev` schema 跑过一遍（UPDATE 在事务内回滚），语法通过。

## 遗留

- 生产迁移（第 5 节）已于当日执行（见文档 5.9）；v2 的号池 label 调整（5.10）已执行；`SaveGroupSettings` 多副本整表覆盖问题待修（代码项）。
- 落地页"官 Key 直连 / 无逆向接口"文案改动（第 6 节）未做，应在号池对个人用户开放前完成。
- `ChannelGroupMeta` 缺 description 字段、报价单内置分组命名对齐，列为 Phase 2 代码项。
- 生产执行（2026-11-21，黑鹰授权）：`internal` / `beta` 两个用户分组已按 3.3 / 3.4 建好（文档 5.12），成员改组与赠额度待黑鹰在用户管理页人工完成；5.11 自动分组三项 option 同日已改。
