# 修前端 lint 错误与 3 个旧失败用例

- 日期：2026-10-26
- 分支：fix-web-stale-tests
- PR：（不开 PR，按团队约定直接留在分支上）
- 关键 commit：本分支单一 commit（见分支 log）

## 背景

- `bunx oxlint src/hooks/use-table-url-state.ts` 报 1 error（`no-non-null-assertion`）+ 1 warning（`prefer-number-properties`），阻塞 lint 门禁。
- 在 main 与发版 tag `v2026.10.25.2` 上有 3 个前端用例稳定失败，均非本轮新引入：
  1. `command-menu.test.tsx`「admins find admin pages in search but not super admin pages」
  2. `quota-display.test.tsx`「combines creation and last login into one column with full dates visible directly」
  3. `detail-preview.test.tsx`「task log prices use localized unit labels from pricing metadata」20 秒超时

## 变更

全部在 `web/`，只改测试与一个上游 hook 的写法，不改产品逻辑：

- `src/hooks/use-table-url-state.ts`：`parseInt` → `Number.parseInt`；去掉 `found!.value` 的非空断言，改为先取 `found?.value` 再 `Array.isArray` 判断，运行时行为完全一致。
- `src/components/__tests__/command-menu.test.tsx`：在 `searchEntriesFor` 里 `vi.spyOn(api, 'get')` 统一返回 `{ success: true, data: null }`，截断侧边栏发起的企业 / 推广人自查请求。
- `src/features/users/components/__tests__/quota-display.test.tsx`：「—」断言收紧到 `td[data-column-id="invite_info"]` 单元格。
- `src/features/usage-logs/components/__tests__/detail-preview.test.tsx`：慢用例不再用 `act()` 包语言切换，改为 `await i18n.changeLanguage('zh-CN')` 后 `findByRole` 等待切换后的文案出现。

## Bug 根因

### 1. command-menu：菜单没缺项，是测试环境把登录态清掉了

- 实测打印管理员角色下的搜索项，整个 Admin 分组都不在（连没有角色限制的「Finance Center」也没有），而直接渲染 `useSidebarView` 的探针显示 Admin 分组有 4 项，排除了菜单改名 / 移动的可能。
- 真正链路：tokenfunc 的 `useSidebarView` 多了 `useEnterpriseSelf()` / `usePromoterSelf()` 两个查询，测试没 mock `api`，axios 请求真实打到 jsdom 默认 origin `localhost:3000`。本机主 checkout 的 dev 后端正好监听 3000，返回 401 → 拦截器走 `refreshAuthentication` → refresh 也 401 → `clearAuthentication()` → `auth.reset()`，用户变成 null → Admin 分组按角色被过滤掉。探针确认：点击搜索后等 2 秒，`auth.user` 从 `{role:10}` 变为 `null`，两个 self 查询状态为 `error: 401`。
- 结论：测试过时（没跟上二开新增的网络依赖），不是菜单缺项；处理方式是 mock 外部网络边界。

### 2. quota-display：行里多了一个「—」，来自二开新增的邮箱列

- DOM 显示该行 `data-column-id="email"` 单元格在 fixture 无邮箱时渲染「—」，与原断言想找的「Invite Info」空值「—」重复，`getByText` 报 multiple elements。
- 产品列是预期行为，按任务要求不动产品列，只把断言收紧到 `invite_info` 单元格。

### 3. detail-preview：`act(() => i18n.changeLanguage('zh-CN'))` 在全文件顺序跑时挂起

- 单独跑该用例 34ms 即通过；全文件跑时在 `act()` 处挂起，放宽到 90 秒超时也不返回，是挂起不是慢。
- 用 `-t` 做排除式二分：只排除「keeps log details open」或只排除「plugin information」或只排除「dynamic pricing without a saved tier」任一组都能通过；三者同时在场才复现。前两组都是打开 `DetailsDialog` 后不关就结束用例，第三组在 `act` 里切过一次语言并挂了 zh 资源包。
- 探针显示 `i18n.changeLanguage('zh-CN')` 本身毫秒级 resolve，不用 `act` 时 `findByRole` 也能在 3 秒内拿到切换后的「张」文案，所以是 React `act` 等不到稳定态，和前面用例残留的弹窗状态有关。尝试在那两个用例末尾按 Escape 关弹窗，结果时好时坏（关闭动作本身在顺序跑时偶发找不到 dialog），不可靠，放弃。
- 最终按规范「等待明确的界面状态」改用例本身：去掉 `act`，等待切换后的文案。连续 3 次全文件跑该用例均为 34ms。

## 验证

- `bunx oxlint` 对 4 个改动文件：无输出（0 error 0 warning）。
- `bun run typecheck`：通过。
- `bunx vitest run src/components/__tests__/command-menu.test.tsx src/features/users/components/__tests__/quota-display.test.tsx src/hooks`：Test Files 5 passed，Tests 33 passed。
- `bunx vitest run src/features/usage-logs/components/__tests__/detail-preview.test.tsx`：30 passed，复跑 2 次慢用例均 34ms。
- 全量 `bunx vitest run`：Test Files 287 passed (287)，Tests 2710 passed (2710)，Duration 231.99s。
- `use-table-url-state` 没有专属测试文件（grep 无结果），靠 `src/hooks` 目录与全量回归覆盖。

## 遗留

- 前端测试里凡是走真实 `api` 又没 mock 的用例，在本机 3000 端口有 dev 后端时都可能被 401 清登录态影响；本次全量通过未再发现，但这是环境耦合，后续遇到「本地失败 CI 过」优先怀疑这条。
- detail-preview 的 `act` 挂起只定位到「未关闭的弹窗用例 + 语言切换用例」组合条件，Base UI 弹窗卸载残留的具体机制未深挖；上游同步该文件时注意保留本处改法。
