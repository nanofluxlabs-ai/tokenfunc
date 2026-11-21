# 游乐场模型选择器的分组徽章溢出盖住「发送」按钮

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

渠道分组改成「【订阅】Claude · GPT · 国产 混合号池」这类全名后，黑鹰发现游乐场输入框右下角的模型选择器里，分组徽章文字横向溢出，盖到右侧「发送」按钮上。

## Bug 根因

`components/model-group-selector.tsx` 紧凑触发器里的分组徽章是 `inline-flex max-w-20 shrink-0`，只限宽没有截断：`text-overflow: ellipsis` 对 flex 容器不生效，超出 5rem 的文字直接可见溢出；触发器本身 `max-w-[15rem]`，溢出部分就压到相邻的发送按钮上。短分组名（`default`、`vip`）时看不出来。

## 变更

- 徽章改为 `inline-block max-w-24 truncate`，加 `title` 放完整分组名供 hover 查看；模型名 `truncate` 与触发器 `max-w-[15rem]` 不变。

## 验证

- 新增 `components/model-group-selector/__tests__/trigger.test.tsx`：长分组名渲染后徽章带 `max-w-24 truncate sm:inline-block`、不再是 `inline-flex`、`title` 为完整名，触发器仍限宽；`bun run test -- src/components/model-group-selector` 7 通过。
- `bun check -b` 无类型错误；oxlint 两个文件无 error。

## 遗留

- 无。
