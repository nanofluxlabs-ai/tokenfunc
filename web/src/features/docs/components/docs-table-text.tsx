/**
 * 文档表格里的说明文字：完整换行显示，不截断。
 *
 * StaticDataTable 会把 children 只是一段文本的单元格包进单行截断（TruncatedCell），
 * 文档说明需要读全，手机上更不能截成一行，所以文本走 text 属性而不是 children。
 */
export function DocsTableText(props: { text: string }) {
  return (
    <p className='text-muted-foreground m-0 text-sm leading-relaxed'>
      {props.text}
    </p>
  )
}
