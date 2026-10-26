import { Download, Upload } from 'lucide-react'
import { type ChangeEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { importMembers } from '../api'
import { MEMBER_CSV_TEMPLATE, parseMemberCsv } from '../lib/parse-member-csv'
import { parseMemberLines } from '../lib/parse-member-lines'
import type { MemberImportResult, MemberImportRow } from '../types'

const PREVIEW_ROWS = 5
const MAX_ROWS = 1000

type MemberImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

function downloadTemplate() {
  const blob = new Blob([`﻿${MEMBER_CSV_TEMPLATE}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'members-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function MemberImportDialog(props: MemberImportDialogProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<MemberImportRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<MemberImportResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [source, setSource] = useState<'text' | 'csv'>('text')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!props.open) return
    setRows([])
    setParseError(null)
    setResult(null)
    setSource('text')
    setText('')
  }, [props.open])

  /** 两种来源共用：超量与缺邮箱都在前端拦下，与成员表单同口径 */
  const acceptRows = (parsed: MemberImportRow[]) => {
    if (parsed.length > MAX_ROWS) {
      setParseError(
        t('At most {{count}} rows per import.', { count: MAX_ROWS })
      )
      setRows([])
      return
    }
    const missingEmail = parsed.findIndex((row) => row.email.trim() === '')
    if (missingEmail >= 0) {
      setParseError(
        t('Row {{row}}: email is required', { row: missingEmail + 1 })
      )
      setRows([])
      return
    }
    setParseError(null)
    setRows(parsed)
  }

  const handleText = (value: string) => {
    setText(value)
    setResult(null)
    if (value.trim() === '') {
      setParseError(null)
      setRows([])
      return
    }
    const parsed = parseMemberLines(value)
    if (parsed.errors.length > 0) {
      const first = parsed.errors[0]
      setParseError(
        first.reason === 'too_many_fields'
          ? t('Line {{line}}: too many fields', { line: first.line })
          : t('Line {{line}}: email is missing or invalid', {
              line: first.line,
            })
      )
      setRows([])
      return
    }
    acceptRows(parsed.rows)
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setResult(null)
    if (!file) return
    const parsed = parseMemberCsv(await file.text())
    if (parsed.error === 'missing_name_column') {
      setParseError(t('The CSV must contain a "name" column.'))
      setRows([])
      return
    }
    if (parsed.error === 'empty') {
      setParseError(t('The CSV file has no data rows.'))
      setRows([])
      return
    }
    acceptRows(parsed.rows)
  }

  const handleImport = async () => {
    setIsSubmitting(true)
    try {
      const response = await importMembers(rows)
      if (!response.success || !response.data) {
        handleServerError(response)
        return
      }
      setResult(response.data)
      if (response.data.errors.length === 0) {
        toast.success(
          t('Imported {{count}} members', { count: response.data.created })
        )
        props.onImported()
        props.onOpenChange(false)
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const previewColumns: StaticDataTableColumn<MemberImportRow>[] = [
    { id: 'name', header: t('Name'), cell: (row) => row.name },
    { id: 'email', header: t('Email'), cell: (row) => row.email || '—' },
    {
      id: 'employee_no',
      header: t('Employee No.'),
      cell: (row) => row.employee_no || '—',
    },
    { id: 'team', header: t('Team'), cell: (row) => row.team || '—' },
  ]
  const errorColumns: StaticDataTableColumn<{
    row: number
    message: string
  }>[] = [
    { id: 'row', header: t('Row'), cell: (row) => row.row },
    { id: 'message', header: t('Error'), cell: (row) => row.message },
  ]

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Import Members')}
      description={t(
        'Paste one member per line or upload a CSV with columns name, email, employee_no and team. Unknown teams are created; an empty team means the default team. If any row is invalid, nothing is imported.'
      )}
      contentClassName='sm:max-w-2xl'
      footer={
        <Button
          onClick={() => void handleImport()}
          disabled={isSubmitting || rows.length === 0}
        >
          <Upload className='h-4 w-4' />
          {isSubmitting
            ? t('Importing...')
            : t('Import {{count}} rows', { count: rows.length })}
        </Button>
      }
    >
      <div className='flex flex-col gap-4'>
        <Tabs
          value={source}
          onValueChange={(value) => {
            setSource(value as 'text' | 'csv')
            setRows([])
            setParseError(null)
            setResult(null)
          }}
        >
          <TabsList>
            <TabsTrigger value='text'>{t('Paste text')}</TabsTrigger>
            <TabsTrigger value='csv'>{t('CSV file')}</TabsTrigger>
          </TabsList>
          <TabsContent value='text' className='flex flex-col gap-2 pt-3'>
            <Textarea
              value={text}
              rows={6}
              aria-label={t('Paste text')}
              placeholder={'Alice, alice@example.com, E001, R&D'}
              onChange={(event) => handleText(event.target.value)}
            />
            <span className='text-muted-foreground text-xs'>
              {t(
                'One member per line: name, email, employee no (optional), team (optional)'
              )}
            </span>
          </TabsContent>
          <TabsContent value='csv' className='pt-3'>
            <div className='flex items-center gap-2'>
              <Input
                type='file'
                accept='.csv,text/csv'
                aria-label={t('Choose CSV file')}
                className='flex-1'
                onChange={(event) => void handleFile(event)}
              />
              <Button
                variant='outline'
                size='sm'
                className='ml-auto shrink-0'
                onClick={downloadTemplate}
              >
                <Download className='h-4 w-4' />
                {t('Download template')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {parseError && (
          <Alert variant='destructive'>
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}
        {rows.length > 0 && !result && (
          <div className='flex flex-col gap-2'>
            <span className='text-muted-foreground text-sm'>
              {t('Preview (first {{count}} rows)', {
                count: Math.min(rows.length, PREVIEW_ROWS),
              })}
            </span>
            <StaticDataTable
              columns={previewColumns}
              data={rows.slice(0, PREVIEW_ROWS)}
              getRowKey={(_, index) => index}
            />
          </div>
        )}
        {result && result.errors.length > 0 && (
          <Alert variant='destructive'>
            <AlertTitle>
              {t('Import rejected: {{count}} rows have errors', {
                count: result.errors.length,
              })}
            </AlertTitle>
            <AlertDescription>
              <StaticDataTable
                columns={errorColumns}
                data={result.errors}
                getRowKey={(row) => row.row}
              />
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Dialog>
  )
}
