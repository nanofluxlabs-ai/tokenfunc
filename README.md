# TokenFunc

**面向企业的 AI 模型 API 网关** — [tokenfunc.com](https://tokenfunc.com)

基于 [new-api](https://github.com/QuantumNous/new-api) 二次开发的商用网关：聚合多家上游模型供应商，对外暴露 OpenAI / Anthropic / Gemini 兼容协议，客户只改 `base_url` 和 `api_key` 即可接入；在此之上叠加企业账务、分组定价、推广分成等商业化能力。

> 本仓库为 nanofluxlabs 内部商业项目。上游代码遵循 AGPLv3 及其附加条款，对外提供服务前须确认许可合规（商业授权安排见内部记录）。

---

## 业务特点

对客户的三个核心承诺（落地页卖点即产品约束）：

1. **满血不降级**：转发官方正式接口，不掺假、不偷换模型。
2. **数据安全**：网关不留存请求 / 响应正文（异步任务 prompt 为已知例外，待清理）。
3. **企业管控、账能对平**：额度、账单、流水三者可相互核对，`ent_ledger` 是资金的唯一事实来源。

SLA 口径：只承诺网关自身的月可用率，**上游模型厂商故障不在承诺范围内**。

### 二开功能全景

| 模块 | 内容 | 代码入口 |
| --- | --- | --- |
| 企业组织 | 企业与 users 1:1，多管理员、扁平团队、成员（登录角色与不登录员工同表） | `model/enterprise_org.go`、`controller/enterprise_*.go` |
| 企业账务 | 预付钱包 + 授信账期（自然月 / 固定天 / 额度信用）、账单 Invoice、报价单、人工调账、账单归档冻结件 | `model/enterprise_credit.go`、`enterprise_bill*.go`、`docs/tokenfunc/enterprise-design.md` |
| 预算与限额 | 团队月度预算拦截、key 周期限额、授信预警 | `service/enterprise_team_budget.go` 等 |
| 员工自查 | 无需登录，粘贴 API key 即查额度、归属与调用记录（`/key-usage`） | `controller/tokenfunc_key_usage.go`、`web/src/features/key-usage/` |
| 分组定价 | 用户分组 × 渠道分组矩阵，倍率基准价 + 覆盖，可见性为显式列表（无默认可见） | `docs/tokenfunc/channel-groups.md` |
| 推广分成 | 推广人、分成比例、结算 | `model/tokenfunc_promoter*.go` |
| 财务与对账 | 财务中心、对账差异告警、日志归档到腾讯云 COS（含回放导入） | `web/src/features/finance/`、`model/tokenfunc_log_archive.go` |
| 落地页与文档 | 营销落地页（卖点 / 价目 / FAQ / 留资）、文档中心 | `web/src/features/landing/`、`web/src/features/docs/` |

二开约定：新表一律 `ent_` / `tokenfunc_` 前缀，**只支持 PostgreSQL**（可用 jsonb、`ON CONFLICT`、部分唯一索引）；上游代码保持原样，不为二开补 SQLite / MySQL 兼容；二开内容尽量放独立文件，减少与上游的合并冲突。

---

## 技术架构

```
 客户端 (Cursor / Claude Code / SDK / 浏览器)
      │  OpenAI / Anthropic / Gemini 协议 + sk- key
      ▼
┌─────────────────────────── TKE (ns tokenfunc) ───────────────────────────┐
│  tokenfunc-api-slave ×N ── 接流量：鉴权 → 计费预扣 → relay 转发 → 结算    │
│  tokenfunc-api-master ×1 ─ 不接流量：迁移、出账、预警、归档等后台任务      │
└──────────┬────────────────────────┬──────────────────────────────────────┘
           │                        │
      PostgreSQL (PaaS)        Redis (PaaS)
      业务 + 账务 + 日志        缓存 / 限流 / 会话
           │
      腾讯云 COS（日志归档、账期冻结件、二维码等静态资源）
```

| 层 | 技术 |
| --- | --- |
| 后端 | Go 1.26 + Gin + GORM v2；`router/ → middleware/ → controller/ → service/ → model/`，转发在 `relay/` |
| 独立模块 | `relaykit/`（四种文本协议 DTO 与互转）、`tokenkit/`（token 计数估算），均可独立构建，不依赖主模块 |
| 任务插件 | JavaScript 插件（moejs 执行）扩展图片 / 视频等异步任务，见 `docs/plugin-api/v1.md` |
| 前端 | React 19 + TypeScript + Rsbuild + TanStack Router/Query/Table + Tailwind CSS 4，包管理用 Bun；7 语言 i18n |
| 存储 | PostgreSQL（上游层仍兼容 SQLite/MySQL，二开层只用 PG）、Redis、COS |
| 镜像 | `ghcr.io/nanofluxlabs-ai/tokenfunc:<tag>`，GitHub Actions 构建（失败时本机 `scripts/tokenfunc/tke-local-image.sh` 兜底） |

---

## 快速上手

本地环境只通过 `make` 管理：单 PG 多 schema（dev / test）、单 Redis 多 db（0 / 1），开发与测试共用一套容器。

```bash
make dev        # 基础设施 + API(3000) + 前端 dev server(5173)
make test       # Go 单测（根模块 + relaykit + tokenkit，不依赖库）
make test-db    # 需要 PG 的 Go 测试（PKG=./model/... 可缩小范围）
make test-web   # 前端 vitest
make seed-demo  # 往 dev schema 灌示例数据
make help       # 全部目标
```

多任务并行用 git worktree，每个 worktree 一套隔离环境：进入后先 `make wt-init`（领 slot、独立 schema / Redis db / 端口），退出前 `make wt-clean`。细节见 `docs/tokenfunc/development.md` §4.7。

---

## 发版与上游同步

- **生产发版**：走 `/release-tke`（Claude Code skill）：前置检查 → 打 tag → Actions 构建 → `deploy/k8s/scripts/deploy.sh` 滚动部署（先 master 后 slave）→ 冒烟 → 监控。tag 格式 `vYYYY.MM.DD.N`，每次发版在 `docs/tokenfunc/releases/` 留发布报告。禁止 `kubectl apply` 清单发版（会把镜像回滚成文件里的旧 tag）。
- **上游同步**：只合上游 rc tag，约每 2 周或每 2 个 rc 一次：`make upstream-status` → `make upstream-diff REF=…`（生成评估清单）→ `make upstream-merge REF=…`，同步后独立发版。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | 全仓库开发规范（Go / 数据库 / 计费 / 测试 / worklog），**改代码前必读** |
| [web/AGENTS.md](./web/AGENTS.md) | 前端规范（组件复用优先、i18n、测试） |
| [.agents/rules/billing.md](./.agents/rules/billing.md) | 计费规则，触碰计费链路前必须全文读 |
| [docs/tokenfunc/development.md](./docs/tokenfunc/development.md) | 环境拓扑、make 目标、协作与 worktree 约定 |
| [docs/tokenfunc/enterprise-design.md](./docs/tokenfunc/enterprise-design.md) | 企业模块设计基线（数据模型、计费改造、账期出账） |
| [docs/tokenfunc/channel-groups.md](./docs/tokenfunc/channel-groups.md) | 渠道分组与定价倍率规划 |
| [docs/tokenfunc/releases/](./docs/tokenfunc/releases/) | 历次发布报告与事故归档 |
| [docs/worklog/](./docs/worklog/) | 每次代码变更的工作日志（为什么改、根因、验证、遗留） |
| [deploy/k8s/README.md](./deploy/k8s/README.md) | TKE 部署清单与脚本 |

---

## 许可

上游 new-api 以 [AGPLv3](./LICENSE) 授权并附加 Section 7 条款（界面须保留上游署名与项目链接）。本仓库的二开部分为 nanofluxlabs 商业代码；对外分发或提供网络服务时，须满足 AGPLv3 义务或按商业授权执行。第三方依赖声明见 [NOTICE](./NOTICE) 与 [THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md)。
