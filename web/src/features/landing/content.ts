/**
 * 营销页文案与演示数据（tokenfunc 二开）。
 *
 * 所有面向用户的字符串都是 i18n 的英文 key，组件里统一经 t() 渲染。
 * 首屏指标、延迟、缓存账单等演示数字是市场口径，集中在这里便于调整。
 */

/** Hero 打字机轮播的三条核心卖点，与下方三个主卖点一一对应 */
export const HERO_PHRASES = [
  'Real models, full strength',
  'Zero content retention',
  'Bills that reconcile line by line',
] as const

export type CompatibleTool = {
  /** 锚点：同时是 web/public/logos/tools/ 下的文件名 */
  id: string
  /** 工具名：产品名原样展示，只有 nameKey 存在时走 i18n */
  name: string
  nameKey?: string
  /** 文档中心 /docs/$slug 的 slug；没有专页的先指向工具概览 */
  docSlug: string
  /** 官方 logo 路径；null 时用首字母圆角占位 */
  logo: string | null
  /** 深色主题下改用的官方反白版本 */
  logoDark?: string
}

/** Hero 下方兼容工具滚动条，增删工具只改这里（Kiro、豆包 Work 暂不支持，不要加） */
export const COMPATIBLE_TOOLS: CompatibleTool[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    docSlug: 'tools-claude-code',
    logo: null,
  },
  { id: 'codex', name: 'Codex', docSlug: 'tools-codex', logo: null },
  { id: 'opencode', name: 'OpenCode', docSlug: 'tools-overview', logo: null },
  { id: 'openclaw', name: 'OpenClaw', docSlug: 'tools-openclaw', logo: null },
  { id: 'hermes', name: 'Hermes', docSlug: 'tools-hermes', logo: null },
  { id: 'cursor', name: 'Cursor', docSlug: 'tools-cursor', logo: null },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    docSlug: 'tools-workbuddy',
    logo: null,
  },
  {
    id: 'qwen-work',
    name: 'Qwen Work',
    nameKey: 'Qwen Work',
    docSlug: 'tools-overview',
    logo: null,
  },
  { id: 'kimi-work', name: 'Kimi Work', docSlug: 'tools-overview', logo: null },
  { id: 'cc-switch', name: 'CC Switch', docSlug: 'tools-overview', logo: null },
]

export type Capability = {
  /** 区块锚点 */
  id: 'fidelity' | 'privacy' | 'control'
  /** 序号标签，如 01 */
  index: string
  label: string
  title: string
  description: string
  points: string[]
}

/** 三个主卖点：与 Hero 三条打字卖点一一对应，桌面左右交替 */
export const CAPABILITIES: Capability[] = [
  {
    id: 'fidelity',
    index: '01',
    label: 'Real models',
    title: '100% fidelity, no downgrades',
    description:
      'Every channel group names its upstream source. No downgrades, swaps or rewrites — you get the upstream response as-is.',
    points: [
      'Sources labeled per group, no silent swaps',
      'Run a model self-check from the console anytime',
      'usage matches upstream billing line by line',
    ],
  },
  {
    id: 'privacy',
    index: '02',
    label: 'Data security',
    title: 'Data security: no content retained',
    // 黑鹰 2026-11-22 拍板：去掉手册里的「日志」，上线前再核错误日志与任务表
    description:
      'As a relay, we never store your request or response bodies. Content is forwarded in memory only and never written to a database or disk. We keep only the usage metadata needed for billing.',
    points: [
      'Request and response bodies are never stored',
      'Service agreement and DPA',
      'IP allowlists and source restrictions',
    ],
  },
  {
    id: 'control',
    index: '03',
    label: 'Reconcilable',
    title: 'Enterprise controls, bills that reconcile',
    description:
      'Team budgets, key ownership and itemized bills, all in one console.',
    points: [
      'Monthly team budgets with alerts and hard stops',
      'API keys owned by people, freezable and model-restricted',
      'Multi-dimensional bill export, prepaid or monthly, official VAT invoices',
    ],
  },
]

export type QualityCard = {
  id: 'supply' | 'cache' | 'performance'
  title: string
  description: string
}

