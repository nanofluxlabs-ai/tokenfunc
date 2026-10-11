import { Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

import type {
  CapabilityTableField,
  CapabilityTables,
  QuoteConfigEditorProps,
} from '../../types'

// 三张表的固定表头（与后端模板渲染保持一致，列数不可改）
const TABLE_DEFS: {
  field: CapabilityTableField
  title: string
  headers: string[]
}[] = [
  {
    field: 'platform_throughput',
    title: '1.1 平台吞吐能力（全平台共享）',
    headers: ['指标', '数值', '备注'],
  },
  {
    field: 'per_user_scenario',
    title: '1.2 单用户场景承载（保守口径）',
    headers: [
      '用户类型',
      '平均请求频率',
      '完美体验同时在线',
      '推荐稳态同时在线',
      '突发承载',
    ],
  },
  {
    field: 'rate_commitment',
    title: '1.3 单客户速率承诺（保守口径）',
    headers: ['指标', '数值（保守稳态）'],
  },
]

/** 「服务能力速览」三张固定表头的表格（行内编辑、可增删行）+ 两段引言；本地草稿，整体保存 */
export function CapabilityEditor(props: QuoteConfigEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<CapabilityTables | null>(null)
  const cap = draft ?? props.config.capability

  const update = (patch: Partial<CapabilityTables>) =>
    setDraft({ ...cap, ...patch })

  const updateCell = (
    field: CapabilityTableField,
    rowIndex: number,
    colIndex: number,
    value: string
  ) => {
    const rows = cap[field].map((row) => ({ cells: [...row.cells] }))
    rows[rowIndex].cells[colIndex] = value
    update({ [field]: rows })
  }

  const handleSave = async () => {
    const ok = await props.onSave({ ...props.config, capability: cap })
    if (ok) setDraft(null)
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Cells support **bold** and <br/> line breaks; column counts are fixed to match the quote template.'
          )}
        </p>
        <Button
          size='sm'
          disabled={!draft || props.saving}
          onClick={() => void handleSave()}
        >
          <Save className='h-4 w-4' />
          {t('Save capability metrics')}
        </Button>
      </div>

      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='quote-cap-source-note'>{t('Section intro')}</Label>
        <Textarea
          id='quote-cap-source-note'
          rows={2}
          value={cap.source_note}
          onChange={(event) => update({ source_note: event.target.value })}
        />
      </div>

      {TABLE_DEFS.map((def) => (
        <Card key={def.field}>
          <CardHeader>
            <CardTitle>{def.title}</CardTitle>
            {def.field === 'rate_commitment' ? (
              <CardDescription>{t('Intro before the table')}</CardDescription>
            ) : null}
            <CardAction>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  update({
                    [def.field]: [
                      ...cap[def.field],
                      { cells: Array<string>(def.headers.length).fill('') },
                    ],
                  })
                }
              >
                <Plus className='h-4 w-4' />
                {t('Add row')}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {def.field === 'rate_commitment' ? (
              <Textarea
                rows={2}
                aria-label={t('Intro before the table')}
                value={cap.rate_commitment_note}
                onChange={(event) =>
                  update({ rate_commitment_note: event.target.value })
                }
              />
            ) : null}
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {def.headers.map((header) => (
                      <TableHead key={header} className='min-w-40'>
                        {header}
                      </TableHead>
                    ))}
                    <TableHead className='w-12' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cap[def.field].map((row, rowIndex) => (
                    // eslint-disable-next-line react/no-array-index-key -- 可编辑行没有 ID；用索引保持输入框身份，标签与数值可随时改。
                    <TableRow key={rowIndex}>
                      {def.headers.map((header, colIndex) => (
                        <TableCell key={header}>
                          <Input
                            aria-label={header}
                            value={row.cells[colIndex] ?? ''}
                            onChange={(event) =>
                              updateCell(
                                def.field,
                                rowIndex,
                                colIndex,
                                event.target.value
                              )
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('Delete')}
                          onClick={() =>
                            update({
                              [def.field]: cap[def.field].filter(
                                (_, i) => i !== rowIndex
                              ),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
