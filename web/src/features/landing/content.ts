/**
 * 营销页文案与演示数据（tokenfunc 二开）。
 *
 * 所有面向用户的字符串都是 i18n 的英文 key，组件里统一经 t() 渲染。
 * 首屏不放任何数字；demo 卡里的数字是可在控制台复现的演示数据，
 * 运行质量数字（QUALITY_METRICS）是待确认的占位，价目是手工维护的静态官方价。
 */

/**
 * Hero 固定标题：三个企业刚需直接摆出来，
 * 依次对应下方 01 真模型、运行质量区的供应稳定、02 数据安全。
 */
export const HERO_TITLE = 'Real models. Reliable supply. Secure data.'

/**
 * Hero 标题下方打字机轮播的副句：性能、缓存、数据安全、对公对账。
 * 不放数字；性能与缓存是定性说法，口径与下方运行质量区的卡片标题一致。
 */
export const HERO_PHRASES = [
  'High performance, low latency',
  'High cache hit rate, lower cost',
  'Secure data, no content archived',
  'VAT invoices, bills that reconcile',
] as const

/** 读屏用的完整句：可视的打字区对辅助技术隐藏，全部副句由这一句完整读出 */
export const HERO_PHRASES_SUMMARY =
  'High performance and low latency, a high cache hit rate at lower cost, secure data with no content archived, and VAT invoices with bills that reconcile'

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
    logo: '/logos/tools/claude-code.svg',
  },
  {
    id: 'codex',
    name: 'Codex',
    docSlug: 'tools-codex',
    logo: '/logos/tools/codex.png',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    docSlug: 'tools-overview',
    logo: '/logos/tools/opencode.svg',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    docSlug: 'tools-openclaw',
    logo: '/logos/tools/openclaw.svg',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    docSlug: 'tools-hermes',
    logo: '/logos/tools/hermes.png',
    logoDark: '/logos/tools/hermes-dark.png',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    docSlug: 'tools-cursor',
    logo: '/logos/tools/cursor.svg',
    logoDark: '/logos/tools/cursor-dark.svg',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    docSlug: 'tools-workbuddy',
    logo: '/logos/tools/workbuddy.svg',
  },
  {
    id: 'qwen-work',
    name: 'Qwen Work',
    nameKey: 'Qwen Work',
    docSlug: 'tools-overview',
    logo: '/logos/tools/qwen-work.png',
  },
  {
    id: 'kimi-work',
    name: 'Kimi Work',
    docSlug: 'tools-overview',
    logo: '/logos/tools/kimi-work.png',
  },
  {
    id: 'cc-switch',
    name: 'CC Switch',
    docSlug: 'tools-overview',
    logo: '/logos/tools/cc-switch.svg',
  },
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

export const QUICKSTART_STEPS: { title: string; description: string }[] = [
  {
    title: 'Create a key',
    description: 'Generate an sk- API key in the console',
  },
  {
    title: 'Replace base_url',
    description:
      'OpenAI and Anthropic compatible — the highlighted line is the only change',
  },
  {
    title: 'Call by model name',
    description:
      'The model name is the route; existing code and tools work as-is',
  },
]

/** 接入区代码片段：代码不进 i18n；{{base}} 替换成当前站点 API 地址，含该地址的行会高亮 */
export type Snippet = { key: string; code: string }

const KEY = 'sk-••••••••'

export const SNIPPETS: Snippet[] = [
  {
    key: 'Python',
    code: `from openai import OpenAI

client = OpenAI(
    base_url="{{base}}/v1",
    api_key="${KEY}",
)

resp = client.chat.completions.create(
    model="claude-sonnet-5-5",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`,
  },
  {
    key: 'Node',
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "{{base}}/v1",
  apiKey: process.env.TF_KEY,
});

const resp = await client.chat.completions.create({
  model: "gpt-6.2-sol",
  messages: [{ role: "user", content: "你好" }],
});
console.log(resp.choices[0].message.content);`,
  },
  {
    key: 'cURL',
    code: `curl {{base}}/v1/chat/completions \\
  -H "Authorization: Bearer $TF_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.8-flash",
    "messages": [{"role": "user", "content": "你好"}]
  }'`,
  },
  {
    key: 'Claude Code',
    code: `# 终端中设置环境变量后直接启动
export ANTHROPIC_BASE_URL="{{base}}"
export ANTHROPIC_AUTH_TOKEN="${KEY}"

claude`,
  },
]