/** 运行质量三张卡的标题与说明（数字见 QUALITY_METRICS），顺序：供应稳定 → 高缓存命中率 → 高性能 */
export const QUALITY_CARDS: QualityCard[] = [
  {
    id: 'supply',
    title: 'Reliable supply',
    description:
      'Every channel is checked before going live and monitored continuously; failing channels are pulled automatically. Upstreams run in parallel and fail over automatically, invisible to callers.',
  },
  {
    id: 'cache',
    title: 'High cache hit rate',
    description:
      'Session-affinity routing pins the same context to the same channel, and cache reads are billed at the cache price — a clear cost drop for long conversations and agents.',
  },
  {
    id: 'performance',
    title: 'High performance',
    description:
      'Multi-region access points in mainland China, persistent upstream connections, token-by-token streaming.',
  },
]

/**
 * 运行质量区的数字。全部是设计原型占位，不是实测值，上线前必须逐项确认（手册第 6 节）。
 * 后端目前没有能直接提供这些指标的公开接口；有接口后优先接接口，这里只作兜底。
 */
export const QUALITY_METRICS = {
  // TODO(黑鹰确认): 是否确有这四道检测，以及上线前检测 + 运行中巡检 + 自动下线流程
  admissionChecks: '4',
  // TODO(黑鹰确认): 长会话缓存命中率的统计口径与真实值
  cacheHitRate: '85%+',
  // TODO(黑鹰确认): 命中比例条宽度（百分比），需与 cacheHitRate 同口径
  cacheHitBarPercent: 87,
  // TODO(黑鹰确认): 首 token 延迟 P50 真实值（ms）
  ttftP50: '380',
  // TODO(黑鹰确认): 单请求输出速度真实值（tok/s），不同模型差别大，按模型还是取中位数
  tps: '80+',
  // TODO(黑鹰确认): 单组织吞吐上限（tok/min），是对外承诺的容量，必须与实际限流配置一致
  tpm: '10M+',
  // TODO(黑鹰确认): 控制台是否真能查到；查不到就把 showScope 改 false 删掉这句口径说明
  showScope: true,
} as const

/** 模型自检演示：厂商 Tab 与演示用模型 ID（与价目区保持一致） */
export const SELF_CHECK_MODELS: {
  key: 'claude' | 'gpt' | 'gemini' | 'grok'
  label: string
  id: string
}[] = [
  { key: 'claude', label: 'Claude', id: 'claude-sonnet-5-5' },
  { key: 'gpt', label: 'GPT', id: 'gpt-6.2-sol' },
  { key: 'gemini', label: 'Gemini', id: 'gemini-3.8-flash' },
  { key: 'grok', label: 'Grok', id: 'grok-4.7' },
]

/** 自检时序（毫秒）：每步 650，四步完成后停留 2600 再轮换到下一个厂商 */
export const SELF_CHECK_TIMING = { step: 650, hold: 2600 } as const

export const SELF_CHECK_STEPS = [
  'Model ID matches upstream response',
  'Context window matches spec',
  'Tool use and multimodal match',
  'usage matches upstream billing',
] as const

/** 留存对照：左列不存储，右列只存计费元数据（字段名是技术标识，不进 i18n） */
export const RETENTION_DISCARDED: { field: string; label: string }[] = [
  { field: 'messages', label: 'Request body' },
  { field: 'choices', label: 'Response body' },
]

export const RETENTION_KEPT: { field: string; label: string }[] = [
  { field: 'model', label: 'Model' },
  { field: 'usage.*_tokens', label: 'Token usage' },
  { field: 'created_at', label: 'Time' },
  { field: 'latency_ms', label: 'Latency' },
  { field: 'status_code', label: 'Status code' },
]

