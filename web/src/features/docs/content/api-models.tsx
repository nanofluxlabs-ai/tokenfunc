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
import { StaticDataTable } from '@/components/data-table'

import { CodeSample } from '../components/code-sample'
import { P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { DocsTableText } from '../components/docs-table-text'
import { EndpointHeader } from '../components/endpoint-header'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildLangTabs } from '../lib/code-sample-tabs'
import { buildModelsSample } from '../lib/samples'

const RESPONSE_FIELDS = [
  {
    id: 'id',
    descriptionKey:
      'The model identifier to pass as the model parameter in requests.',
  },
  {
    id: 'object',
    descriptionKey:
      'Always "model" for a single entry and "list" for the wrapper object.',
  },
  {
    id: 'owned_by',
    descriptionKey: 'The account or organization that owns the model record.',
  },
  {
    id: 'created',
    descriptionKey:
      'Unix timestamp (seconds) when the model record was created.',
  },
]

export default function ApiModelsPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'List the models your key may access. The response follows the OpenAI format; only models enabled for your account and token group are included.'
        )}
      </P>

      <div className='space-y-3'>
        <EndpointHeader method='GET' path='/v1/models' />
        <EndpointHeader
          method='GET'
          path='/v1/models/{model}'
          description={t('Retrieve one model record')}
        />
      </div>

      <DocSection id='list-models' title={t('List models')}>
        <CodeSample
          tabs={buildLangTabs((lang) => buildModelsSample(lang, ctx))}
        />
      </DocSection>

      <DocSection id='response' title={t('Response example')}>
        <CodeBlock
          code={JSON.stringify(
            {
              object: 'list',
              data: [
                {
                  id: 'gpt-5.2',
                  object: 'model',
                  created: 1760000000,
                  owned_by: 'tokenfunc',
                },
                {
                  id: 'claude-sonnet-4-5',
                  object: 'model',
                  created: 1760000000,
                  owned_by: 'tokenfunc',
                },
              ],
            },
            null,
            2
          )}
          language='json'
          enableCollapse={false}
          className='my-0'
        />
      </DocSection>

      <DocSection id='fields' title={t('Model object fields')}>
        <StaticDataTable
          className='overflow-hidden rounded-lg border'
          headerRowClassName='bg-muted/40 hover:bg-muted/40'
          data={RESPONSE_FIELDS}
          getRowKey={(field) => field.id}
          getRowClassName={() => 'hover:bg-muted/20'}
          columns={[
            {
              id: 'field',
              header: t('Field'),
              className: 'h-9 w-28 sm:w-40',
              cellClassName: 'py-2.5 align-top',
              cell: (field) => (
                <code className='font-mono text-sm font-medium'>
                  {field.id}
                </code>
              ),
            },
            {
              id: 'description',
              header: t('Description'),
              className: 'h-9',
              cellClassName: 'py-2.5 align-top whitespace-normal wrap-anywhere',
              cell: (field) => <DocsTableText text={t(field.descriptionKey)} />,
            },
          ]}
        />
        <P>
          {t(
            'Pricing and limits for each model are listed on the Model Square page; use the model list there as the source of truth for names.'
          )}
        </P>
      </DocSection>
    </div>
  )
}
