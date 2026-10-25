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

import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'

export type DocsParam = {
  name: string
  type: string
  required?: boolean
  defaultValue?: string
  /** i18n key (English literal) for the parameter description */
  descriptionKey: string
}

/** Parameter reference table shared by all endpoint pages. */
export function ParamTable(props: {
  params: DocsParam[]
  /** 列标题覆盖：错误码表等非参数表复用时传入 */
  labels?: { name?: string; type?: string; default?: string }
}) {
  const { t } = useTranslation()

  return (
    <StaticDataTable
      className='overflow-hidden rounded-lg border'
      headerRowClassName='bg-muted/40 hover:bg-muted/40'
      data={props.params}
      getRowKey={(param) => param.name}
      getRowClassName={() => 'hover:bg-muted/20'}
      columns={[
        {
          id: 'parameter',
          header: props.labels?.name ?? t('Parameter'),
          className: 'h-9 w-48',
          cellClassName: 'py-2.5 align-top',
          cell: (param) => (
            <div className='flex flex-wrap items-center gap-1.5'>
              <code className='text-foreground font-mono text-sm font-medium'>
                {param.name}
              </code>
              {param.required && (
                <Badge
                  variant='outline'
                  className='h-6 border-rose-500/40 px-2 text-xs text-rose-600 dark:text-rose-400'
                >
                  {t('required')}
                </Badge>
              )}
            </div>
          ),
        },
        {
          id: 'type',
          header: props.labels?.type ?? t('Type'),
          className: 'h-9 w-28',
          cellClassName: 'py-2.5 align-top',
          cell: (param) => (
            <Badge
              variant='secondary'
              className='h-7 rounded-full px-2.5 font-mono text-xs font-normal'
            >
              {param.type}
            </Badge>
          ),
        },
        {
          id: 'default',
          header: props.labels?.default ?? t('Default'),
          className: 'h-9 w-24',
          cellClassName: 'py-2.5 align-top',
          cell: (param) =>
            param.defaultValue ? (
              <code className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'>
                {param.defaultValue}
              </code>
            ) : (
              <span className='text-muted-foreground/60 text-sm'>—</span>
            ),
        },
        {
          id: 'description',
          header: t('Description'),
          className: 'h-9',
          cellClassName: 'py-2.5 align-top',
          cell: (param) => (
            <span className='text-muted-foreground text-sm leading-relaxed'>
              {t(param.descriptionKey)}
            </span>
          ),
        },
      ]}
    />
  )
}
