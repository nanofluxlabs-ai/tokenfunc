package system_setting

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

// tokenfunc 二开：服务条款、隐私政策与关于页的默认正文写在代码里，
// 任何新实例开箱即有；后台「系统设置 → 站点 → 系统信息」仍可覆盖。
// 值是 {"zh-CN": …, "en": …} 形式的 JSON，前端按界面语言选取，
// 管理员也可以直接填单语 Markdown、HTML 或 URL。

const legalCompanyName = "湖南多点计算科技有限公司"
const legalCompanyNameEN = "Hunan Duodian Computing Technology Co., Ltd."
const legalContactEmail = "support@tokenfunc.com"
const legalEffectiveDate = "2026-10-10"

type LegalSettings struct {
	UserAgreement string `json:"user_agreement"`
	PrivacyPolicy string `json:"privacy_policy"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement: mustMarshalLocalizedContent(map[string]string{
		"zh-CN": `# 服务条款与使用政策

生效日期：` + legalEffectiveDate + `

欢迎使用 TokenFunc（以下简称"本平台"），本平台由 ` + legalCompanyName + `（以下简称"我们"）运营。访问、注册或使用本平台，即表示你已阅读、理解并同意遵守以下条款。

## 1. 服务定位

- 本平台面向企业客户提供全球大模型 API 的统一接入、鉴权、转发、额度管理、组织与项目管理、用量统计与账单等能力。
- 本平台依赖第三方上游模型服务、网络节点、支付服务与身份验证服务，因此不保证持续、无中断、无错误或永久可用。
- 本平台会根据风控、合规、上游政策、资源情况与运营需要，调整、限制、暂停或终止部分功能、模型、渠道、账号或请求。

## 2. 地域与资格限制

- 本平台服务不面向中国大陆公众开放。
- 你声明并保证，你不是中国大陆地区的公众用户或个人消费者，不为中国大陆地区的公众用户或个人消费者代为注册、购买或使用本平台，也不会将本平台以面向中国大陆公众或个人消费者的方式分发、转售或公开运营。如你以中国大陆企业客户的身份使用本平台，你已就此完成必要的内部授权、合规评估、数据处理评估与对上游服务商使用条款的同意，并将服务严格限定在该企业内部使用场景。
- 如你的所在地、身份、用途或交易关系导致本平台面临法律、监管、支付、制裁、出口管制或上游政策风险，本平台有权拒绝提供服务或立即终止服务。

## 3. 服务范围与企业自用限制

- 本平台提供的服务仅供企业客户在其内部研发、测试、内部办公、数据分析及合规商业评估等企业自用场景下使用。严禁将本平台提供的 AI 接入、模型调用、Token、API Key、渠道凭证或其衍生服务以任何形式对外开放、公开运营、嵌入面向公众的产品、对第三方提供生成式 AI 服务或转售给任何第三方。
- 你应保证本平台账号、Token、API Key、员工密钥及任何衍生访问权限仅供你所在企业内部经合法授权的员工或合作人员在企业内部场景下使用，不得用于个人消费、面向公众的 AI 服务、SaaS 转售、API 转售、AI 聊天产品、AI 创作平台、AI 工具站、AI 代理服务、内容生成业务或任何形式的二次分发。
- 你应保证你所在企业有权将本平台作为内部研发或办公基础设施使用，并已完成必要的内部审批、合规评估、数据处理评估、安全评估，以及对本平台上游服务商使用条款的同意。
- 你应自行评估并承担因将服务用于非企业自用场景、对外开放使用、面向公众提供生成式 AI 服务、转售或违反上述限制所引发的全部行政、刑事、民事、合同、税务及合规责任，本平台对此不承担任何责任。
- 如本平台发现或合理怀疑你将服务用于非企业自用场景、面向公众开放、转售或嵌入面向公众的产品，或上游服务商、监管机构、第三方权利人、支付机构、合规合作方就你的用途提出风险或异议，本平台有权在不事先通知的情况下立即限制、暂停或终止全部或部分服务、扣留剩余额度、停止提供后续支持，并保留追究你由此造成的全部损失与责任的权利。

## 4. 用户义务

- 你应确保注册信息、企业信息、支付信息、联系信息真实、准确、完整，并在变化时及时更新。
- 你应自行保管账号、密码、API Key、Token、员工密钥及其他访问凭据，并对账号及其下属组织、项目、员工密钥发生的一切行为负责。
- 你应遵守所在司法辖区关于 AI、数据、内容、安全、出口管制、消费者保护、隐私与网络使用的全部适用法律、法规、行业规范及监管要求。
- 你同时应遵守本平台接入的各上游模型提供方、支付提供方、身份验证提供方和基础设施提供方的使用政策。

## 5. 禁止行为

你不得利用本平台从事以下行为：

- 将本平台账号、Token、API Key、员工密钥或上游模型能力以任何形式对外开放、面向公众运营、嵌入面向公众的产品、转售给第三方，或借助本平台对外提供生成式 AI 服务（包括但不限于公开 AI 聊天、AI 创作、AI 工具站、AI 代理、AI 客服、AI 内容生成或其他面向公众的 AI 服务）。
- 生成、传播、交易或协助制作违法内容，包含但不限于色情、赌博、诈骗、洗钱、非法金融、钓鱼、恶意软件、勒索软件、木马、入侵、撞库或其他网络攻击活动。
- 侵害他人隐私、人格权、著作权、商标权、商业秘密或其他合法权益。
- 绕过、对抗、探测或滥用本平台的限流、配额、调度、风控、鉴权、计费、审计或安全机制。
- 借助机器人、脚本、共享池、代理池或批量方式恶意注册、刷号、囤号、撞库、盗用账户或扩大异常调用。
- 倒卖、共享、出租、转让、转借、分发或公开传播账号、Token、API Key、员工密钥或访问配额。
- 冒充本平台、上游服务商或第三方主体，对外宣称官方合作、官方授权或误导性关联。

## 6. 计费与可用性

- 充值、余额、授信额度、配额、模型可用性、渠道状态、限流策略和价格可能随上游条件、汇率、风控和运营策略而调整；价格调整将在生效前通过站内公告或邮件通知。
- 本平台的服务可用性承诺仅覆盖本平台网关自身，不包含上游模型厂商的故障、限流、停服或政策变更。
- 页面显示的状态、余额、额度或可用性信息可能存在延迟，不构成任何形式的持续可用承诺。
- 因上游限额、上游失效、网络故障、风控触发、第三方政策调整、不可抗力或用户自身配置问题导致的失败、延迟、中断或数据差异，本平台不承担保证责任。
- 企业授信、线下充值、对账与开票的具体安排以双方签署的服务合同为准；合同与本条款冲突时，以合同为准。

## 7. 真实性承诺

- 本平台承诺按你请求中指定的模型转发至对应的官方或授权上游，不擅自替换、降级为其他模型，不以非官方来源冒充官方来源。
- 本平台按上游返回的用量据实计量与计费，不虚报 Token 数量或调用次数；上游用量口径与本平台账单口径的对应关系在定价页面公示。
- 如你发现模型来源或用量计量与上述承诺不符，可通过本条款第 10 条的联系方式反馈，我们将核查并在确认后予以纠正和补偿。

## 8. 违约处理

- 如本平台判断你存在违规、风险异常、支付风险、投诉争议、上游封禁、政策冲突或其他可能危及平台、其他用户或第三方的情形，本平台有权在不事先通知的情况下限制、暂停或终止全部或部分服务。
- 对涉嫌违法违规的行为，本平台有权保留相关日志、记录和必要证据，并在法律允许范围内向有权机关、支付机构、上游服务商或合规合作方披露。

## 9. 条款更新

- 本平台可根据业务变化、法律要求或上游政策更新本条款。
- 更新后的版本发布后即生效；继续使用本平台视为你接受更新后的内容。重大变更将通过站内公告或邮件通知。

## 10. 联系我们

- 运营主体：` + legalCompanyName + `
- 联系邮箱：` + legalContactEmail + `
- 如对本条款有任何疑问、投诉或合规咨询，请通过上述邮箱与我们联系。
`,
		"en": `# Terms of Service and Acceptable Use Policy

Effective date: ` + legalEffectiveDate + `

Welcome to TokenFunc ("the Platform"), operated by ` + legalCompanyNameEN + ` ("we", "us"). By accessing, registering for, or using the Platform, you confirm that you have read, understood, and agreed to the following terms.

## 1. Service Scope

- The Platform provides enterprise customers with unified access, authentication, relay, quota management, organization and project management, usage analytics, and billing for global large language model APIs.
- The Platform depends on third-party upstream model providers, network paths, payment services, and identity services. We therefore do not guarantee continuous, uninterrupted, error-free, or permanent availability.
- The Platform may adjust, restrict, suspend, or terminate specific features, models, channels, accounts, or requests based on risk control, compliance, upstream policies, resource conditions, or operational needs.

## 2. Geographic and Eligibility Restrictions

- The Platform is not offered to the general public in mainland China.
- You represent and warrant that you are not a public user or individual consumer in mainland China, that you do not register, purchase, or use the Platform on behalf of such users, and that you will not distribute, resell, or publicly operate the Platform in a manner directed at them. If you use the Platform as an enterprise customer in mainland China, you have completed the necessary internal authorization, compliance assessment, data-processing assessment, and consent to upstream providers' terms, and you restrict the service strictly to internal use within that enterprise.
- If your location, identity, use case, or transaction relationship exposes the Platform to legal, regulatory, payment, sanctions, export-control, or upstream-policy risk, the Platform may refuse or immediately terminate service.

## 3. Scope of Service and Internal-Use-Only Restriction

- The Platform is provided solely for enterprise customers' internal use, including research and development, testing, internal operations, data analysis, and compliant commercial evaluation. You must not expose, publicly operate, embed into public-facing products, provide generative AI services to third parties with, or resell the Platform's AI access, model invocation, tokens, API keys, channel credentials, or derived services in any form.
- You must ensure that Platform accounts, tokens, API keys, employee keys, and any derived access are used only by lawfully authorized employees or collaborators of your enterprise in internal scenarios, and not for personal consumption, public-facing AI services, SaaS resale, API resale, AI chat products, AI creation platforms, AI tool sites, AI agent services, content-generation businesses, or any form of redistribution.
- You must ensure that your enterprise is entitled to use the Platform as internal R&D or operational infrastructure and has completed the necessary internal approvals, compliance assessment, data-processing assessment, security assessment, and consent to upstream providers' terms.
- You are solely responsible for all administrative, criminal, civil, contractual, tax, and compliance liabilities arising from use beyond internal enterprise scenarios, public exposure, public-facing generative AI services, resale, or any breach of the above restrictions. The Platform assumes no liability for such use.
- If the Platform discovers or reasonably suspects that you are using the service beyond internal enterprise use, exposing it to the public, reselling it, or embedding it into public-facing products, or if an upstream provider, regulator, rights holder, payment institution, or compliance partner raises risk or objection about your usage, the Platform may immediately restrict, suspend, or terminate all or part of the service without prior notice, withhold remaining quota, cease support, and reserve the right to pursue all resulting losses and liabilities.

## 4. User Responsibilities

- You must ensure that registration, enterprise, payment, and contact information is accurate, complete, and kept up to date.
- You are responsible for safeguarding your account, password, API keys, tokens, employee keys, and other credentials, and for all activity under your account and its organizations, projects, and employee keys.
- You must comply with all applicable laws, regulations, industry rules, and regulatory requirements in your jurisdiction regarding AI, data, content, security, export control, consumer protection, privacy, and network use.
- You must also comply with the usage policies of every upstream model provider, payment provider, identity provider, and infrastructure provider used by the Platform.

## 5. Prohibited Conduct

You must not use the Platform to:

- Expose Platform accounts, tokens, API keys, employee keys, or upstream model capabilities to the public, operate them publicly, embed them into public-facing products, resell them to third parties, or provide generative AI services to third parties through the Platform (including public AI chat, AI creation, AI tool sites, AI agents, AI customer service, AI content generation, or any other public-facing AI service).
- Generate, distribute, trade, or assist in producing illegal content, including but not limited to pornography, gambling, fraud, money laundering, illegal finance, phishing, malware, ransomware, trojans, intrusion, credential stuffing, or other cyberattack activities.
- Infringe others' privacy, personality rights, copyrights, trademarks, trade secrets, or other lawful rights.
- Bypass, attack, probe, or abuse the Platform's rate limiting, quotas, routing, risk control, authentication, billing, audit, or security mechanisms.
- Use bots, scripts, shared pools, proxy pools, or bulk methods to register abusively, farm accounts, hoard accounts, stuff credentials, hijack accounts, or amplify abnormal traffic.
- Sell, share, rent, transfer, lend, distribute, or publicly disclose accounts, tokens, API keys, employee keys, or access quotas.
- Impersonate the Platform, upstream providers, or third parties, or claim official partnership, authorization, or misleading affiliation.

## 6. Billing and Availability

- Top-ups, balances, credit limits, quotas, model availability, channel status, rate-limit policies, and pricing may change with upstream conditions, exchange rates, risk control, and operational strategy. Price changes are announced in advance through in-app notices or email.
- The Platform's availability commitment covers the Platform gateway only and excludes outages, rate limits, discontinuation, or policy changes of upstream model providers.
- Any displayed balance, status, quota, or availability information may be delayed and does not create a guarantee of continued service.
- The Platform is not liable for failures, delays, interruptions, or discrepancies caused by upstream limits, upstream outages, network problems, risk-control triggers, third-party policy changes, force majeure, or customer-side misconfiguration.
- Enterprise credit, offline top-ups, reconciliation, and invoicing follow the service contract signed by both parties. Where the contract conflicts with these terms, the contract prevails.

## 7. Authenticity Commitment

- The Platform relays each request to the official or authorized upstream of the model you specify. We do not silently substitute or downgrade models, and we do not present unofficial sources as official ones.
- The Platform meters and bills according to the usage reported by the upstream. We do not inflate token counts or request counts. The mapping between upstream usage and Platform billing is published on the pricing page.
- If you find that model provenance or usage metering deviates from this commitment, contact us through Section 10. We will investigate and, once confirmed, correct and compensate.

## 8. Enforcement

- If the Platform determines that your activity presents policy violations, operational abuse, payment risk, dispute risk, upstream sanctions, policy conflicts, or other threats to the Platform, other users, or third parties, the Platform may restrict, suspend, or terminate some or all service without prior notice.
- For suspected illegal or abusive conduct, the Platform may retain logs, records, and supporting evidence, and may disclose them to competent authorities, payment processors, upstream providers, or compliance partners where permitted by law.

## 9. Updates

- The Platform may update these terms to reflect legal requirements, business changes, or upstream policy changes.
- Updated terms become effective upon publication. Continued use of the Platform constitutes acceptance of the revised version. Material changes are announced through in-app notices or email.

## 10. Contact Us

- Operator: ` + legalCompanyNameEN + `
- Email: ` + legalContactEmail + `
- For questions, complaints, or compliance inquiries about these terms, contact us at the address above.
`,
	}),
	PrivacyPolicy: mustMarshalLocalizedContent(map[string]string{
		"zh-CN": `# 隐私政策

生效日期：` + legalEffectiveDate + `

本隐私政策说明 TokenFunc（以下简称"本平台"，由 ` + legalCompanyName + ` 运营）如何收集、使用、保存和披露与你有关的信息。

## 1. 我们可能收集的信息

- 账号信息：邮箱地址、密码摘要、用户昵称、用户组、企业与组织归属、邀请关系及与注册相关的验证信息。
- 企业信息：企业名称、联系人、联系方式、开票信息、合同与授信相关记录。
- 身份验证信息：邮箱验证码、OAuth 登录结果、二次验证状态、Passkey 信息及必要的安全校验记录。
- 交易与账务信息：订单、充值、余额、授信、配额变动、账单、支付状态、支付渠道返回的必要信息及风控记录。
- 使用与请求元数据：请求时间、模型、渠道、调用结果、错误状态码、输入与输出 Token 数量、时延、限流命中、客户端来源、设备或浏览器相关标识、IP 地址及安全日志。
- 支持沟通信息：你提交给客服、工单、邮件或其他支持渠道的内容。

## 2. 我们不存储的内容

- 本平台不落盘存储你通过 API 发送的请求体、响应体与提示词；它们仅在内存中完成转发与计量后即被丢弃。
- 错误日志只记录状态码、错误类别与必要的诊断摘要，不保存完整的请求或响应内容。
- 如你在后续版本中使用需要异步执行的任务类功能，相关任务参数的保存策略将在功能上线前单独说明。

## 3. 我们如何使用这些信息

- 提供账号注册、登录、验证、充值、授信、配额管理、组织与项目管理、请求转发、用量统计、账单与运营支持。
- 识别滥用、异常流量、欺诈、盗刷、账号共享、凭证泄露和其他安全风险。
- 分析系统稳定性、渠道状态、错误率、限流与容量情况，以保障平台运行。
- 履行法律义务、处理争议、执行条款、配合合规审查或响应有权机关要求。

## 4. 信息共享与披露

- 为完成模型请求、支付、身份验证、通知发送或安全防护，我们可能将必要信息提供给上游模型提供方、支付服务商、身份验证服务商、邮件服务商、云基础设施与安全服务商。
- 转发至上游模型提供方的请求内容受该提供方的隐私政策与数据处理条款约束；我们优先选择承诺不以你的数据训练模型的官方接口。
- 我们不会因营销目的出售你的个人信息。
- 当法律法规、有权机关、司法程序、支付争议、风控调查、平台安全或他人合法权益保护所必需时，我们可能披露相关记录。

## 5. 存储与安全

- 我们会采取合理的技术和管理措施保护你的信息，包括访问控制、传输加密、日志审计、风险识别和凭证管理。
- 任何互联网传输和电子存储都无法保证绝对安全；你应同时采取适当措施保护自己的账号、邮箱、密码、Token 和 API Key。
- 出于审计、争议处理、合规、风控和运营分析需要，账务记录、用量元数据与安全记录可能在合理期限内保留。

## 6. 跨境与上游处理

- 本平台可能将请求转发至中国大陆以外的服务器、网络节点和第三方模型服务。
- 当你使用本平台时，即表示你理解并同意，为实现服务目的，相关数据可能在不同国家或地区处理。

## 7. 你的权利与选择

- 你可以在账号设置中查看、更新账号信息，并通过第 9 条的联系方式申请导出或删除你的账号数据；法律要求保留的账务与安全记录除外。
- 你应仅在企业内部经合法授权的范围内通过本平台处理数据，不得将本平台作为面向公众的 AI 服务进行投递；任何超出企业自用范围的对外开放使用，由此产生的数据合规、隐私保护与个人信息保护责任由你自行承担。
- 你应仅在拥有合法依据的前提下提交个人信息、业务数据或第三方数据，并确保你有权将相关数据通过本平台处理。
- 如你不接受本隐私政策或不同意相关跨境处理、上游处理或安全审计安排，请停止使用本平台。

## 8. 政策更新

- 我们可能基于法律要求、业务变化或安全需要更新本隐私政策。
- 更新后的版本发布后即生效；继续使用本平台视为你接受更新后的内容。重大变更将通过站内公告或邮件通知。

## 9. 联系我们

- 运营主体：` + legalCompanyName + `
- 联系邮箱：` + legalContactEmail + `
`,
		"en": `# Privacy Policy

Effective date: ` + legalEffectiveDate + `

This Privacy Policy explains how TokenFunc ("the Platform", operated by ` + legalCompanyNameEN + `) collects, uses, stores, and discloses information related to you.

## 1. Information We May Collect

- Account information: email address, password hash, display name, user group, enterprise and organization membership, referral relationship, and registration-related verification data.
- Enterprise information: company name, contact person, contact details, invoicing details, and contract or credit-related records.
- Authentication information: email verification records, OAuth sign-in results, two-factor status, passkey information, and necessary security-verification records.
- Billing and transaction information: orders, top-ups, balances, credit, quota changes, bills, payment status, necessary payment-provider metadata, and risk-control records.
- Usage and request metadata: request timestamps, model and channel selection, response outcome, error status codes, input and output token counts, latency, rate-limit events, client-source markers, device or browser-related identifiers, IP address, and security logs.
- Support information: content you provide through support tickets, email, or other support channels.

## 2. What We Do Not Store

- The Platform does not persist the request bodies, response bodies, or prompts you send through the API. They are relayed and metered in memory and then discarded.
- Error logs record only status codes, error categories, and minimal diagnostic summaries, never full request or response content.
- If asynchronous task features become available in a future release, the retention policy for their task parameters will be documented separately before launch.

## 3. How We Use Information

- To provide registration, sign-in, verification, top-ups, credit, quota management, organization and project management, request relay, usage analytics, billing, and operational support.
- To detect abuse, abnormal traffic, fraud, stolen payment activity, account sharing, credential leaks, and other security risks.
- To analyze platform stability, channel health, error rates, rate limiting, and capacity conditions.
- To comply with legal obligations, resolve disputes, enforce terms, support compliance reviews, or respond to lawful requests.

## 4. Sharing and Disclosure

- To complete model requests, payments, authentication, notifications, or security controls, we may share necessary data with upstream model providers, payment providers, identity providers, email vendors, cloud infrastructure providers, and security vendors.
- Request content relayed to an upstream model provider is governed by that provider's privacy policy and data-processing terms. We prefer official endpoints that commit not to train on your data.
- We do not sell your personal information for marketing purposes.
- We may disclose relevant records where required by law, lawful authority, judicial process, payment disputes, risk investigations, platform security needs, or the protection of lawful rights.

## 5. Storage and Security

- We use reasonable technical and organizational measures to protect information, including access control, encryption in transit, logging, risk detection, and credential management.
- No internet transmission or electronic storage method is absolutely secure. You remain responsible for protecting your account, email, password, tokens, and API keys.
- Billing records, usage metadata, and security records may be retained for a reasonable period for audit, dispute handling, compliance, risk control, and operational analysis.

## 6. Cross-Border and Upstream Processing

- The Platform may relay requests to servers, network paths, and third-party model providers located outside mainland China.
- By using the Platform, you understand and agree that relevant data may be processed in multiple countries or regions as necessary to provide the service.

## 7. Your Rights and Choices

- You can review and update your account information in account settings, and you may request an export or deletion of your account data through the contact in Section 9, except for billing and security records we are legally required to retain.
- You may use the Platform to process data only within the lawfully authorized internal scope of your enterprise. You must not use the Platform to deliver public-facing AI services. You bear sole responsibility for any data-compliance, privacy-protection, and personal-information-protection obligations arising from any use beyond internal enterprise use.
- You should only submit personal information, business data, or third-party data when you have a lawful basis to do so and the right to have that data processed through the Platform.
- If you do not agree with this Privacy Policy or the related cross-border, upstream-processing, or security-audit arrangements, you must stop using the Platform.

## 8. Updates

- We may update this Privacy Policy to reflect legal requirements, operational changes, or security needs.
- Updated versions become effective upon publication. Continued use of the Platform constitutes acceptance of the revised version. Material changes are announced through in-app notices or email.

## 9. Contact Us

- Operator: ` + legalCompanyNameEN + `
- Email: ` + legalContactEmail + `
`,
	}),
}

// DefaultAboutContent 是「关于」页的默认正文，口径与营销页保持一致。
var DefaultAboutContent = mustMarshalLocalizedContent(map[string]string{
	"zh-CN": `# 关于 TokenFunc

TokenFunc 是面向企业的大模型 API 网关。一个密钥接入 Claude、GPT、Gemini、xAI 等官方模型，为研发团队提供统一鉴权、稳定供给、透明计量与可追溯的账单。

## 我们的承诺

- **安全合规**：企业级访问控制、按组织与项目隔离的密钥、完整审计日志；不落盘存储请求体、响应体与提示词。
- **真实不掺假**：按你指定的模型转发至官方或授权上游，不替换、不降级；按上游返回的用量据实计费，不虚报 Token。
- **稳定供给**：多渠道冗余与自动故障切换，服务可用性承诺覆盖网关自身，上游状态在状态页公开。
- **高性能低延迟**：就近接入与连接复用，流式响应原样透传。
- **高缓存命中**：支持上游提示词缓存，帮助长上下文场景降低成本。

## 企业服务

- 组织、部门、项目与员工密钥的分级管理，用量按项目聚合，支持报表导出。
- 签署正式服务合同与数据处理协议（DPA），提供企业资质与安全文档用于供应商准入。
- 授信结算、线下充值、月度账单与发票。

## 联系我们

- 商务与技术支持：` + legalContactEmail + `
- 申请企业试用：返回首页提交试用申请，或[立即注册](/sign-up)体验。

## 合规说明

本平台服务不面向中国大陆公众开放，仅供企业客户内部使用。使用本平台即表示你同意[服务条款与使用政策](/user-agreement)与[隐私政策](/privacy-policy)。

运营主体：` + legalCompanyName + `
`,
	"en": `# About TokenFunc

TokenFunc is an enterprise-grade gateway for large language model APIs. One key gives your engineering teams access to official Claude, GPT, Gemini, and xAI models, with unified authentication, stable supply, transparent metering, and auditable billing.

## Our Commitments

- **Security and compliance**: enterprise access control, keys isolated by organization and project, complete audit logs; request bodies, response bodies, and prompts are never persisted.
- **Real models, no substitution**: every request is relayed to the official or authorized upstream of the model you specify. We never swap or downgrade models, and we bill exactly the usage the upstream reports.
- **Stable supply**: multi-channel redundancy with automatic failover. Our availability commitment covers the gateway itself, and upstream status is published on the status page.
- **High performance, low latency**: edge-close ingress with connection reuse; streaming responses are passed through untouched.
- **High cache hit rate**: upstream prompt caching is supported to cut cost on long-context workloads.

## Enterprise Services

- Hierarchical management of organizations, departments, projects, and employee keys, with usage aggregated per project and exportable reports.
- A formal service contract and Data Processing Agreement (DPA), plus company credentials and security documentation for vendor onboarding.
- Credit-based settlement, offline top-ups, monthly statements, and invoices.

## Contact Us

- Sales and technical support: ` + legalContactEmail + `
- Enterprise trial: submit a trial request from the home page, or [sign up](/sign-up) to get started.

## Compliance Notice

The Platform is not offered to the general public in mainland China and is intended for internal use by enterprise customers only. By using the Platform you agree to the [Terms of Service and Acceptable Use Policy](/user-agreement) and the [Privacy Policy](/privacy-policy).

Operator: ` + legalCompanyNameEN + `
`,
})

func mustMarshalLocalizedContent(content map[string]string) string {
	raw, err := common.Marshal(content)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}
