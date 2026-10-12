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
import { Note, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { EndpointHeader } from '../components/endpoint-header'
import { ParamTable, type DocsParam } from '../components/param-table'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildLangTabs } from '../lib/code-sample-tabs'
import { buildResponsesSample } from '../lib/samples'

const PARAMS: DocsParam[] = [
  {
    name: 'model',
    type: 'string',
    required: true,
    descriptionKey:
      'ID of the model to use, as returned by the models endpoint.',
  },
  {
    name: 'input',
    type: 'string | array',
    required: true,
    descriptionKey:
      'The input to act on: a plain string, or a list of typed message items.',
  },
  {
    name: 'instructions',
    type: 'string',
    descriptionKey:
      'System prompt that sets the assistant behavior for the whole run.',
  },
  {
    name: 'stream',
    type: 'boolean',
    defaultValue: 'false',
    descriptionKey:
      'If true, the response is delivered as a stream of server-sent events.',
  },
  {
    name: 'max_output_tokens',
    type: 'integer',
    descriptionKey: 'Upper bound for the number of output tokens generated.',
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
]

export default function ApiResponsesPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'The OpenAI Responses API — the newer stateful format used by Codex and other agent-first tools. It accepts a simple input and returns a structured output list.'
        )}
      </P>

      <EndpointHeader
        method='POST'
        path='/v1/responses'
        description={t('Create a model response')}
      />

      <DocSection id='request' title={t('Request')}>
        <CodeSample
          tabs={buildLangTabs((lang) => buildResponsesSample(lang, ctx))}
        />
        <Note>
          {t(
            'A WebSocket variant is available at GET /v1/responses for streaming agent sessions; HTTP POST covers normal request/response use.'
          )}
        </Note>
      </DocSection>

      <DocSection id='input-vs-messages' title={t('input vs messages')}>
        <P>
          {t(
            'input accepts a plain string for one-shot prompts. For multi-turn conversations, pass an array of typed items with role and content — equivalent to the messages array of chat completions.'
          )}
        </P>
        <P>
          {t(
            'If your tool already speaks chat completions, use /v1/chat/completions instead; Responses is mainly needed by tools that require it, such as Codex.'
          )}
        </P>
      </DocSection>

      <DocSection id='parameters' title={t('Parameters')}>
        <ParamTable params={PARAMS} />
      </DocSection>

      <DocSection id='response' title={t('Response example')}>
        <CodeBlock
          code={JSON.stringify(
            {
              id: 'resp_abc123',
              object: 'response',
              created_at: 1760000000,
              model: 'gpt-5.2',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Once there was a little bot.',
                    },
                  ],
                },
              ],
              usage: {
                input_tokens: 14,
                output_tokens: 9,
                total_tokens: 23,
              },
            },
            null,
            2
          )}
          language='json'
          enableCollapse={false}
          className='my-0'
        />
        <P>
          {t(
            'The convenience field output_text concatenates all output_text parts — that is what the SDK samples print.'
          )}
        </P>
      </DocSection>
    </div>
  )
}
