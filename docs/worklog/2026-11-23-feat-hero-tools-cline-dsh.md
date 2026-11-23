# Hero 兼容工具滚动墙加 Cline、DeepSeek Harness

- 日期：2026-11-23
- 分支：main

## 改动
- `web/src/features/landing/content.ts`：`COMPATIBLE_TOOLS` 加 Cline（Cursor 之后，链 `tools-cline`）、DeepSeek Harness（Kimi Work 之后，链 `tools-deepseek-harness`）。
- `web/public/logos/tools/`：
  - `cline.png`：来自 cline/cline `assets/icons/icon.png`（128px，深色圆角底，明暗主题通用）。
  - `deepseek-harness.svg` / `deepseek-harness-dark.svg`：来自 deepseek-ai/deepseek-harness `apps/web/public/favicon.svg` / `favicon-dark.svg`（黑 / 白鲸鱼）。

## 验证
- `vitest run src/features/landing`：6 files / 24 tests 通过。
- 本地 5173 深色主题：两个 logo 正常加载，DeepSeek Harness 显示白色版本。

## 追加：打字机文案
- zh / zh-TW：「高缓存命中，成本更低」→「高缓存命中率，成本更低」（繁体同步「高快取命中率」），读屏完整句同步改。