/** 团队预算演示（静态）：90% 告警阈值 */
export const BUDGET_DEMO = {
  period: '2026-11',
  thresholdPercent: 90,
  teams: [
    { name: 'R&D', used: '$7,840', budget: '$12,000', percent: 65 },
    { name: 'Data', used: '$5,530', budget: '$6,000', percent: 92 },
    { name: 'Product', used: '$740', budget: '$2,000', percent: 37 },
  ],
  /**
   * 账单明细：金额按两个模型当前官方价算出（输入 $2、缓存读取 $0.10、输出 $10 / 1M token），
   * 改模型或 token 数时要重算。
   */
  bills: [
    {
      model: 'claude-sonnet-5-5',
      team: 'R&D',
      owner: 'Li Na',
      key: 'sk-…a91c',
      input: '1,204',
      cacheRead: '18,560',
      output: '642',
      amount: '$0.0107',
    },
    {
      model: 'gpt-6.2-sol',
      team: 'Data',
      owner: 'Wang Qiang',
      key: 'sk-…07e2',
      input: '3,420',
      cacheRead: '12,800',
      output: '1,150',
      amount: '$0.0196',
    },
  ],
}

export type ManagementTab = {
  key: 'org' | 'team' | 'project' | 'finance'
  label: string
  title: string
  description: string
  points: string[]
  columns: string[]
  rows: string[][]
}

export const MANAGEMENT_TABS: ManagementTab[] = [
  {
    key: 'org',
    label: 'Organization',
    title: 'Organization',
    description:
      'Members, roles and permissions in one place; revoke keys in one click when someone leaves.',
    points: [
      'Owner / admin / member / finance roles',
      'Member invitations and bulk import',
      'Keys belong to people and can be frozen at any time',
    ],
    columns: ['Member', 'Role', 'Team', 'Keys'],
    rows: [
      ['Zhang Wei', 'Owner', '—', '2'],
      ['Li Na', 'Admin', 'R&D Center', '4'],
      ['Wang Qiang', 'Member', 'Algorithm Team', '3'],
      ['Chen Jing', 'Finance', 'Finance Dept.', '0'],
    ],
  },
  {
    key: 'team',
    label: 'Teams',
    title: 'Teams',
    description:
      'Budgets per team, alerts near the limit, and automatic cut-off when exceeded.',
    points: [
      'Monthly budget per team',
      'Quota alerts and overage circuit breaker',
      'Team usage ranking',
    ],
    columns: ['Team', 'Members', 'Monthly budget', 'Used'],
    rows: [
      ['R&D Center', '24', '$12,000', '$7,840'],
      ['Algorithm Team', '9', '$6,000', '$5,530'],
      ['Support Platform', '6', '$2,000', '$740'],
      ['Marketing', '4', '$800', '$170'],
    ],
  },
  {
    key: 'project',
    label: 'Projects',
    title: 'Projects',
    description:
      'Independent keys, model allowlists and rate-limit policies for every project.',
    points: [
      'Project-level API keys',
      'Model allowlist',
      'RPM / TPM rate limits',
    ],
    columns: ['Project', 'Keys', 'Models', 'RPM limit'],
    rows: [
      ['Customer Support Bot', '3', '2 models', '2,000'],
      ['Code Assistant', '5', '1 model', '1,000'],
      ['Document Search', '2', '3 models', '500'],
      ['Data Labeling', '1', '1 model', '4,000'],
    ],
  },
  {
    key: 'finance',
    label: 'Finance reconciliation',
    title: 'Finance reconciliation',
    description:
      'Bills by organization, team, project and key, with exportable line items.',
    points: [
      'Multi-dimensional bills and line-item export',
      'Prepaid or monthly settlement',
      'VAT invoices (general / special)',
    ],
    columns: ['Period', 'Tokens', 'Amount', 'Status'],
    rows: [
      ['2026-09', '1.82B', '$25,890.00', 'Awaiting invoice'],
      ['2026-08', '1.64B', '$23,755.00', 'Settled'],
      ['2026-07', '1.31B', '$19,428.00', 'Settled'],
      ['2026-06', '1.07B', '$15,640.00', 'Settled'],
    ],
  },
]

export const ENTERPRISE_SERVICES: {
  icon: 'file-check' | 'server' | 'headset'
  title: string
  description: string
}[] = [
  {
    icon: 'file-check',
    title: 'Compliant procurement',
    description:
      'Formal contract and DPA, aligned with vendor onboarding and corporate purchasing.',
  },
  {
    icon: 'server',
    title: 'Dedicated deployment',
    description:
      'Exclusive pools, dedicated lines and your own domain; private deployment available.',
  },
  {
    icon: 'headset',
    title: 'Migration and support',
    description:
      'Engineers help with a smooth migration, a dedicated support group, and 24×7 incident on-call.',
  },
]

