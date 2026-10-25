import { useMutation } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { removePromoter } from './api'
import { AddPromoterDialog } from './components/add-promoter-dialog'
import { BindingsSheet } from './components/bindings-sheet'
import {
  PromotersProvider,
  usePromoters,
} from './components/promoters-provider'
import { PromotersTable } from './components/promoters-table'

function PromotersContent() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow, setCurrentRow, triggerRefresh } =
    usePromoters()
  const remove = useMutation({
    mutationFn: async (id: number) =>
      requireServerSuccess(await removePromoter(id)).data,
    onSuccess: (data) => {
      toast.success(
        t('Promoter removed, {{count}} users unbound', {
          count: data?.unbound_count ?? 0,
        })
      )
      setOpen(null)
      setCurrentRow(null)
      triggerRefresh()
    },
    onError: (error) =>
      handleServerError(error, t('Failed to remove promoter')),
  })

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>{t('Promoters')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            size='sm'
            onClick={() => {
              setCurrentRow(null)
              setOpen('create')
            }}
          >
            <Plus className='h-4 w-4' />
            {t('Add Promoter')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <PromotersTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <AddPromoterDialog
        open={open === 'create'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
      />
      <BindingsSheet
        open={open === 'bindings'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        promoter={open === 'bindings' ? currentRow : null}
      />
      <ConfirmDialog
        open={open === 'remove'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        title={t('Remove promoter')}
        desc={t(
          'Remove {{username}} from the promoter program? {{count}} bound users will be unbound at the same time. History is kept for audit.',
          {
            username: currentRow?.username ?? '',
            count: currentRow?.bound_user_count ?? 0,
          }
        )}
        destructive
        confirmText={t('Remove')}
        isLoading={remove.isPending}
        handleConfirm={() => currentRow && remove.mutate(currentRow.id)}
      />
    </>
  )
}

export function PromotersPage() {
  return (
    <PromotersProvider>
      <PromotersContent />
    </PromotersProvider>
  )
}
