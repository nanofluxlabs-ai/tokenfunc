# 补齐 tokenfunc 二开文案的法语 / 俄语译文

- 日期：2026-10-26
- 分支：chore-i18n-fr-ru
- PR：（未建 PR）
- 关键 commit：83f7aaa82

## 背景

二开文案放在 `web/src/i18n/locales/tokenfunc/{en,zh,zh-TW,fr,ru,ja,vi}.json`，键是英文原文。此前多个模块（落地页、财务中心、企业控制台、企业集成文档、试用申请等）新增文案时用 `bun run i18n:sync` 把 fr / ru 直接用英文回填，导致 fr 431 键、ru 427 键的值与 en 完全相同，法语 / 俄语界面上这些位置显示的是英文。

本次只负责 fr 与 ru；ja / vi 由另一分支处理；上游 `web/src/i18n/locales/*.json` 不动。

## 变更

- `web/src/i18n/locales/tokenfunc/fr.json`：408 键译成法语。
- `web/src/i18n/locales/tokenfunc/ru.json`：411 键译成俄语。
- 只改值不改键、不改顺序；上游 fr / ru 中没有同名键可复用，全部自行翻译。

### 翻译规则

- 保留 `{{placeholder}}`、HTML、换行、代码标识符（`base_url`、`X-User-Id`、`/v1`、`quota_policy`、`request_header`、JSON 字段名 `messages` / `choices` / `usage` 等）、数字与单位。
- 按钮用动词原形（fr：Lancer / Rechercher；ru：Запустить / Запросить），标题用名词。
- 法语：性数配合；`:` `;` `?` `!` 前用普通空格，与文件内已有译文一致；百分号写作 `99,95 %`。
- 俄语：带 `{{count}}` 的短句改为「名词: {{count}}」语序（如 `Каналов: {{count}}`）规避数词变格；使用 ё（счёт、кошелёк），与文件内已有译文一致。
- 拼接片段按调用处语序翻译：登录页 `Enterprise-grade` + `model gateway` / `One endpoint` + `every major model`；企业集成文档树形图里的 `team` / `key only` / `optional holder` 等小写片段保持小写。
- `statement` / `usage` 用于导出 CSV 文件名，fr 为 `relevé` / `usage`，ru 为 `выписка` / `расход`。

### 术语表

| 英文 | 法语 | 俄语 | 来源 |
| --- | --- | --- | --- |
| Enterprise | entreprise | компания | 本文件已有译文 |
| Company（试用申请表） | société | компания | 新定 |
| Team / Member | équipe / membre | команда / участник | 本文件已有译文 |
| Key / API key | clé / clé API | ключ / API-ключ | 本文件、上游 |
| Holder | titulaire | владелец | 本文件已有译文 |
| Credit / Credit limit / Credit period | crédit / limite de crédit / période de crédit | кредит / кредитный лимит / кредитный период | 本文件已有译文 |
| Bill / Bills | facture(s) | счёт / счета | 本文件已有译文 |
| Invoice（VAT） | facture de TVA | счёт-фактура | 新定 |
| Statement | relevé | выписка | 本文件已有译文 |
| Wallet / Wallet entries | portefeuille / écritures de portefeuille | кошелёк / операции кошелька | 上游 Wallet，其余新定 |
| Ledger entries | écritures | записи | 本文件已有译文 |
| Budget / Monthly budget | budget / budget mensuel | бюджет / месячный бюджет | 本文件已有译文 |
| Periodic quota | quota périodique | периодическая квота | 新定 |
| Adjustment | ajustement | корректировка | 本文件已有译文 |
| Reconciliation | rapprochement | сверка | 本文件已有译文 |
| Top-up | recharge | пополнение | 上游 |
| Redemption code | code d'échange | код активации | 上游 |
| Subscription / Order | abonnement / commande | подписка / заказ | 上游 |
| Consumption / Usage | consommation / usage | расход | 本文件已有译文 |
| Group / Channel / Pool | groupe / canal / pool | группа / канал / пул | 上游、新定 |
| Cache hit / Cache hit rate | succès de cache / taux de succès du cache | попадание в кэш / доля попаданий в кэш | 新定 |
| First-token latency | latence du premier token | задержка первого токена | 新定 |
| Failover | basculement | переключение | 新定 |
| Account manager | chargé de compte | менеджер | 新定 |
| Sales | service commercial | отдел продаж | 本文件已有译文 |
| No login（员工不登录） | sans connexion | без входа | 本文件已有译文 |
| Model square | place des modèles | каталог моделей | 新定 |
| Token（计量单位） | token | токен | 本文件已有译文（fr 沿用 token 而非上游的 jeton） |

### 保留原文的键

- 人名（落地页示例数据）：`Zhang Wei`、`Li Na`、`Wang Qiang`、`Chen Jing`
- 产品 / 工具 / 语言名：`Claude Code`、`OpenClaw`、`Pi`、`Hermes`、`WorkBuddy`、`Waffo Pancake`、`Epay`、`cURL`、`Python`、`JavaScript`、`TypeScript`、`Code (Codex)`（fr 独有）
- 配置示例：`https://example.com/sales-wechat.png`、`preset.tokenfunc`（已在 KEEP 规则内）
- 法语同形词（与英文拼写一致但本身就是正确法语）：`Contact`、`Date`、`Promotion`、`Sources`、`Restrictions`、`usage`（CSV 文件名片段，法语亦为 usage）

## 验证

- 扫描脚本（scratchpad `i18nfrru_scan.py`，列出 `value == en[key]` 的键）：改前 fr 431 / ru 427；改后 fr 23 / ru 16，全部为上面「保留原文的键」。
- 写回脚本（`i18nfrru_apply.py`）逐键校验 `{{...}}` 占位符集合一致：fr `replaced=408 missing=0 unused=0 bad_placeholder=0`，ru `replaced=411 missing=0 unused=0 bad_placeholder=0`。
- `git diff --numstat`：fr `408 408`，ru `411 411`，即纯值替换、无格式噪音（文件为 `JSON.stringify(obj, null, 2)` 风格，Python `json.dump(indent=2, ensure_ascii=False)` 输出一致，无需 oxfmt）。
- `cd web && bunx vitest run src/i18n`：2 个文件 5 个用例通过（含 `tokenfunc/__tests__/locale-shape.test.ts`）。
- `cd web && bun run i18n:sync`：再跑一次后 `git status` 仍只有 fr / ru 两个文件的既有改动，无新增 diff；同步报告 fr `untranslatedCount: 0`，ru 11（全部是上面的人名 / 产品名）。

## 遗留

- 同步报告里 ja 406 / vi 123 / zh 16 条「未翻译」不在本分支范围（ja / vi 由另一分支处理）。
- 落地页示例人名保留拼音；若以后法语 / 俄语落地页要做本地化示例数据，需要连同 `features/landing/content.ts` 一起改。
