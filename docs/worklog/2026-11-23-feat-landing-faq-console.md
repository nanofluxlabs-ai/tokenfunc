# 落地页加回 FAQ（内容共用控制台常见问答）+ 商务微信弹窗收窄

- 日期：2026-11-23
- 分支：main

## 背景
v3 重构（5e67c39d2）删了落地页 FAQ 和企业组织区。黑鹰决定只加回 FAQ，并要求内容在后台维护、增减不发版。

## 变更
- 区块顺序：Hero → 三卖点 → 运行质量 → 接入 → 价目 → **常见问题** → 试用表单。
- 内容来源（`landing/lib/landing-faq.ts` 的 `pickLandingFaq`）：
  - 界面是中文（zhCN / zhTW）且系统设置「常见问答」已开启、非空 → 用后台内容（`/api/status` 的 `faq`，后端无改动）。
  - 其余情况 → `content.ts` 的 `FAQ_ITEMS`（6 条，7 语言）。
- 已知代价（黑鹰已接受）：后台这份内容同时显示在控制台概览「常见问答」面板，售前与使用类问题共用一份列表。
- `faq-section.tsx`：复用 `ui/accordion` 与 `ui/markdown`（与控制台面板一致，答案支持 Markdown）；没有恢复已删的 Section / SectionHeading。
- 默认问答相对旧版：SLA 一条写明「上游模型厂商自身故障不在承诺范围内」；新增专属资源 / 私有部署、员工自查用量（链 `/key-usage`）；迁移一条补专属服务群。承诺项（合同 + DPA、工程师迁移、专属资源池 / 私有部署、7×24 值班、开票）均经黑鹰确认可兑现。
- 商务微信弹窗（`sales-qr-dialog.tsx`）：`max-w-sm` 被通用 Dialog 的 `sm:max-w-2xl` 盖住导致过宽，改 `sm:max-w-sm`（384px）；去掉二维码上方重复的「联系商务」。

## 验证
- `vitest run src/features/landing`：8 files / 28 tests（新增来源选择 3 例、区块渲染与展开 1 例）。
- `bun check -b`、oxlint、oxfmt 通过。
- 本地 5173（后台问答为空）：中文界面显示 6 条内置问答，可展开；弹窗宽 384px、无重复标题。

## 遗留
- 「后台有内容时中文界面显示后台内容」只有单测，未在浏览器里实际填后台验证。
- 同样的 `contentClassName='max-w-sm|md'` 不生效问题还有 4 处未改：上游 `sign-up-form.tsx`、`telegram-login-dialog.tsx`、`user-auth-form.tsx`，二开 `enterprises/leads-admin-page.tsx`。
