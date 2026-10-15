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
import { CodeSample } from '../components/code-sample'
import { DocSteps, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildLangTabs } from '../lib/code-sample-tabs'
import { buildChatCompletionsSample } from '../lib/samples'

export default function QuickStartPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'This gateway exposes one OpenAI- and Anthropic-compatible API for every model it serves. Create an API key, pick an endpoint format, and point your favorite tool at it — no per-vendor accounts required.'
        )}
      </P>

      <BaseUrlCard />

      <DocSection id='create-key' title={t('Create an API key')}>
        <DocSteps
          items={[
            {
              title: t('Sign in and open the API keys page'),
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
                    'create one key for each tool or project so you can revoke them independently.'
                  )}
                </P>
              ),
            },
            {
              title: t('Add a key and copy it immediately'),
              children: (
                <P>
                  {t(
                    'Give the key a name and, optionally, limits for quota, models, IP ranges, or expiry. The full key is shown only once after creation — copy it somewhere safe.'
                  )}
                </P>
              ),
            },
            {
              title: t('Export the key as an environment variable'),
              children: (
                <>
                  <P>
                    {t(
                      'The examples in these docs read the key from this variable.'
                    )}
                  </P>
                  <CodeBlock
                    code={`export ${DOCS_API_KEY_ENV}="sk-...your key..."`}
                    language='bash'
                    enableCollapse={false}
                    className='my-0'
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                </>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='first-request' title={t('Send your first request')}>
        <P>
          {t(
            'A minimal chat completion looks like this — replace the model with any model listed on the Model Square page.'
          )}
        </P>
        <CodeSample
          tabs={buildLangTabs((lang) => buildChatCompletionsSample(lang, ctx))}
        />
      </DocSection>

      <DocSection id='where-next' title={t('Where to go next')}>
        <P>
          {t('Model access API')}{' '}
          {t(
            '— request/response details for chat completions, Anthropic messages, Responses, and image generation.'
          )}
        </P>
        <P>
          {t('Third-party tool integration')}{' '}
          {t(
            '— step-by-step guides for Claude Code, Codex, OpenClaw, Pi, WorkBuddy, Hermes, and any OpenAI-compatible client.'
          )}
        </P>
      </DocSection>
    </div>
  )
}