export const QUICKSTART_STEPS: { title: string; description: string }[] = [
  { title: 'Create a key', description: 'Generate an API key in the console' },
  {
    title: 'Replace base_url',
    description:
      'Compatible with the OpenAI / Anthropic protocols, works with SDKs and agents',
  },
  {
    title: 'Call by model name',
    description:
      'The model name is the route; existing code and tools need no changes',
  },
]

export type SnippetGroup = 'sdk' | 'code' | 'office'

export const SNIPPET_GROUPS: { key: SnippetGroup; label: string }[] = [
  { key: 'sdk', label: 'SDKs' },
  { key: 'code', label: 'Coding agents' },
  { key: 'office', label: 'Office agents' },
]

export type Snippet = {
  key: string
  group: SnippetGroup
  model: 'claude' | 'gpt' | 'gemini' | 'grok'
  /** 代码模板，{{base}} 会被替换成当前站点的 API 地址 */
  code: string
}

const KEY = 'sk-••••••••'

export const SNIPPETS: Snippet[] = [
  {
    key: 'Python',
    group: 'sdk',
    model: 'claude',
    code: `from openai import OpenAI

client = OpenAI(
    base_url="{{base}}/v1",
    api_key="${KEY}",
)

resp = client.chat.completions.create(
    model="claude-sonnet-4.5",
    messages=[{"role": "user", "content": "Describe tokenfunc in one sentence"}],
    stream=True,
)`,
  },
  {
    key: 'Node',
    group: 'sdk',
    model: 'gpt',
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "{{base}}/v1",
  apiKey: process.env.TF_KEY,
});

await client.chat.completions.create({
  model: "gpt-5",
  messages: [{ role: "user", content: "Describe tokenfunc in one sentence" }],
  stream: true,
});`,
  },
  {
    key: 'cURL',
    group: 'sdk',
    model: 'gemini',
    code: `curl {{base}}/v1/chat/completions \\
  -H "Authorization: Bearer $TF_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [{"role": "user", "content": "Describe tokenfunc in one sentence"}],
    "stream": true
  }'`,
  },
  {
    key: 'Claude Code',
    group: 'code',
    model: 'claude',
    code: `# Export the variables, then launch
export ANTHROPIC_BASE_URL="{{base}}"
export ANTHROPIC_AUTH_TOKEN="${KEY}"

claude`,
  },
  {
    key: 'Codex',
    group: 'code',
    model: 'gpt',
    code: `# ~/.codex/config.toml
model = "gpt-5-codex"
model_provider = "tokenfunc"

[model_providers.tokenfunc]
name = "tokenfunc"
base_url = "{{base}}/v1"
env_key = "TF_KEY"
wire_api = "responses"

# Terminal
export TF_KEY="${KEY}"
codex`,
  },
  {
    key: 'Cursor',
    group: 'code',
    model: 'claude',
    code: `# Settings → Models → API Keys

OpenAI API Key:
  ${KEY}

Override OpenAI Base URL:
  {{base}}/v1`,
  },
  {
    key: 'Cline',
    group: 'code',
    model: 'claude',
    code: `# API Provider: OpenAI Compatible

Base URL:  {{base}}/v1
API Key:   ${KEY}
Model ID:  claude-sonnet-4.5`,
  },
  {
    key: 'OpenClaw',
    group: 'code',
    model: 'claude',
    code: `// ~/.openclaw/openclaw.json
{
  "models": {
    "providers": {
      "tokenfunc": {
        "baseUrl": "{{base}}/v1",
        "apiKey": "${KEY}",
        "api": "openai-completions",
        "models": [{ "id": "claude-sonnet-4.5" }]
      }
    }
  }
}`,
  },
  {
    key: 'WorkBuddy',
    group: 'office',
    model: 'claude',
    code: `# Settings → Models → Add custom model

Type:      OpenAI compatible
Base URL:  {{base}}/v1
API Key:   ${KEY}
Model:     claude-sonnet-4.5`,
  },
  {
    key: 'Qwen Work',
    group: 'office',
    model: 'gpt',
    code: `# Settings → Model services → Custom

Type:      OpenAI compatible
Base URL:  {{base}}/v1
API Key:   ${KEY}
Model:     gpt-5`,
  },
  {
    key: 'Doubao Work',
    group: 'office',
    model: 'gemini',
    code: `# Settings → Models → Third-party model

Type:      OpenAI compatible
Base URL:  {{base}}/v1
API Key:   ${KEY}
Model:     gemini-2.5-pro`,
  },
  {
    key: 'Kimi Work',
    group: 'office',
    model: 'claude',
    code: `# Settings → Models → Custom API

Type:      OpenAI compatible
Base URL:  {{base}}/v1
API Key:   ${KEY}
Model:     claude-sonnet-4.5`,
  },
]

