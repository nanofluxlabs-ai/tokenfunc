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
import { buildPiModelsSample } from '../lib/samples'

export default function ToolsPiPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'Pi (badlogic/pi-mono) is a minimal, hackable coding agent. Custom models are declared in a JSON file — add the gateway as an OpenAI-compatible provider there.'
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
                    'create a dedicated key for Pi so you can revoke or re-scope it independently.'
                  )}
                </P>
              ),
            },
            {
              title: t('Declare the provider in models.json'),
              children: (
                <>
                  <P>
                    {t(
                      'Edit ~/.pi/agent/models.json and add a provider entry. baseUrl must include the /v1 suffix; api selects the OpenAI protocol Pi should speak.'
                    )}
                  </P>
                  <CodeBlock
                    code={buildPiModelsSample(ctx)}
                    language='json'
                    enableCollapse={false}
                    className='my-0'
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                </>
              ),
            },
            {
              title: t('Select the model inside Pi'),
              children: (
                <P>
                  {t(
                    'Start pi, run /model, and pick the entry you just declared. Add more entries to the models array to expose more models from this site.'
                  )}
                </P>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='troubleshooting' title={t('Troubleshooting')}>
        <Note>
          {t('The model list shows nothing')}{' '}
          {t(
            '— models.json must be valid JSON at ~/.pi/agent/models.json; run pi --help or check the agent log for parse errors.'
          )}
        </Note>
        <Note>
          {t('401 or model not found')}{' '}
          {t(
            '— verify the apiKey value and that the model id in the models array exists on this site (compare with the models endpoint).'
          )}
        </Note>
      </DocSection>
    </div>
  )
}
