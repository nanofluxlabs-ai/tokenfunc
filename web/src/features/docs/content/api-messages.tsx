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
import { useTranslation } from 'react-i18next'

import { CodeBlock } from '@/components/ai-elements/code-block'

import { CodeSample } from '../components/code-sample'
import { C, Note, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { EndpointHeader } from '../components/endpoint-header'
import { ParamTable, type DocsParam } from '../components/param-table'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildLangTabs } from '../lib/code-sample-tabs'
import { buildMessagesSample } from '../lib/samples'

const PARAMS: DocsParam[] = [
  {
    name: 'model',
    type: 'string',
    required: true,
    descriptionKey:
      'ID of the model to use, as returned by the models endpoint.',
  },
  {
    name: 'messages',
    type: 'array',
    required: true,
    descriptionKey:
      'The conversation so far, as an array of role and content messages.',
  },
  {
    name: 'max_tokens',
    type: 'integer',
    required: true,
    descriptionKey: 'The maximum number of tokens to generate before stopping.',
  },
  {
    name: 'system',
    type: 'string',
    descriptionKey:
      'System prompt that sets the assistant behavior for the whole conversation.',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: 'false',
    descriptionKey:
      'If true, the response is delivered as a stream of server-sent events.',
  },
  {
    name: 'temperature',
    type: 'number',
    defaultValue: '1',
    descriptionKey:
      'Sampling randomness between 0 and 2; higher values make output more random.',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey:
      'A list of tools the model may call, such as function definitions.',
  },
  {
    name: 'tool_choice',
    type: 'object',
    descriptionKey: 'Controls tool use: auto, any, or a forced specific tool.',
  },
]

export default function ApiMessagesPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'The Anthropic Messages API, wire-compatible with Anthropic clients. This is the endpoint Claude Code and other Anthropic-native agents use.'
        )}
      </P>

      <EndpointHeader
        method='POST'
        path='/v1/messages'
        description={t('Create an Anthropic message')}
      />

      <DocSection id='request' title={t('Request')}>
        <CodeSample
          tabs={buildLangTabs((lang) => buildMessagesSample(lang, ctx))}
        />
        <Note>
          {t(
            'Unlike OpenAI-format endpoints, max_tokens is required here, and the recommended authentication headers are x-api-key plus anthropic-version.'
          )}
        </Note>
      </DocSection>

      <DocSection id='parameters' title={t('Parameters')}>
        <ParamTable params={PARAMS} />
      </DocSection>

      <DocSection id='response' title={t('Response example')}>
        <CodeBlock
          code={JSON.stringify(
            {
              id: 'msg_abc123',
              type: 'message',
              role: 'assistant',
              model: 'claude-sonnet-4-5',
              content: [
                { type: 'text', text: 'Hello! How can I help you today?' },
              ],
              stop_reason: 'end_turn',
              usage: { input_tokens: 8, output_tokens: 12 },
            },
            null,
            2
          )}
          language='json'
          enableCollapse={false}
          className='my-0'
        />
      </DocSection>

      <DocSection id='streaming' title={t('Streaming')}>
        <P>
          {t(
            'With stream: true the endpoint emits typed SSE events: message_start, one or more content_block_start / content_block_delta / content_block_stop groups, then message_delta with the final stop reason and usage, and message_stop.'
          )}
        </P>
        <CodeSample
          tabs={buildLangTabs((lang) =>
            buildMessagesSample(lang, ctx, { stream: true })
          )}
        />
        <P>
          {t('Prefer the OpenAI wire format? Use')} <C>/v1/chat/completions</C>.
        </P>
      </DocSection>
    </div>
  )
}
