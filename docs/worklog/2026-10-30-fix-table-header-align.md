# 修复数字列表头被 meta.label 覆盖导致与数据不对齐

- 日期：2026-10-30
- 分支：main
- PR：
- 关键 commit：

## 背景

财务中心「用户消耗」「模型消耗」两个 tab 的数字列（余额、当期消耗、请求数、金额、Tokens）数据右对齐，表头却靠左，看起来错位。

## 变更

- 前端共享表头 `components/data-table/core/data-table-header.tsx`：列写了自定义 `header` 函数时原样渲染；`meta.label` 只在列使用 TanStack 默认 header 时兜底。
- 新增回归测试 `components/data-table/core/__tests__/header.test.tsx`。

## Bug 根因

`renderHeaderContent` 先判断 `meta.label`，有就直接渲染一个普通表头，跳过了列里自定义的右对齐 header 函数（与其注释描述的意图相反）。凡是「自定义 header + meta.label」的列都受影响：财务中心用户消耗 / 模型消耗、推广中心用户与模型列表、渠道用量。该文件为上游代码，同步上游时注意此处改动。

## 验证

- 先写测试复现：`bunx vitest run src/components/data-table/core/__tests__/header.test.tsx` 修复前 1 失败，修复后 2 通过。
- `bunx vitest run src/components/data-table src/features/finance src/features/promoter-center src/features/channel-usage`：34 文件 117 用例通过。
- `bun check -b` 无类型错误；`bun run lint` 改动文件无 error。
- 用户在浏览器中确认两个 tab 表头与数据已对齐。

## 遗留

可排序列（模型消耗）的表头是带排序图标的按钮，右对齐后文字与数据右边缘会差一个图标宽度，与推广中心现有表现一致。
