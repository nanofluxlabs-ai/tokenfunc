import { createSectionRegistry } from '@/features/system-settings/utils/section-registry'

const FINANCE_SECTIONS = [
  { id: 'overview', titleKey: 'Business Overview', build: () => null },
  { id: 'orders', titleKey: 'Order Center', build: () => null },
  { id: 'user-consumption', titleKey: 'User Consumption', build: () => null },
  { id: 'model-consumption', titleKey: 'Model Consumption', build: () => null },
  { id: 'enterprise-bills', titleKey: 'Enterprise Bills', build: () => null },
] as const

export type FinanceSectionId = (typeof FINANCE_SECTIONS)[number]['id']

const financeRegistry = createSectionRegistry<
  FinanceSectionId,
  Record<string, never>,
  []
>({
  sections: FINANCE_SECTIONS,
  defaultSection: 'overview',
  basePath: '/finance',
  urlStyle: 'path',
})

export const FINANCE_SECTION_IDS = financeRegistry.sectionIds
export const FINANCE_DEFAULT_SECTION = financeRegistry.defaultSection
export const FINANCE_SECTION_TITLE_KEYS: Record<FinanceSectionId, string> =
  Object.fromEntries(
    FINANCE_SECTIONS.map((section) => [section.id, section.titleKey])
  ) as Record<FinanceSectionId, string>

export function isFinanceSectionId(value: string): value is FinanceSectionId {
  return (FINANCE_SECTION_IDS as readonly string[]).includes(value)
}

/** 页头日期范围对除企业账单（按账期，不按日期）外的所有 tab 生效 */
export function sectionUsesSharedRange(section: FinanceSectionId): boolean {
  return section !== 'enterprise-bills'
}
