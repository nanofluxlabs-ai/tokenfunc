// TokenFunc 二开：用户分组注册表的新增 / 编辑表单校验。
import type { TFunction } from 'i18next'
import { z } from 'zod'

import { USER_GROUP_KINDS, type UserGroupPayload } from '@/lib/tokenfunc-groups'

/** 与后端一致：小写字母 / 数字开头，之后允许 - 与 _，最长 64 */
export const USER_GROUP_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export const USER_GROUP_LABEL_MAX_LENGTH = 64
export const USER_GROUP_DESCRIPTION_MAX_LENGTH = 255

export type UserGroupFormValues = {
  key: string
  label: string
  kind: UserGroupPayload['kind']
  description: string
}

export const USER_GROUP_FORM_DEFAULT_VALUES: UserGroupFormValues = {
  key: '',
  label: '',
  kind: 'individual',
  description: '',
}

/** 编辑时 key 只读，不再校验格式；其余字段两种模式一致 */
export function getUserGroupFormSchema(t: TFunction, isUpdate: boolean) {
  const keySchema = isUpdate
    ? z.string()
    : z
        .string()
        .trim()
        .min(1, t('Key is required'))
        .regex(
          USER_GROUP_KEY_PATTERN,
          t(
            'Only lowercase letters, digits, hyphens and underscores, up to 64 characters, starting with a letter or digit'
          )
        )
  return z.object({
    key: keySchema,
    label: z
      .string()
      .trim()
      .min(1, t('Name is required'))
      .max(
        USER_GROUP_LABEL_MAX_LENGTH,
        t('Name must be at most {{count}} characters', {
          count: USER_GROUP_LABEL_MAX_LENGTH,
        })
      ),
    kind: z.enum(USER_GROUP_KINDS),
    description: z
      .string()
      .trim()
      .max(
        USER_GROUP_DESCRIPTION_MAX_LENGTH,
        t('Description must be at most {{count}} characters', {
          count: USER_GROUP_DESCRIPTION_MAX_LENGTH,
        })
      ),
  })
}
