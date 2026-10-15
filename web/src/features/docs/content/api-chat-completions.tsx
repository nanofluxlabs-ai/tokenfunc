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
import { buildChatCompletionsSample } from '../lib/samples'

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
    name: 'top_p',
    type: 'number',
    defaultValue: '1',
    descriptionKey:
      'Nucleus sampling: only tokens within the top_p probability mass are considered.',
  },
  {
    name: 'max_tokens',
    type: 'integer',
    descriptionKey:
      'Upper bound for the number of tokens generated in the completion.',
  },
  {
    name: 'tools',
    type: 'array',
    descriptionKey:
      'A list of tools the model may call, such as function definitions.',
  },
  {
    name: 'tool_choice',
    type: 'string',
    defaultValue: 'auto',
    descriptionKey: 'Controls tool use: none, auto, or a forced specific tool.',
  },
]

export default function ApiChatCompletionsPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'The main text inference endpoint, compatible with the OpenAI Chat Completions API. Send a conversation, get a completion — or stream it token by token.'
        )}
      </P>

      <EndpointHeader
        method='POST'
        path='/v1/chat/completions'
        description={t('Create a chat completion')}
      />

      <DocSection id='request' title={t('Request')}>
        <CodeSample
          tabs={buildLangTabs((lang) => buildChatCompletionsSample(lang, ctx))}
        />
      </DocSection>

      <DocSection id='parameters' title={t('Parameters')}>
        <ParamTable params={PARAMS} />
      </DocSection>

      <DocSection id='response' title={t('Response example')}>
        <CodeBlock
          code={JSON.stringify(
            {
              id: 'chatcmpl-abc123',
              object: 'chat.completion',
              created: 1760000000,
              model: 'gpt-5.2',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: 'Hello! How can I help you today?',
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 9,
                completion_tokens: 12,
                total_tokens: 21,
              },
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
            'Set stream to true and the server answers with a server-sent event stream: each data: line carries one chat.completion.chunk object, and the stream ends with data: [DONE].'
          )}
        </P>
        <CodeSample
          tabs={buildLangTabs((lang) =>
            buildChatCompletionsSample(lang, ctx, { stream: true })
          )}
        />
        <Note>
          {t(
            'The usage field is included in the final chunk only when you also pass stream_options: {"include_usage": true}.'
          )}
        </Note>
        <P>
          {t(
            'Most agent and chat tools work with this endpoint out of the box — see the client guides under Third-party tool integration.'
          )}
        </P>
        <P>
          {t('Need the Anthropic wire format instead? Use')} <C>/v1/messages</C>
          .
        </P>
      </DocSection>
    </div>
  )
}
