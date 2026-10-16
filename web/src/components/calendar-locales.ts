import { enUS, fr, ja, ru, vi, zhCN, zhTW } from 'react-day-picker/locale'

/** 界面语言 → react-day-picker locale；date-picker / datetime-picker / date-range-picker 共用 */
export const calendarLocales = {
  en: enUS,
  zhCN,
  zhTW,
  fr,
  ru,
  ja,
  vi,
} as const

export function resolveCalendarLocale(language: string) {
  return calendarLocales[language as keyof typeof calendarLocales] ?? enUS
}
