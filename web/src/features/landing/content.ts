/**
 * 营销页文案与演示数据（tokenfunc 二开）。
 *
 * 所有面向用户的字符串都是 i18n 的英文 key，组件里统一经 t() 渲染。
 * 首屏指标、延迟、缓存账单等演示数字是市场口径，集中在这里便于调整。
 */

export const HERO_PHRASES = [
  'High performance, low latency',
  'Stable supply',
  'Security and compliance',
  'Real models, no substitution',
  'High cache hit rate',
  'Enterprise-grade control',
] as const

export const HERO_STATS: { value: string; label: string }[] = [
  { value: '99.95%', label: 'Monthly availability SLA' },
  { value: '380ms', label: 'First-token latency P50' },
  { value: '90%+', label: 'Prompt cache hit rate' },
  { value: '500+', label: 'Official subscription pool' },
]

export type Capability = {
  id: 'security' | 'fidelity' | 'supply' | 'performance' | 'cache'
  eyebrow: string
  title: string
  description: string
  points: string[]
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'security',
    eyebrow: '01 · Security',
    title: 'Security and compliance',
    description:
      'Request and response bodies are only relayed in memory and never written to disk. The platform keeps only the usage metadata needed for billing.',
    points: [
      'Request data never touches disk',
      'Service contract and Data Processing Agreement (DPA)',
      'IP allowlist and origin restrictions',
    ],
  },
  {
    id: 'fidelity',
    eyebrow: '02 · Fidelity',
    title: 'Real models, no substitution',
    description:
      'Official API keys connect directly to each vendor. The model you request is the model that runs: no downgrade, no swap, and the upstream response is returned untouched.',
    points: [
      'Official keys, no reverse-engineered endpoints',
      'Run a model self-check from the console at any time',
    ],
  },
  {
    id: 'supply',
    eyebrow: '03 · Supply',
    title: 'Stable supply',
    description:
      '500+ official subscription accounts across multiple upstream channels serve in parallel. If one pool errors or times out, the request moves to the next one with no change on the caller side.',
    points: [],
  },
  {
    id: 'performance',
    eyebrow: '04 · Performance',
    title: 'High performance, low latency',
    description:
      'Multiple domestic access points, reused long-lived upstream connections, and token-by-token streaming so the first chunk never waits.',
    points: [
      'Multiple domestic access points',
      'Connection reuse · streaming passthrough',
      'No queueing under high concurrency',
    ],
  },
  {
    id: 'cache',
    eyebrow: '05 · Cache',
    title: 'High cache hit rate',
    description:
      'Session-affinity routing pins the same context to the same pool so prompt cache keeps hitting, averaging 90%+.',
    points: [
      'Cache reads are priced separately',
      'Every bill line matches upstream usage',
    ],
  },
]

/** 留存字段演示：哪些数据经过网关会被记录 */
export const RETENTION_ROWS: { field: string; kept: boolean; note: string }[] =
  [
    { field: 'Request body · messages', kept: false, note: 'Not retained' },
    { field: 'Response body · choices', kept: false, note: 'Not retained' },
    { field: 'Model · token usage', kept: true, note: 'For billing' },
    {
      field: 'Time · latency · status code',
      kept: true,
      note: 'For reconciliation',
    },
  ]

export const SELF_CHECK_MODELS: {
  key: 'claude' | 'gpt' | 'gemini' | 'grok'
  id: string
  context: string
}[] = [
  { key: 'claude', id: 'claude-sonnet-4.5', context: '200K' },
  { key: 'gpt', id: 'gpt-5', context: '400K' },
  { key: 'gemini', id: 'gemini-2.5-pro', context: '1M' },
  { key: 'grok', id: 'grok-4', context: '256K' },
]

export const SELF_CHECK_STEPS = [
  'Model identifier matches upstream response',
  'Context window {{context}} verified',
  'Tool calling and multimodal capabilities match',
  'usage matches the upstream bill line by line',
] as const

export const FAILOVER_CHANNELS: {
  name: string
  size: string
  latency: number
  availability: string
}[] = [
  {
    name: 'Official · primary pool',
    size: '128 accounts',
    latency: 412,
    availability: '99.99%',
  },
  {
    name: 'Official · standby pool',
    size: '64 accounts',
    latency: 436,
    availability: '99.97%',
  },
  {
    name: 'Official · dedicated pool',
    size: '16 accounts',
    latency: 398,
    availability: '99.99%',
  },
]

export const LATENCY_ROWS: {
  model: string
  p50: number
  p95: number
  width: number
}[] = [
  { model: 'claude-sonnet-4.5', p50: 380, p95: 690, width: 48 },
  { model: 'gpt-5', p50: 420, p95: 760, width: 53 },
  { model: 'gemini-2.5-flash', p50: 290, p95: 540, width: 36 },
  { model: 'grok-4-fast', p50: 310, p95: 580, width: 39 },
]

export const CACHE_BILL = {
  model: 'claude-sonnet-4.5',
  hitPercent: 93.9,
  rows: [
    { label: 'Input · cache miss', tokens: '1,204', cost: '$0.0036' },
    { label: 'Input · cache read', tokens: '18,560', cost: '$0.0056' },
    { label: 'Output', tokens: '642', cost: '$0.0096' },
  ],
  listTotal: '$0.0689',
  total: '$0.0188',
  savedPercent: '72.7%',
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
