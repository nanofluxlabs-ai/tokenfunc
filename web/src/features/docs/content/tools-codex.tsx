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
import { buildCodexTomlSample } from '../lib/samples'

export default function ToolsCodexPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'Codex is the OpenAI coding agent CLI. It routes through custom providers defined in its config file — add this gateway as a provider with wire_api = "responses".'
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
                    'create a dedicated key for Codex so you can revoke or re-scope it independently.'
                  )}
                </P>
              ),
            },
            {
              title: t('Export the key for Codex'),
              children: (
                <CodeBlock
                  code={`export ${DOCS_API_KEY_ENV}="sk-...your key..."`}
                  language='bash'
                  enableCollapse={false}
                  className='my-0'
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
              ),
            },
            {
              title: t('Register the gateway as a model provider'),
              children: (
                <>
                  <P>
                    {t(
                      'Edit ~/.codex/config.toml and make the new provider the default. Note that base_url must include the /v1 suffix here.'
                    )}
                  </P>
                  <CodeBlock
                    code={buildCodexTomlSample(ctx)}
                    language='toml'
                    enableCollapse={false}
                    className='my-0'
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                </>
              ),
            },
            {
              title: t('Start Codex and verify'),
              children: (
                <P>
                  {t(
                    'Run codex in a project and send a short prompt. Switch models later with /model inside Codex; every model name from Model Square works.'
                  )}
                </P>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='troubleshooting' title={t('Troubleshooting')}>
        <Note>
          {t('401 or unauthorized')}{' '}
          {t(
            '— the env_key variable is not exported in the shell where codex runs, or the key value is wrong.'
          )}
        </Note>
        <Note>
          {t('404 or unexpected endpoint errors')}{' '}
          {t(
            '— base_url must end with /v1 (Codex appends /responses itself). Also keep wire_api = "responses"; the chat wire format is not what Codex expects.'
          )}
        </Note>
        <P>
          {t('Request and response details live on the /v1/responses page.')}
        </P>
      </DocSection>
    </div>
  )
}
