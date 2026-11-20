# 渠道分组 description 字段：后台配置，令牌下拉 / 模型广场 / 企业密钥页展示

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

渠道分组只有 30 字以内的 label，用途限制（可蒸 / 不可蒸、账号档位）塞不下，客户选分组时看不出区别（`docs/tokenfunc/channel-groups.md` 第 7 节遗留、Phase 2 第 1 项）。

## 变更

- 后端
  - `setting/tokenfunc_group_registry.go`：`ChannelGroupMeta` 加 `Description`，`ChannelGroupEntry` 透出；新增 `NormalizeChannelGroupMeta`（去空格、按字符数限 200）与 `ChannelGroupDescription(key)`。
  - `service/tokenfunc_group.go`：`ChannelGroupOption` 带 description；统一保存解析注册表时逐项规范化，超长返回 `ErrGroupSettingInvalid`，落库的是规范化后的值。
  - `controller/tokenfunc_group.go`：`GET /api/tokenfunc/groups/channel`、`GET /api/tokenfunc/groups/self` 带 `description`；`controller/enterprise_tokens.go` 企业控制台令牌选项带 `description`；`controller/pricing.go` `GET /api/pricing` 新增顶层 `group_descriptions`（只含可见且非空的）。
- 前端（`web/src`）
  - 系统设置 › 渠道分组编辑器：行加「Description」文本框（maxLength 200），注册表写回固定 `{label, order, description}`。
  - 令牌抽屉、游乐场、企业控制台令牌抽屉：下拉项名称下方显示 description，没填回退显示 key（沿用原行为）。
  - 模型广场：侧栏分组 chip 的 title 带描述；详情抽屉分档表头与分组单元格下方显示描述。
  - `lib/tokenfunc-groups.ts`、`hooks/use-group-options.ts`、`features/enterprise-console/types.ts` 类型同步；新增 i18n key 1 条，7 语译文。

## 验证

- `make test-db PKG='-count=1 ./service/ ./setting/'`：通过；新增 `TestSaveGroupSettingsPersistsChannelGroupDescription`（去空格落库、超长拒绝且内存不变、用户侧下拉带描述）与 `TestNormalizeChannelGroupMetaTrimsAndLimitsDescription`。
- `make test-db PKG='-count=1 ./model/ ./controller/'`：通过。
- 前端 `bun run typecheck` 无错；`bun run test -- channel-groups keys pricing hooks playground enterprise-console` 全部通过；改动文件 oxlint 无 error。
- 数据兼容：旧注册表 JSON 没有 description 字段，反序列化为空串，无需迁移。

## 遗留

- 模型广场 `usable_group` 的前端类型 `{desc, ratio}` 与后端 `map[string]string` 不一致，上游既有问题，未改。
