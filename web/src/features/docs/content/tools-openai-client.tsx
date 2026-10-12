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

import { StaticDataTable } from '@/components/data-table'

import { BaseUrlCard } from '../components/base-url-card'
import { CodeSample } from '../components/code-sample'
import { P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildLangTabs } from '../lib/code-sample-tabs'
import { buildChatCompletionsSample } from '../lib/samples'

const FIELDS = [
  {
    field: 'Base URL',
    descriptionKey:
      'The gateway address with /v1 appended, e.g. https://your-site.example.com/v1.',
  },
  {
    field: 'API key',
    descriptionKey:
      'An API key created on this site, passed as the API key / password field.',
  },
  {
    field: 'Model',
    descriptionKey:
      'Any model ID from the models endpoint or Model Square page.',
  },
]

export default function ToolsOpenAiClientPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'Any app, SDK, or CLI that speaks the OpenAI API works with this gateway: point its base URL here and use a key from this site. This covers OpenAI SDKs, LangChain, LobeChat, Cherry Studio, Cursor-style tools, and anything else with an OpenAI-compatible setting.'
        )}
      </P>

      <BaseUrlCard />

      <DocSection id='values' title={t('Values to fill in')}>
        <StaticDataTable
          className='overflow-hidden rounded-lg border'
          headerRowClassName='bg-muted/40 hover:bg-muted/40'
          data={FIELDS}
          getRowKey={(row) => row.field}
          getRowClassName={() => 'hover:bg-muted/20'}
          columns={[
            {
              id: 'field',
              header: t('Field'),
              className: 'h-9 w-32',
              cellClassName: 'py-2.5 align-top',
              cell: (row) => (
                <code className='font-mono text-sm font-medium'>
                  {row.field}
                </code>
              ),
            },
            {
              id: 'value',
              header: t('Value'),
              className: 'h-9',
              cellClassName: 'py-2.5 align-top',
              cell: (row) => (
                <span className='text-muted-foreground text-sm leading-relaxed'>
                  {t(row.descriptionKey)}
                </span>
              ),
            },
          ]}
        />
        <P>
          {t(
            'In apps that only ask for an API host, give the base address without /v1; in apps that ask for a full endpoint, include /v1 (for example .../v1/chat/completions).'
          )}
        </P>
      </DocSection>

      <DocSection id='sdk-example' title={t('SDK example')}>
        <CodeSample
          tabs={buildLangTabs((lang) => buildChatCompletionsSample(lang, ctx))}
        />
      </DocSection>

      <DocSection id='notes' title={t('Good to know')}>
        <P>
          <Link
            to='/keys'
            className='text-foreground underline underline-offset-4'
          >
            {t('API keys')}
          </Link>
          {' — '}
          {t(
            'create one key per app so a leaked key never affects your other integrations.'
          )}
        </P>
        <P>
          {t(
            'The gateway also serves the Anthropic Messages and OpenAI Responses formats — see the Model access API section if your tool prefers those.'
          )}
        </P>
      </DocSection>
    </div>
  )
}
