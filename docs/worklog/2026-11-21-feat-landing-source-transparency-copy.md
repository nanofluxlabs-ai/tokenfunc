# 落地页 / 登录页 / 关于页文案改为「来源逐组标注」

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

渠道分组规划（`docs/tokenfunc/channel-groups.md` D7、第 6 节）把订阅号池对全部用户开放，落地页仍写"OFFICIAL · 官方直连 / 官 Key 直连、无逆向接口"，与实际供应方式冲突，必须在号池对个人开放前改掉。

## 变更

- `web/src/features/landing/content.ts`：fidelity 卡 description 与第 1 条 point 改为"每个渠道分组都标明上游来源（厂商 API / 云平台 / 订阅号池）…" / "来源透明标注，无静默替换"。
- `web/src/features/landing/components/hero.tsx`：顶部徽标与主文案去掉 OFFICIAL / 官方直连，改为"厂商 API · 云平台 · 订阅号池，来源逐组标注"。
- `web/src/features/about/components/brand-about.tsx`：与 hero 同一句主文案。
- `web/src/features/auth/auth-layout.tsx`：登录页统计 "Official pool" → "Subscription pool"，注册页第 1 条卖点与登录页副标题改为来源透明口径。
- `web/src/i18n/locales/tokenfunc/{en,zh,zh-TW,fr,ru,ja,vi}.json`：7 个 key 改名并补齐 7 种语言译文，`bun run i18n:sync` 通过。
- 保留不动："500+ 官方订阅号池"、"美元计价，与上游官方价同步"、故障切换演示里的 "Official · primary pool" 等（订阅号本身是官方订阅）。

## 验证

- `bun run typecheck`：无类型错误。
- `bun run test -- src/features/auth src/features/landing`：99 个用例通过。
- `bun run lint`：本次改动文件无 error；仓库现有 error 在 `scripts/sync-i18n.mjs:235`（eslint curly），不在本次改动范围。
- `rg -i official web/src/features/{landing,auth,about}`：剩余命中只有有意保留的订阅号池 / 官方价 / 公众号文案。

## 遗留

- `setting/quote_setting/config.go` 报价单内置分组仍写"Claude 官方满血版 / 第三方反代版"，Phase 2 对齐分组命名。
- 未使用的 i18n key "Official direct access to Claude · GPT · Gemini · Grok through one endpoint." 未删，待清理无引用 key 时一并处理。
