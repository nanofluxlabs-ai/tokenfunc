# 修复企业账单登记收款无法足额结算 3 位小数账单

- 日期：2026-11-01
- 分支：fix-bill-payment-precision
- PR：（待建）
- 关键 commit：（待填）

## 背景

上线前测试（老田，企业管理/财务模块）发现：账单 TF-202611-000004（24,000 quota = $0.048）在「登记收款」弹窗里按默认金额提交报「收款金额超过未付金额」，且手输精确值也无法提交。quota 折算美元（quota ÷ 500,000）经常产生 3 位以上小数，生产会复现，不是测试数据特例。

## 变更

仅前端：

- `web/src/features/enterprise-console/lib/bill-utils.ts`：新增共享格式化 `formatBillUsd`（后端 decimal 最多 6 位小数，去掉多余尾零但至少保留 2 位：0.048 → "0.048"，6 → "6.00"；toFixed(6) 同时吸收浮点减法噪声）；
- `bill-payment-dialog.tsx`（登记收款弹窗，功能修复）：未付金额折回 6 位小数再比较；金额预填与 zod 上限统一使用精确值（原预填 `toFixed(2)` 进位，比校验上限大，默认值必被拒）；副标题用 `formatBillUsd`；金额输入框 `step` 0.01 → any（原先被浏览器原生 step 校验拦住，3 位以上小数提交不了）；
- `bills-table.tsx`（企业端账单表 + 管理端财务中心企业账单共用）：账单总额、账期已用/额度 USD 展示改用 `formatBillUsd`；
- `bill-detail-metrics.tsx`（账单详情汇总卡）：总额/已付/未付/授信额度同口径；
- `adjustment-dialog.tsx`（账单调整弹窗）：未付金额与新总额预览同口径。

测试：新增 `__tests__/bill-payment-dialog.test.tsx`（5 例）与 `lib/__tests__/bill-utils.test.ts`（5 例）；`bill-detail-metrics.test.tsx` 原断言锁定的是舍入错误（3.456789 → "3.46"），改为断言精确值。

## Bug 根因

三层叠加：① 副标题与预填金额用 `toFixed(2)` 进位（0.048 → 0.05）；② zod 校验按精确未付金额比较（0.05 > 0.048 必拒）；③ 输入框 `step='0.01'` 且表单未加 `noValidate`，手输 0.048 被浏览器原生校验拦截。触发条件：未付金额小数点后第 3 位 ≥5 的任意账单（部分付款后的余额同理）。影响范围：所有信用账单的 UI 收款登记；后端 API（decimal 精确比较）不受影响。

## 验证

- `bunx vitest run src/features/enterprises/components/__tests__/bill-payment-dialog.test.tsx`：修复前 4 失败 1 通过（复现），修复后 5/5 通过；
- `bunx vitest run src/features/enterprises src/features/enterprise-console src/features/finance`：56 文件 257 用例全过（含新增 10 例与更新的 metrics 断言）；
- `bunx tsc -b` 无错误（本机 bun 1.4.2 无 `bun check` 子命令，用 tsc -b 等价替代）；`oxlint` 改动文件零问题；
- 手工验证：本地 dev 环境 $0.048 未付账单 TF-202611-000006，UI 弹窗副标题显示 USD 0.048、预填 0.048、提交成功结清（paid_usd 0.048/0.048，ent_ledger bill_issued/bill_payment 各 24,000 对平）；账单列表与账单详情同口径显示 $0.048。

## 遗留

账单调整弹窗的金额输入框 `step` 仍为 0.01（调整额通常为整数分，后端本身接受 6 位小数；如确有按非整分调整的需求再放开）。
