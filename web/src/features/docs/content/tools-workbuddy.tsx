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
import { useDocsBaseUrl } from '../hooks/use-docs-base-url'

export default function ToolsWorkBuddyPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()

  return (
    <div>
      <P>
        {t(
          'WorkBuddy (Tencent) is an AI work assistant that supports custom OpenAI-compatible models. Connect it by adding this gateway as a custom model in its settings.'
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
                    'create a dedicated key for WorkBuddy so you can revoke or re-scope it independently.'
                  )}
                </P>
              ),
            },
            {
              title: t('Copy the API address for custom models'),
              children: (
                <>
                  <P>
                    {t(
                      'WorkBuddy expects an OpenAI-compatible Chat Completions endpoint, so the address carries the /v1 suffix:'
                    )}
                  </P>
                  <CodeBlock
                    code={`${baseUrl}/v1`}
                    language='text'
                    enableCollapse={false}
                    className='my-0'
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                </>
              ),
            },
            {
              title: t('Add a custom model in WorkBuddy settings'),
              children: (
                <P>
                  {t(
                    'In WorkBuddy, open settings and find the custom model management (model configuration) area. Add a new custom model with the API address above, your API key, and a model name from Model Square.'
                  )}
                </P>
              ),
            },
            {
              title: t('Select the model and verify'),
              children: (
                <P>
                  {t(
                    'Pick the newly added model in a conversation and send a short prompt. If it answers, WorkBuddy is talking to this gateway.'
                  )}
                </P>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='troubleshooting' title={t('Troubleshooting')}>
        <Note>
          {t('Connection fails immediately')}{' '}
          {t(
            '— most often the address is missing /v1 or the key was pasted incompletely. Re-copy both values from this page and the keys page.'
          )}
        </Note>
        <Note>
          {t('Model answers then stops')}{' '}
          {t(
            '— check the key quota and rate limits on the keys page; exhausted keys fail with 429.'
          )}
        </Note>
      </DocSection>
    </div>
  )
}