export const LEAD_VOLUMES: {
  value: 'lt_1k' | '1k_10k' | 'gt_10k'
  label: string
}[] = [
  { value: 'lt_1k', label: '< $1k/mo' },
  { value: '1k_10k', label: '$1k–10k/mo' },
  { value: 'gt_10k', label: '> $10k/mo' },
]

/** 每 1M token 的美元价格 */
export type ModelPrice = { input: number; cacheRead: number; output: number }

export type FeaturedVendor = {
  key: 'claude' | 'gpt' | 'gemini' | 'grok'
  label: string
  /** 厂商名（品牌名，不进 i18n） */
  vendor: string
  /** 该厂商的计费注脚（i18n key） */
  note: string
  models: { id: string; tag: string; price: ModelPrice }[]
}

/**
 * 价目区静态价目：各家官方当前主力模型与官方标准价（USD / 1M token，2026-11-22 核对）。
 * 黑鹰 2026-11-22 拍板改用静态数据，不再读 /api/pricing；上游调价时手工改这里。
 * 已知待改：gemini-4-argon 2026-12-01 起 $4 / $0.20 / $20；gemini-3.8-flash 2027-01-01 起 $1.50 / $0.15 / $7.50。
 */
export const FEATURED_MODELS: FeaturedVendor[] = [
  {
    key: 'claude',
    label: 'Claude',
    vendor: 'Anthropic',
    note: 'claude-haiku-5-5 is priced for prompts up to 100K tokens; longer prompts use the long-prompt price.',
    models: [
      {
        id: 'claude-fable-5-2',
        tag: 'Top tier',
        price: { input: 8, cacheRead: 0.2, output: 40 },
      },
      {
        id: 'claude-opus-5-5',
        tag: 'Flagship',
        price: { input: 4, cacheRead: 0.2, output: 20 },
      },
      {
        id: 'claude-sonnet-5-5',
        tag: 'Balanced',
        price: { input: 2, cacheRead: 0.1, output: 10 },
      },
      {
        id: 'claude-haiku-5-5',
        tag: 'Lite',
        price: { input: 0.1, cacheRead: 0.01, output: 0.5 },
      },
    ],
  },
  {
    key: 'gpt',
    label: 'GPT',
    vendor: 'OpenAI',
    note: 'Standard short-context price; long context and Fast mode follow upstream rules.',
    models: [
      {
        id: 'gpt-6.2-astra',
        tag: 'Flagship',
        price: { input: 8, cacheRead: 0.4, output: 40 },
      },
      {
        id: 'gpt-6.2-sol',
        tag: 'Balanced',
        price: { input: 2, cacheRead: 0.1, output: 10 },
      },
      {
        id: 'gpt-6.1-terra',
        tag: 'Fast',
        price: { input: 1, cacheRead: 0.05, output: 5 },
      },
      {
        id: 'gpt-6-luna',
        tag: 'Lite',
        price: { input: 0.1, cacheRead: 0.01, output: 0.5 },
      },
    ],
  },
  {
    key: 'gemini',
    label: 'Gemini',
    vendor: 'Google',
    // 黑鹰 2026-11-22 拍板：不写调价日期，用通用说法
    note: 'Prices follow upstream adjustments; the price shown here is current.',
    models: [
      {
        id: 'gemini-4-argon',
        tag: 'Flagship',
        price: { input: 2, cacheRead: 0.1, output: 10 },
      },
      {
        id: 'gemini-3.8-flash',
        tag: 'Balanced',
        price: { input: 0.75, cacheRead: 0.075, output: 3.75 },
      },
      {
        id: 'gemini-3.5-flash-lite',
        tag: 'Lite',
        price: { input: 0.3, cacheRead: 0.03, output: 2.5 },
      },
    ],
  },
  {
    key: 'grok',
    label: 'Grok',
    vendor: 'xAI',
    note: 'Standard short-context price; prompts over 200K tokens use the long-context price.',
    models: [
      {
        id: 'grok-4.7',
        tag: 'Flagship',
        price: { input: 2, cacheRead: 0.5, output: 6 },
      },
      {
        id: 'grok-build-0.1',
        tag: 'Coding',
        price: { input: 1, cacheRead: 0.2, output: 2 },
      },
      {
        id: 'grok-4.3',
        tag: 'Long context',
        price: { input: 1.25, cacheRead: 0.2, output: 2.5 },
      },
    ],
  },
]
