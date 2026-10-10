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
import { handleServerError } from '@/lib/handle-server-error'

import { importEmployees } from '../api'
import {
  EMPLOYEE_CSV_TEMPLATE,
  parseEmployeeCsv,
} from '../lib/parse-employee-csv'
import type { EmployeeImportResult, EmployeeImportRow } from '../types'

const PREVIEW_ROWS = 5
const MAX_ROWS = 1000

type EmployeeImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

function downloadTemplate() {
  const blob = new Blob([`\ufeff${EMPLOYEE_CSV_TEMPLATE}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'employees-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function EmployeeImportDialog(props: EmployeeImportDialogProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<EmployeeImportRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<EmployeeImportResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!props.open) return
    setRows([])
    setParseError(null)
    setResult(null)
  }, [props.open])

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setResult(null)
    if (!file) return
    const parsed = parseEmployeeCsv(await file.text())
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
    if (parsed.rows.length > MAX_ROWS) {
      setParseError(
        t('At most {{count}} rows per import.', { count: MAX_ROWS })
      )
      setRows([])
      return
    }
    setParseError(null)
    setRows(parsed.rows)
  }

  const handleImport = async () => {
    setIsSubmitting(true)
    try {
      const response = await importEmployees(rows)
      if (!response.success || !response.data) {
        handleServerError(response)
        return
      }
      setResult(response.data)
      if (response.data.errors.length === 0) {
        toast.success(
          t('Imported {{count}} employees', { count: response.data.created })
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

  const previewColumns: StaticDataTableColumn<EmployeeImportRow>[] = [
    { id: 'name', header: t('Name'), cell: (row) => row.name },
    { id: 'email', header: t('Email'), cell: (row) => row.email || '—' },
    {
      id: 'employee_no',
      header: t('Employee No.'),
      cell: (row) => row.employee_no || '—',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (row) => row.department || '—',
    },
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
      title={t('Import Employees')}
      description={t(
        'Upload a CSV with columns name, email, employee_no and department. Unknown departments are created at the top level. If any row is invalid, nothing is imported.'
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
        <div className='flex flex-wrap items-center gap-2'>
          <Input
            type='file'
            accept='.csv,text/csv'
            aria-label={t('Choose CSV file')}
            className='max-w-sm'
            onChange={(event) => void handleFile(event)}
          />
          <Button variant='outline' size='sm' onClick={downloadTemplate}>
            <Download className='h-4 w-4' />
            {t('Download template')}
          </Button>
        </div>
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
