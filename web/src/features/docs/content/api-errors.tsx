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
import { Badge } from '@/components/ui/badge'

import { P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'

const STATUS_ROWS = [
  {
    status: 400,
    type: 'new_api_error',
    descriptionKey:
      'Malformed request: bad JSON, missing required fields, or invalid parameter values.',
  },
  {
    status: 401,
    type: 'new_api_error',
    descriptionKey:
      'Missing, invalid, or exhausted API key. Check the key and its remaining quota.',
  },
  {
    status: 403,
    type: 'invalid_request_error',
    descriptionKey:
      'The key may not use this model or endpoint, or the request was blocked by content policy or an IP restriction.',
  },
  {
    status: 404,
    type: 'invalid_request_error',
    descriptionKey:
      'Unknown request path. Check the endpoint URL against the API reference.',
  },
  {
    status: 429,
    type: 'insufficient_quota',
    descriptionKey:
      'Rate limit reached or quota exhausted. Slow down, or top up / raise the key limits.',
  },
  {
    status: 500,
    type: 'new_api_error',
    descriptionKey:
      'Unexpected upstream or gateway failure. Safe to retry with backoff.',
  },
  {
    status: 503,
    type: 'new_api_error',
    descriptionKey:
      'No available channel for the model — it may be unknown, disabled, or out of capacity. Try another model or contact the administrator.',
  },
]

export default function ApiErrorsPage() {
  const { t } = useTranslation()

  return (
    <div>
      <P>
        {t(
          'Errors follow the OpenAI error envelope: a JSON body with an error object carrying message, type, and code. HTTP status codes match the failure class.'
        )}
      </P>

      <DocSection id='format' title={t('Error format')}>
        <CodeBlock
          code={JSON.stringify(
            {
              error: {
                message:
                  'No available channel for model nonexistent-model under group default',
                type: 'new_api_error',
                code: 'model_not_found',
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

      <DocSection id='status-codes' title={t('Status codes')}>
        <StaticDataTable
          className='overflow-hidden rounded-lg border'
          headerRowClassName='bg-muted/40 hover:bg-muted/40'
          data={STATUS_ROWS}
          getRowKey={(row) => String(row.status)}
          getRowClassName={() => 'hover:bg-muted/20'}
          columns={[
            {
              id: 'status',
              header: t('Status'),
              className: 'h-9 w-20',
              cellClassName: 'py-2.5 align-top',
              cell: (row) => (
                <code className='font-mono text-sm font-semibold'>
                  {row.status}
                </code>
              ),
            },
            {
              id: 'type',
              header: t('Type'),
              className: 'h-9 w-48',
              cellClassName: 'py-2.5 align-top',
              cell: (row) => (
                <Badge
                  variant='secondary'
                  className='rounded-full px-2.5 font-mono text-xs font-normal'
                >
                  {row.type}
                </Badge>
              ),
            },
            {
              id: 'meaning',
              header: t('Meaning'),
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
      </DocSection>

      <DocSection id='retries' title={t('Retries')}>
        <P>
          {t(
            'Retry only 429 (after honoring the suggested wait), 500, and 503 responses. 4xx errors other than 429 are deterministic — fix the request instead of retrying.'
          )}
        </P>
        <P>
          {t(
            'Use exponential backoff with jitter, and cap retries at a few attempts. The OpenAI and Anthropic SDKs do this automatically when configured with max_retries.'
          )}
        </P>
      </DocSection>
    </div>
  )
}
