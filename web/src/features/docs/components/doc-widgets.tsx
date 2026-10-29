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
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  CCSwitchDialog,
  type CCSwitchApp,
} from '@/features/keys/components/dialogs/cc-switch-dialog'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { BaseUrlCard } from './base-url-card'

function CCSwitchWidget(props: { app?: string }) {
  const { t } = useTranslation()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const key = useDocsSampleStore((state) => state.key)
  const [open, setOpen] = useState(false)
  const app: CCSwitchApp = props.app === 'codex' ? 'codex' : 'claude'

  let hint = t(
    'Opens CC Switch with this site, your key and the model filled in. Install CC Switch first.'
  )
  if (!signedIn) hint = t('Sign in to import with one click.')
  else if (!key) hint = t('Pick a key under Sample settings above first.')

  return (
    <div className='docs-block border-primary/30 bg-primary/5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <div className='text-foreground text-sm font-semibold'>
          {t('One-click import with CC Switch')}
        </div>
        <p className='text-muted-foreground mt-1 text-xs leading-5'>{hint}</p>
      </div>
      {signedIn ? (
        <Button
          size='sm'
          className='shrink-0'
          disabled={!key}
          onClick={() => setOpen(true)}
        >
          <Download className='size-4' aria-hidden='true' />
          {t('Import to CC Switch')}
        </Button>
      ) : (
        <Button
          size='sm'
          variant='outline'
          className='shrink-0'
          render={<Link to='/sign-in' />}
        >
          {t('Sign in')}
        </Button>
      )}
      {key && (
        <CCSwitchDialog
          open={open}
          onOpenChange={setOpen}
          tokenKey={key.value}
          defaultApp={app}
        />
      )}
    </div>
  )
}

function ContactSalesWidget() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const qrcode =
    typeof status?.sales_qrcode === 'string' ? status.sales_qrcode : ''
  if (!qrcode) return null
  return (
    <img
      src={qrcode}
      alt={t('Sales contact QR code')}
      className='docs-block h-40 w-40 rounded-md border'
    />
  )
}

export function DocWidget(props: {
  name: string
  attrs: Record<string, string>
}) {
  switch (props.name) {
    case 'cc-switch':
      return <CCSwitchWidget app={props.attrs.app} />
    case 'base-url':
      return (
        <div className='docs-block'>
          <BaseUrlCard />
        </div>
      )
    case 'contact-sales':
      return <ContactSalesWidget />
    default:
      return null
  }
}
