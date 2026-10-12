/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export type SampleLang = 'curl' | 'python' | 'typescript' | 'javascript'

export const SAMPLE_LANGS: SampleLang[] = [
  'curl',
  'python',
  'typescript',
  'javascript',
]

export const SAMPLE_LANG_LABELS: Record<SampleLang, string> = {
  curl: 'cURL',
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
}

export type DocsSampleContext = {
  baseUrl: string
  apiKeyEnv?: string
  model?: string
}

/** Example model names used in samples; replace with any model on your site. */
export const SAMPLE_MODELS = {
  openai: 'gpt-5.2',
  anthropic: 'claude-sonnet-4-5',
  image: 'gpt-image-1',
}

function envName(ctx: DocsSampleContext): string {
  return ctx.apiKeyEnv || 'TOKENFUNC_API_KEY'
}

function modelOf(ctx: DocsSampleContext, fallback: string): string {
  return ctx.model || fallback
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

// ---------------------------------------------------------------------------
// GET /v1/models
// ---------------------------------------------------------------------------

export function buildModelsSample(
  lang: SampleLang,
  ctx: DocsSampleContext
): string {
  const url = `${trimBase(ctx.baseUrl)}/v1/models`
  const key = envName(ctx)
  if (lang === 'curl') {
    return [`curl ${url}`, `  -H "Authorization: Bearer $\{${key}}"`].join('\n')
  }
  if (lang === 'python') {
    return [
      'import os',
      '',
      'from openai import OpenAI',
      '',
      `client = OpenAI(`,
      `    base_url="${trimBase(ctx.baseUrl)}/v1",`,
      `    api_key=os.environ["${key}"],`,
      ')',
      '',
      'for model in client.models.list():',
      '    print(model.id)',
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      "import OpenAI from 'openai'",
      '',
      'const client = new OpenAI({',
      `  baseURL: '${trimBase(ctx.baseUrl)}/v1',`,
      `  apiKey: process.env.${key},`,
      '})',
      '',
      'const models = await client.models.list()',
      'for (const model of models.data) {',
      '  console.log(model.id)',
      '}',
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  headers: { Authorization: \`Bearer \${process.env.${key}}\` },`,
    '})',
    '',
    'const { data } = await response.json()',
    'console.log(data.map((model) => model.id))',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// POST /v1/chat/completions
// ---------------------------------------------------------------------------

export function buildChatCompletionsSample(
  lang: SampleLang,
  ctx: DocsSampleContext,
  options?: { stream?: boolean }
): string {
  const url = `${trimBase(ctx.baseUrl)}/v1/chat/completions`
  const key = envName(ctx)
  const model = modelOf(ctx, SAMPLE_MODELS.openai)
  const stream = options?.stream === true
  const bodyLines = [
    `    "model": "${model}",`,
    `    "messages": [`,
    `      { "role": "user", "content": "Hello!" }`,
    `    ]${stream ? ',' : ''}`,
  ]
  if (stream) bodyLines.push(`    "stream": true`)

  if (lang === 'curl') {
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $\{${key}}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{`,
      ...bodyLines,
      `  }'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return stream
      ? [
          'import os',
          '',
          'from openai import OpenAI',
          '',
          'client = OpenAI(',
          `    base_url="${trimBase(ctx.baseUrl)}/v1",`,
          `    api_key=os.environ["${key}"],`,
          ')',
          '',
          'stream = client.chat.completions.create(',
          `    model="${model}",`,
          '    messages=[{"role": "user", "content": "Hello!"}],',
          '    stream=True,',
          ')',
          '',
          'for chunk in stream:',
          '    print(chunk.choices[0].delta.content or "", end="")',
        ].join('\n')
      : [
          'import os',
          '',
          'from openai import OpenAI',
          '',
          'client = OpenAI(',
          `    base_url="${trimBase(ctx.baseUrl)}/v1",`,
          `    api_key=os.environ["${key}"],`,
          ')',
          '',
          'response = client.chat.completions.create(',
          `    model="${model}",`,
          '    messages=[{"role": "user", "content": "Hello!"}],',
          ')',
          '',
          'print(response.choices[0].message.content)',
        ].join('\n')
  }
  if (lang === 'typescript') {
    return stream
      ? [
          "import OpenAI from 'openai'",
          '',
          'const client = new OpenAI({',
          `  baseURL: '${trimBase(ctx.baseUrl)}/v1',`,
          `  apiKey: process.env.${key},`,
          '})',
          '',
          'const stream = await client.chat.completions.create({',
          `  model: '${model}',`,
          `  messages: [{ role: 'user', content: 'Hello!' }],`,
          '  stream: true,',
          '})',
          '',
          'for await (const chunk of stream) {',
          '  process.stdout.write(chunk.choices[0]?.delta?.content ?? "")',
          '}',
        ].join('\n')
      : [
          "import OpenAI from 'openai'",
          '',
          'const client = new OpenAI({',
          `  baseURL: '${trimBase(ctx.baseUrl)}/v1',`,
          `  apiKey: process.env.${key},`,
          '})',
          '',
          'const response = await client.chat.completions.create({',
          `  model: '${model}',`,
          `  messages: [{ role: 'user', content: 'Hello!' }],`,
          '})',
          '',
          'console.log(response.choices[0].message.content)',
        ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${key}}\`,`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify({`,
    `    model: '${model}',`,
    `    messages: [{ role: 'user', content: 'Hello!' }],${
      stream ? `\n    stream: true,` : ''
    }`,
    `  }),`,
    `})`,
    '',
    stream
      ? `// Parse the SSE stream: data chunks separated by blank lines`
      : `const data = await response.json()`,
    ...(stream
      ? ['// Each "data:" line carries one chat.completion.chunk JSON object']
      : [`console.log(data.choices[0].message.content)`]),
  ].join('\n')
}

// ---------------------------------------------------------------------------
// POST /v1/messages (Anthropic Messages)
// ---------------------------------------------------------------------------

export function buildMessagesSample(
  lang: SampleLang,
  ctx: DocsSampleContext,
  options?: { stream?: boolean }
): string {
  const url = `${trimBase(ctx.baseUrl)}/v1/messages`
  const key = envName(ctx)
  const model = modelOf(ctx, SAMPLE_MODELS.anthropic)
  const stream = options?.stream === true

  if (lang === 'curl') {
    return [
      `curl ${url} \\`,
      `  -H "x-api-key: $\{${key}}" \\`,
      `  -H "anthropic-version: 2023-06-01" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{`,
      `    "model": "${model}",`,
      `    "max_tokens": 1024,`,
      `    "messages": [`,
      `      { "role": "user", "content": "Hello!" }`,
      `    ]${stream ? ',' : ''}`,
      ...(stream ? [`    "stream": true`] : []),
      `  }'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'import os',
      '',
      'from anthropic import Anthropic',
      '',
      'client = Anthropic(',
      `    base_url="${trimBase(ctx.baseUrl)}",`,
      `    api_key=os.environ["${key}"],`,
      ')',
      '',
      stream
        ? 'stream = client.messages.stream('
        : 'message = client.messages.create(',
      `    model="${model}",`,
      '    max_tokens=1024,',
      '    messages=[{"role": "user", "content": "Hello!"}],',
      ...(stream
        ? [
            '    )',
            '',
            'for text in stream.text_stream:',
            '    print(text, end="")',
          ]
        : [')', '', 'print(message.content[0].text)']),
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      "import Anthropic from '@anthropic-ai/sdk'",
      '',
      'const client = new Anthropic({',
      `  baseURL: '${trimBase(ctx.baseUrl)}',`,
      `  apiKey: process.env.${key},`,
      '})',
      '',
      stream
        ? 'const stream = client.messages.stream({'
        : 'const message = await client.messages.create({',
      `  model: '${model}',`,
      '  max_tokens: 1024,',
      `  messages: [{ role: 'user', content: 'Hello!' }],`,
      ...(stream
        ? ['})', '', 'stream.on("text", (text) => process.stdout.write(text))']
        : ['})', '', 'console.log(message.content[0].text)']),
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    'x-api-key': process.env.${key},`,
    `    'anthropic-version': '2023-06-01',`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify({`,
    `    model: '${model}',`,
    `    max_tokens: 1024,`,
    `    messages: [{ role: 'user', content: 'Hello!' }],${
      stream ? `\n    stream: true,` : ''
    }`,
    `  }),`,
    `})`,
    '',
    `const message = await response.json()`,
    `console.log(message.content[0].text)`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// POST /v1/responses
// ---------------------------------------------------------------------------

export function buildResponsesSample(
  lang: SampleLang,
  ctx: DocsSampleContext
): string {
  const url = `${trimBase(ctx.baseUrl)}/v1/responses`
  const key = envName(ctx)
  const model = modelOf(ctx, SAMPLE_MODELS.openai)

  if (lang === 'curl') {
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $\{${key}}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{`,
      `    "model": "${model}",`,
      `    "input": "Tell me a three sentence bedtime story."`,
      `  }'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'import os',
      '',
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      `    base_url="${trimBase(ctx.baseUrl)}/v1",`,
      `    api_key=os.environ["${key}"],`,
      ')',
      '',
      'response = client.responses.create(',
      `    model="${model}",`,
      '    input="Tell me a three sentence bedtime story.",',
      ')',
      '',
      'print(response.output_text)',
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      "import OpenAI from 'openai'",
      '',
      'const client = new OpenAI({',
      `  baseURL: '${trimBase(ctx.baseUrl)}/v1',`,
      `  apiKey: process.env.${key},`,
      '})',
      '',
      'const response = await client.responses.create({',
      `  model: '${model}',`,
      `  input: 'Tell me a three sentence bedtime story.',`,
      '})',
      '',
      'console.log(response.output_text)',
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${key}}\`,`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify({`,
    `    model: '${model}',`,
    `    input: 'Tell me a three sentence bedtime story.',`,
    `  }),`,
    `})`,
    '',
    `const data = await response.json()`,
    `console.log(data.output_text)`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// POST /v1/images/generations
// ---------------------------------------------------------------------------

export function buildImageGenerationsSample(
  lang: SampleLang,
  ctx: DocsSampleContext
): string {
  const url = `${trimBase(ctx.baseUrl)}/v1/images/generations`
  const key = envName(ctx)
  const model = modelOf(ctx, SAMPLE_MODELS.image)

  if (lang === 'curl') {
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $\{${key}}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{`,
      `    "model": "${model}",`,
      `    "prompt": "A lighthouse on a cliff at sunset, watercolor style",`,
      `    "n": 1,`,
      `    "size": "1024x1024"`,
      `  }'`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'import os',
      '',
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      `    base_url="${trimBase(ctx.baseUrl)}/v1",`,
      `    api_key=os.environ["${key}"],`,
      ')',
      '',
      'image = client.images.generate(',
      `    model="${model}",`,
      '    prompt="A lighthouse on a cliff at sunset, watercolor style",',
      '    n=1,',
      "    size='1024x1024',",
      ')',
      '',
      'print(image.data[0].url)',
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      "import OpenAI from 'openai'",
      '',
      'const client = new OpenAI({',
      `  baseURL: '${trimBase(ctx.baseUrl)}/v1',`,
      `  apiKey: process.env.${key},`,
      '})',
      '',
      'const image = await client.images.generate({',
      `  model: '${model}',`,
      `  prompt: 'A lighthouse on a cliff at sunset, watercolor style',`,
      '  n: 1,',
      "  size: '1024x1024',",
      '})',
      '',
      'console.log(image.data[0].url)',
    ].join('\n')
  }
  return [
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    Authorization: \`Bearer \${process.env.${key}}\`,`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify({`,
    `    model: '${model}',`,
    `    prompt: 'A lighthouse on a cliff at sunset, watercolor style',`,
    `    n: 1,`,
    `    size: '1024x1024',`,
    `  }),`,
    `})`,
    '',
    `const { data } = await response.json()`,
    `console.log(data[0].url)`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// POST /v1/images/edits (multipart)
// ---------------------------------------------------------------------------

export function buildImageEditsSample(
  lang: SampleLang,
  ctx: DocsSampleContext
): string {
  const url = `${trimBase(ctx.baseUrl)}/v1/images/edits`
  const key = envName(ctx)
  const model = modelOf(ctx, SAMPLE_MODELS.image)

  if (lang === 'curl') {
    return [
      `curl ${url} \\`,
      `  -H "Authorization: Bearer $\{${key}}" \\`,
      `  -F image=@input.png \\`,
      `  -F model="${model}" \\`,
      `  -F prompt="Add a sailboat to the water" \\`,
      `  -F n=1`,
    ].join('\n')
  }
  if (lang === 'python') {
    return [
      'import os',
      '',
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      `    base_url="${trimBase(ctx.baseUrl)}/v1",`,
      `    api_key=os.environ["${key}"],`,
      ')',
      '',
      'image = client.images.edit(',
      `    model="${model}",`,
      "    image=open('input.png', 'rb'),",
      '    prompt="Add a sailboat to the water",',
      '    n=1,',
      ')',
      '',
      'print(image.data[0].url)',
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      "import fs from 'node:fs'",
      "import OpenAI from 'openai'",
      "import toFile from 'openai/uploads'",
      '',
      'const client = new OpenAI({',
      `  baseURL: '${trimBase(ctx.baseUrl)}/v1',`,
      `  apiKey: process.env.${key},`,
      '})',
      '',
      'const image = await client.images.edit({',
      `  model: '${model}',`,
      "  image: await toFile(fs.createReadStream('input.png')),",
      `  prompt: 'Add a sailboat to the water',`,
      '})',
      '',
      'console.log(image.data[0].url)',
    ].join('\n')
  }
  return [
    `const form = new FormData()`,
    `form.append('image', fileInput.files[0])`,
    `form.append('model', '${model}')`,
    `form.append('prompt', 'Add a sailboat to the water')`,
    '',
    `const response = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: { Authorization: \`Bearer \${process.env.${key}}\` },`,
    `  body: form,`,
    `})`,
    '',
    `const { data } = await response.json()`,
    `console.log(data[0].url)`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Tool configuration snippets (shell / config files)
// ---------------------------------------------------------------------------

/** Claude Code: environment variables for a custom Anthropic gateway. */
export function buildClaudeCodeShellSample(ctx: DocsSampleContext): string {
  return [
    `export ANTHROPIC_BASE_URL="${trimBase(ctx.baseUrl)}"`,
    `export ANTHROPIC_AUTH_TOKEN="$\{${envName(ctx)}}"`,
    '',
    `claude`,
  ].join('\n')
}

/** Claude Code: persistent settings via ~/.claude/settings.json */
export function buildClaudeCodeSettingsSample(ctx: DocsSampleContext): string {
  return JSON.stringify(
    {
      env: {
        ANTHROPIC_BASE_URL: trimBase(ctx.baseUrl),
        ANTHROPIC_AUTH_TOKEN: 'YOUR_API_KEY',
      },
    },
    null,
    2
  )
}

/** Codex CLI: custom model provider via ~/.codex/config.toml */
export function buildCodexTomlSample(ctx: DocsSampleContext): string {
  return [
    `# ~/.codex/config.toml`,
    `[model_providers.tokenfunc]`,
    `name = "tokenfunc"`,
    `base_url = "${trimBase(ctx.baseUrl)}/v1"`,
    `env_key = "${envName(ctx)}"`,
    `wire_api = "responses"`,
    '',
    `# Make it the default provider and pick a model`,
    `model_provider = "tokenfunc"`,
    `model = "${SAMPLE_MODELS.openai}"`,
  ].join('\n')
}

/** OpenClaw: custom Anthropic provider in ~/.openclaw/openclaw.json */
export function buildOpenClawProviderSample(ctx: DocsSampleContext): string {
  return JSON.stringify(
    {
      providers: {
        tokenfunc: {
          baseUrl: trimBase(ctx.baseUrl),
          apiKey: 'YOUR_API_KEY',
        },
      },
      models: [
        {
          id: 'tokenfunc/claude',
          provider: 'tokenfunc',
          model: SAMPLE_MODELS.anthropic,
          baseUrl: trimBase(ctx.baseUrl),
        },
      ],
    },
    null,
    2
  )
}

/** Pi coding agent: custom provider via ~/.pi/agent/models.json */
export function buildPiModelsSample(ctx: DocsSampleContext): string {
  return JSON.stringify(
    {
      tokenfunc: {
        baseUrl: `${trimBase(ctx.baseUrl)}/v1`,
        api: 'openai-completions',
        apiKey: 'YOUR_API_KEY',
        models: [
          {
            id: SAMPLE_MODELS.openai,
            name: 'GPT via tokenfunc',
            context: 400000,
            maxTokens: 128000,
          },
        ],
      },
    },
    null,
    2
  )
}

/** Hermes agent: custom OpenAI-compatible endpoint via env vars. */
export function buildHermesEnvSample(ctx: DocsSampleContext): string {
  return [
    `# Hermes expects an OpenAI-compatible endpoint; keep the /v1 suffix`,
    `export OPENAI_BASE_URL="${trimBase(ctx.baseUrl)}/v1"`,
    `export OPENAI_API_KEY="$\{${envName(ctx)}}"`,
    '',
    `hermes`,
  ].join('\n')
}
