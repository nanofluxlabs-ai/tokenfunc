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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '@/stores/auth-store'

import { useDocsSampleKey } from './use-docs-sample-key'

/** 示例里密钥的状态提示：未登录 / 没有密钥时引导；已填入密钥时不提示（页面上的密钥已打码） */
export function useSampleKeyHint(): ReactNode {
  const { t } = useTranslation()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const { missing } = useDocsSampleKey(signedIn)

  if (!signedIn) {
    return (
      <Link
        to='/sign-in'
        className='text-foreground underline underline-offset-4'
      >
        {t('Sign in to fill the samples with your own key.')}
      </Link>
    )
  }
  if (missing) {
    return (
      <Link to='/keys' className='text-foreground underline underline-offset-4'>
        {t('Create an API key first to fill it into the samples.')}
      </Link>
    )
  }
  return null
}
