# 补全 tokenfunc 二开文案的日语 / 越南语译文

- 日期：2026-10-26
- 分支：chore-i18n-ja-vi
- PR：（不开 PR，本地分支）
- 关键 commit：cdf012968

## 背景

二开文案集中在 `web/src/i18n/locales/tokenfunc/{en,zh,zh-TW,fr,ru,ja,vi}.json`，键为英文原文。此前多个模块（企业控制台、财务中心、落地页、企业接入文档等）用 `bun run i18n:sync` 把 ja / vi 直接用英文回填，导致 ja 有 427 个、vi 有 428 个键的值与 en 完全相同，日语 / 越南语界面大面积显示英文。本次只处理 ja 与 vi；fr / ru 由另一分支负责，上游 `web/src/i18n/locales/*.json` 不动。

## 变更

仅改两个文件：`web/src/i18n/locales/tokenfunc/ja.json`（413 个键）、`web/src/i18n/locales/tokenfunc/vi.json`（414 个键，比 ja 多一个 `Bearer token`）。只有值变化，无键增删、无顺序与格式变化。

覆盖范围：落地页（hero / 能力 / 号池演示 / 自检演示 / FAQ / 联系销售）、企业控制台（团队、成员、密钥、账单、概览、预警）、财务中心（经营看板、订单、用户 / 模型消耗、充值）、对账、钱包流水、系统设置里的协议 / 隐私 / 商务二维码说明、企业接入文档与企业错误码。

翻译规则：`{{placeholder}}`、HTML、换行、代码标识符（`base_url`、`X-User-Id`、`/v1`、`quota_policy`、错误码等）、数字与单位原样保留；日语沿用文件内已有的「〜する / 名词形」风格与全角括号；越南语全部带声调，脚本对每条译文做了声调字符检查。

### 术语表（与文件内已有译文、上游 locale 对齐）

| 英文 | 日语 | 越南语 |
| --- | --- | --- |
| enterprise | 企業 | doanh nghiệp |
| team / member | チーム / メンバー | nhóm / thành viên |
| key / API key / team key | キー / API キー / チームキー | khóa / API key / key nhóm |
| holder | 所有者 | người giữ |
| credit / credit limit / credit period | 与信 / 与信枠 / 与信期間 | tín dụng / hạn mức tín dụng / kỳ tín dụng |
| Period #N | 第 N 期 | Kỳ #N |
| bill / invoice | 請求書 / インボイス | hóa đơn（两者同词） |
| statement / wallet entries | 明細書 / ウォレット取引 | sao kê / giao dịch ví |
| budget / monthly budget | 予算 / 月間予算 | ngân sách / ngân sách tháng |
| quota / periodic quota / quota-based credit | クォータ / 定期クォータ / 額度ベース与信 | hạn mức / hạn mức định kỳ / tín dụng theo hạn mức |
| adjustment | 調整 | điều chỉnh |
| reconciliation | 照合 | đối soát |
| settlement | 精算 | quyết toán |
| top-up | チャージ | nạp tiền |
| balance | 残高 | số dư |
| consumption / usage | 消費 / 使用量・利用 | tiêu thụ / mức sử dụng |
| can sign in / key only | ログイン可 / キーのみ | có thể đăng nhập / chỉ có key |
| pool（号池） | プール | pool |
| cache hit / cache read / cache write | キャッシュヒット / 読取 / 書込 | cache trúng / đọc cache / ghi cache |
| Model Square | モデル広場 | Quảng trường mô hình（上游译法） |
| ratio（倍率） | 倍率 | hệ số |
| trial request | トライアル申請 | yêu cầu dùng thử |
| account manager | アカウントマネージャー | người quản lý tài khoản |

上游 `ja.json` / `vi.json` 中与待译键同名的只有 `Query`，且上游本身未翻译，故未复用；本次译为「検索」/ `Truy vấn`。

### 保留原文的键（ja 与 vi 相同）

纯缩写 / 专名 / 代码标识，刻意不翻译：`ID`、`CSV`、`JSON`、`URL`、`API`、`OK`、`Token`、`Invoice`、`TokenFunc`、`Claude Code`、`Hermes`、`Pi`、`OpenClaw`、`WorkBuddy`、`Waffo Pancake`、`JavaScript`、`Python`、`TypeScript`、`cURL`、`Responses`（Responses API 文档标题）、`Epay`、`https://example.com/sales-wechat.png`、`preset.tokenfunc`（主题预设名，en / zh 的值也是 `tokenfunc`）。

示例数据里的中文人名按各语言惯例处理：日语用汉字（張偉 / 李娜 / 王強 / 陳静），越南语用汉越音（Trương Vĩ / Lý Na / Vương Cường / Trần Tĩnh）。

## 验证

- 第 1 步脚本（列出 `value == en[key]` 的键）：翻译前 ja 427 / vi 428；翻译后 ja 14 / vi 14，剩余全部是上面"保留原文"列表中的专名。
- 写回脚本校验：每条译文的 `{{placeholder}}` 集合与 en 一致、代码标识符未丢失、越南语含声调字符；全部通过后才写回。
- `cd web && bunx vitest run src/i18n`：2 个文件 5 个用例全部通过。
- `cd web && bun run i18n:sync`：执行后 `git status` 无新增变化；报告 `_sync-report.json` 中 ja `missingCount 0 / extrasCount 0 / untranslatedCount 10`（即保留原文的 10 个长度 ≥ 6 的专名），vi 三项均为 0。
- `bunx oxfmt --check` 两个文件：格式正确。
- `git diff -U0` 统计：ja 826 行、vi 828 行变化，全部是 `"key": "value"` 行，无格式噪音。

## 遗留

- 剩余与 en 相同的 14 个键均为专名，无需翻译。
- 越南语译文对 `Model Square` 沿用了上游的 `Quảng trường mô hình`，与上游保持一致；如后续上游改译需同步。