/** 快速接入右侧的模拟流式回复 */
export const PLAYGROUND_REPLIES: Record<
  Snippet['model'],
  { id: string; ttft: number; text: string }
> = {
  claude: {
    id: 'claude-sonnet-4.5',
    ttft: 412,
    text: 'tokenfunc is an enterprise model gateway: one API key and one base_url to call Claude, GPT, Gemini and Grok with unified billing and management.',
  },
  gpt: {
    id: 'gpt-5',
    ttft: 520,
    text: 'tokenfunc puts the major overseas models behind one OpenAI-compatible endpoint, with consolidated settlement and corporate invoicing.',
  },
  gemini: {
    id: 'gemini-2.5-pro',
    ttft: 640,
    text: 'tokenfunc gives domestic teams stable access to Claude, GPT, Gemini and Grok, metered by token in real time.',
  },
  grok: {
    id: 'grok-4',
    ttft: 580,
    text: 'tokenfunc: one integration for models from four vendors; pools fail over automatically and there is only one bill.',
  },
}

export const PRICING_PLANS: {
  key: 'payg' | 'enterprise'
  eyebrow: string
  price: string
  priceSuffix?: string
  points: string[]
  cta: string
  highlight: boolean
}[] = [
  {
    key: 'payg',
    eyebrow: 'Pay as you go',
    price: '$0',
    priceSuffix: 'to start',
    points: [
      'All models at official prices',
      'Online top-up · electronic invoices',
      'Usage dashboard',
    ],
    cta: 'Sign up free',
    highlight: false,
  },
  {
    key: 'enterprise',
    eyebrow: 'Enterprise',
    price: 'Custom',
    points: [
      'Dedicated pools and SLA credits',
      'Prepaid from 10% off · or monthly settlement',
      'Bank transfer · VAT special invoices',
      'Dedicated technical support',
    ],
    cta: 'Contact sales',
    highlight: true,
  },
]

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Do you support bank transfers and invoices?',
    answer:
      'Yes. Enterprises can choose prepaid or monthly settlement, and we issue VAT general and special invoices.',
  },
  {
    question: 'Can you work with enterprise compliance and procurement?',
    answer:
      'We sign a formal service contract and a Data Processing Agreement (DPA), and provide company credentials and security documentation for vendor onboarding.',
  },
  {
    question: 'Is migrating from another platform hard?',
    answer:
      'The protocols are compatible, so usually only base_url and api_key change. Enterprise customers get engineer assistance and can migrate part of the traffic first.',
  },
  {
    question: 'What happens if the SLA is missed?',
    answer:
      'Enterprise contracts define the monthly availability; shortfalls are credited under the contract terms.',
  },
]

export const LEAD_VOLUMES: {
  value: 'lt_1k' | '1k_10k' | 'gt_10k'
  label: string
}[] = [
  { value: 'lt_1k', label: '< $1,000 / month' },
  { value: '1k_10k', label: '$1,000–10,000 / month' },
  { value: 'gt_10k', label: '> $10,000 / month' },
]

/** 模型价目只展示这四家厂商（按 vendor_name 模糊匹配） */
export const LANDING_VENDORS: { key: string; label: string; match: RegExp }[] =
  [
    { key: 'anthropic', label: 'Claude', match: /anthropic|claude/i },
    { key: 'openai', label: 'GPT', match: /openai|gpt/i },
    { key: 'google', label: 'Gemini', match: /google|gemini/i },
    { key: 'xai', label: 'Grok', match: /xai|x\.ai|grok/i },
  ]
