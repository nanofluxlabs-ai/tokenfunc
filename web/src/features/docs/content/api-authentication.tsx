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

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'

import { C, Note, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'

export default function ApiAuthenticationPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()

  return (
    <div>
      <P>
        {t(
          'Every relay endpoint requires an API key created on this site. Keys are passed as a Bearer token by default; Anthropic-formatted endpoints also accept the Anthropic-style header pair.'
        )}
      </P>

      <DocSection id='bearer' title={t('Bearer token')}>
        <P>
          {t('Send the key in the')} <C>Authorization: Bearer &lt;key&gt;</C>{' '}
          {t('header. This works for all OpenAI-format endpoints, such as')}{' '}
          <C>/v1/chat/completions</C>, <C>/v1/responses</C>, <C>/v1/models</C>,{' '}
          {t('and')} <C>/v1/images/generations</C>.
        </P>
        <CodeBlock
          code={[
            `curl ${baseUrl}/v1/models \\`,
            `  -H "Authorization: Bearer $\{${DOCS_API_KEY_ENV}}"`,
          ].join('\n')}
          language='bash'
          enableCollapse={false}
          className='my-0'
        >
          <CodeBlockCopyButton />
        </CodeBlock>
      </DocSection>

      <DocSection id='anthropic-headers' title={t('Anthropic-style headers')}>
        <P>
          {t('Anthropic-format endpoints —')} <C>/v1/messages</C>{' '}
          {t(
            '— accept the key in the x-api-key header together with anthropic-version. The Bearer header works there too.'
          )}
        </P>
        <CodeBlock
          code={[
            `curl ${baseUrl}/v1/messages \\`,
            `  -H "x-api-key: $\{${DOCS_API_KEY_ENV}}" \\`,
            `  -H "anthropic-version: 2023-06-01" \\`,
            `  -H "Content-Type: application/json" \\`,
            `  -d '{`,
            `    "model": "claude-sonnet-4-5",`,
            `    "max_tokens": 64,`,
            `    "messages": [{ "role": "user", "content": "Hello!" }]`,
            `  }'`,
          ].join('\n')}
          language='bash'
          enableCollapse={false}
          className='my-0'
        >
          <CodeBlockCopyButton />
        </CodeBlock>
        <Note>
          {t(
            'Calling /v1/models with the x-api-key and anthropic-version headers returns the model list in Anthropic format instead of OpenAI format.'
          )}
        </Note>
      </DocSection>

      <DocSection id='key-scope' title={t('Key scope and limits')}>
        <P>
          {t(
            'When creating a key you can restrict it to specific models, channel groups, IP ranges, and quotas, and set an expiry. Requests that exceed a limit fail with a 429 response — see Errors for the exact format.'
          )}
        </P>
        <P>
          {t(
            'Keys are bearer credentials: anyone holding a key can spend its quota. Create one key per tool, never commit keys to source control, and rotate a key immediately if it leaks.'
          )}
        </P>
      </DocSection>
    </div>
  )
}
