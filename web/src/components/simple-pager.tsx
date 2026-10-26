import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type SimplePagerProps = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

/** 列表底部的「总数 + 上一页 / 下一页」分页条，给不走 TanStack Table 的静态表格用 */
export function SimplePager(props: SimplePagerProps) {
  const { t } = useTranslation()
  const pageCount = Math.max(1, Math.ceil(props.total / props.pageSize))
  return (
    <div className='text-muted-foreground flex items-center justify-end gap-2 text-sm'>
      <span>{t('Total: {{count}}', { count: props.total })}</span>
      <Button
        variant='outline'
        size='sm'
        disabled={props.page <= 1}
        onClick={() => props.onPageChange(props.page - 1)}
      >
        {t('Previous')}
      </Button>
      <span>
        {props.page} / {pageCount}
      </span>
      <Button
        variant='outline'
        size='sm'
        disabled={props.page >= pageCount}
        onClick={() => props.onPageChange(props.page + 1)}
      >
        {t('Next')}
      </Button>
    </div>
  )
}
