// 价目固定按美元展示，与界面语言无关，用合法的固定语言标签
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})

/** 价目表美元：至少 2 位、最多 3 位小数，去掉多余的 0（$15.00、$0.30、$0.125） */
export function formatUsdPerMillion(value: number): string {
  return usdFormatter.format(value)
}
