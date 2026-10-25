import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'

import {
  getPromoterOverview,
  getPromoterUserUsage,
  listPromoterModels,
  listPromoterSettlements,
  listPromoterUsers,
} from '../api'
import { PROMOTER_QUERY_KEY } from '../constants'
import type {
  PromoterRangeParams,
  PromoterScope,
  PromoterSettlementParams,
} from '../types'

function scopeKey(scope: PromoterScope) {
  return scope.scope === 'admin' ? ['admin', scope.promoterId] : ['self']
}

/** 结算列表的 query key 前缀（标记 / 撤销后用它失效缓存） */
export function promoterSettlementsKey(scope: PromoterScope) {
  return [PROMOTER_QUERY_KEY, ...scopeKey(scope), 'settlements']
}

export function usePromoterSettlements(
  scope: PromoterScope,
  params: PromoterSettlementParams,
  enabled = true
) {
  return useQuery({
    queryKey: [...promoterSettlementsKey(scope), params],
    queryFn: async () =>
      requireServerSuccess(await listPromoterSettlements(scope, params)).data
        ?.items ?? [],
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function usePromoterOverview(
  scope: PromoterScope,
  range: PromoterRangeParams,
  enabled = true
) {
  return useQuery({
    queryKey: [PROMOTER_QUERY_KEY, ...scopeKey(scope), 'overview', range],
    queryFn: async () =>
      requireServerSuccess(await getPromoterOverview(scope, range)).data ??
      null,
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function usePromoterUsers(
  scope: PromoterScope,
  range: PromoterRangeParams,
  enabled = true
) {
  return useQuery({
    queryKey: [PROMOTER_QUERY_KEY, ...scopeKey(scope), 'users', range],
    queryFn: async () =>
      requireServerSuccess(await listPromoterUsers(scope, range)).data?.items ??
      [],
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function usePromoterModels(
  scope: PromoterScope,
  range: PromoterRangeParams,
  enabled = true
) {
  return useQuery({
    queryKey: [PROMOTER_QUERY_KEY, ...scopeKey(scope), 'models', range],
    queryFn: async () =>
      requireServerSuccess(await listPromoterModels(scope, range)).data ?? null,
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function usePromoterUserUsage(
  scope: PromoterScope,
  userId: number,
  range: PromoterRangeParams,
  enabled = true
) {
  return useQuery({
    queryKey: [
      PROMOTER_QUERY_KEY,
      ...scopeKey(scope),
      'user-usage',
      userId,
      range,
    ],
    queryFn: async () =>
      requireServerSuccess(await getPromoterUserUsage(scope, userId, range))
        .data ?? null,
    enabled: enabled && userId > 0,
  })
}
