# 修复手机上文档页标题被顶部菜单挡住

- 日期：2026-10-30
- 分支：main（黑鹰选择直接在 main 修改）
- PR：
- 关键 commit：

## 背景

黑鹰在 iPhone 18 Pro 的 Chrome 上打开「Gemini 原生接口」页，页面一打开，标题和摘要就被浮动顶栏和吸顶的「文档目录」入口压住了。截图里页面已经往下滚了大约 100px。

## Bug 根因

1. **从手机目录切页后，新页面停在旧页面的滚动位置**（主因，只在 iOS 出现）
   - 打开手机目录抽屉（Sheet）时，Base UI 会锁定页面滚动。在 iOS 上，它的锁定方式是给 `<html>` 设 `overflow: hidden`（`@base-ui/utils/useScrollLock` 中 `platform.os.ios` 走 overlay 分支）。
   - 在抽屉里点链接后，路由立即切页，并调用 scrollTo 把页面滚回顶部。但这时抽屉还没关，滚动仍处于锁定状态，iOS WebKit 会忽略这次 scrollTo。
   - 抽屉关闭、解锁后，新页面仍停在旧页面的滚动位置，标题因此落在顶栏后面。
   - 桌面 Chrome 在锁定期间 scrollTo 照样生效，所以用 402px 宽的 iframe 无法复现。
2. **浮动顶栏和吸顶入口之间有一条缝**
   - 顶栏是半透明的浮动胶囊，高 0–60px；吸顶入口从 64px 开始。滚动时，正文会从两者之间的缝里露出来。
3. **手机上锚点跳转的位置偏高**
   - 标题的 `scroll-margin-top` 是 6rem（96px），而手机上顶栏加吸顶入口一共约 113px，跳转后标题会被压住一截。

## 变更

- `docs-layout.tsx`：
  - 通过手机目录切页时记一个标记。等 Sheet 的 `onOpenChangeComplete(false)` 触发（抽屉完全关闭、滚动已解锁）后，再调用 `window.scrollTo({ top: 0 })`。
  - 只是关闭抽屉、没有切页时，不改变滚动位置。
- 吸顶入口改为 `sticky top-0 -mt-16 pt-[4.5rem]`：吸顶时底色从视口最顶端开始铺，补上那条缝；未吸顶时用负边距抵消，位置与原来一致。
- `tokenfunc-docs.css`：屏幕宽度小于 lg 时，h2、h3 的 `scroll-margin-top` 改为 7.5rem。

## 验证

- 新增 `__tests__/docs-layout.test.tsx`，包含 2 个用例：
  - 在抽屉里切页，抽屉关闭后会调用 `scrollTo({ top: 0 })`。
  - 只关闭抽屉、不切页时，不调用 `scrollTo`。
  - 反向验证：去掉修复后，第一个用例失败；恢复修复后通过。
- `bunx vitest run src/features/docs`：13 个文件、135 个用例全部通过。`bunx tsc -b` 通过（先在主 checkout 补跑了 `bun install`，此前这里的 node_modules 缺少 #73 新增的 Scalar 依赖），lint 无 error。
- 本地构建，在 402px 宽的 iframe 里检查：
  - 页面在顶部时，标题位于 162px，与改动前一致。
  - 滚动后，吸顶入口的底色从 0 开始，按钮位于 72px，与改动前一致；顶栏和入口之间不再露出正文。

## 遗留

- iOS 抽屉解锁的问题无法在桌面浏览器复现，修复是否生效还需要发版后在 iPhone 上实际确认。
