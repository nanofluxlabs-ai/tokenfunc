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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'

import { BaseUrlCard } from '../components/base-url-card'
import { DocSteps, Note, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildHermesEnvSample } from '../lib/samples'

export default function ToolsHermesPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'Hermes (Nous Research) is a terminal AI agent. It works with any OpenAI-compatible backend — set two environment variables or register a custom endpoint in its model settings.'
        )}
      </P>

      <BaseUrlCard />

      <DocSection id='setup' title={t('Setup')}>
        <DocSteps
          items={[
            {
              title: t('Create an API key on this site'),
              children: (
                <P>
                  <Link
                    to='/keys'
                    className='text-foreground underline underline-offset-4'
                  >
                    {t('API keys')}
                  </Link>
                  {' — '}
                  {t(
                    'create a dedicated key for Hermes so you can revoke or re-scope it independently.'
                  )}
                </P>
              ),
            },
            {
              title: t('Point Hermes at the gateway'),
              children: (
                <>
                  <P>
                    {t(
                      'Hermes reads the standard OpenAI environment variables. The base URL must include the /v1 suffix:'
                    )}
                  </P>
                  <CodeBlock
                    code={buildHermesEnvSample(ctx)}
                    language='bash'
                    enableCollapse={false}
                    className='my-0'
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                  <P>
                    {t(
                      'Alternatively run hermes model, choose Custom Endpoint, and enter the same address, key, and a model name.'
                    )}
                  </P>
                </>
              ),
            },
            {
              title: t('Verify'),
              children: (
                <P>
                  {t(
                    'Start hermes and send a short prompt. Check the model list with hermes model if you need to switch models later.'
                  )}
                </P>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='troubleshooting' title={t('Troubleshooting')}>
        <Note>
          {t('404 on chat requests')}{' '}
          {t(
            '— some Hermes builds drop a trailing /v1 from OPENAI_BASE_URL. If that happens, register the endpoint via hermes model instead and enter the full address including /v1.'
          )}
        </Note>
        <Note>
          {t('401 or quota errors')}{' '}
          {t(
            '— confirm OPENAI_API_KEY holds a valid key with remaining quota; check the keys page.'
          )}
        </Note>
      </DocSection>
    </div>
  )
}
