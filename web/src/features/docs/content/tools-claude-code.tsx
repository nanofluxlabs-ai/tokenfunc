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
import {
  buildClaudeCodeSettingsSample,
  buildClaudeCodeShellSample,
} from '../lib/samples'

export default function ToolsClaudeCodePage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'Claude Code is the official Anthropic command-line coding agent. Point it at this gateway with two environment variables — it then uses the Anthropic Messages endpoint served here.'
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
                    'create a dedicated key for Claude Code so you can revoke or re-scope it independently.'
                  )}
                </P>
              ),
            },
            {
              title: t('Set the environment variables'),
              children: (
                <>
                  <P>
                    {t(
                      'Export the key you copied and the gateway address. Use the base URL exactly as shown — without a trailing /v1.'
                    )}
                  </P>
                  <CodeBlock
                    code={buildClaudeCodeShellSample(ctx)}
                    language='bash'
                    enableCollapse={false}
                    className='my-0'
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                </>
              ),
            },
            {
              title: t('Make it permanent (optional)'),
              children: (
                <>
                  <P>
                    {t(
                      'To avoid exporting on every shell, put the same variables into the env block of the Claude Code settings file.'
                    )}
                  </P>
                  <CodeBlock
                    code={buildClaudeCodeSettingsSample(ctx)}
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
              title: t('Start Claude Code and verify'),
              children: (
                <P>
                  {t(
                    'Run claude in any project and send a short prompt. If it answers, the gateway is serving it. Use /model inside Claude Code to pick a model served by this site.'
                  )}
                </P>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='troubleshooting' title={t('Troubleshooting')}>
        <Note>
          {t('401 or invalid API key')}{' '}
          {t(
            '— the key is wrong or exhausted. Check the key value and its quota on the keys page.'
          )}
        </Note>
        <Note>
          {t('404 on /v1/messages')}{' '}
          {t(
            '— ANTHROPIC_BASE_URL probably ends with /v1. Remove the suffix; Claude Code appends /v1/messages itself.'
          )}
        </Note>
        <Note>
          {t('Model not found')}{' '}
          {t(
            '— the key may not include the model you selected. Compare /model entries with the models endpoint or Model Square.'
          )}
        </Note>
        <P>
          {t('Request and response details live on the /v1/messages page.')}
        </P>
      </DocSection>
    </div>
  )
}
