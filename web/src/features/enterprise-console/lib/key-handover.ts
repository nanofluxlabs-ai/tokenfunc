/** 交付文案：持有人、接入地址、key、文档入口，便于一次复制发给成员 */
export function buildKeyHandoverText(params: {
  memberName?: string
  baseUrl: string
  key: string
  docsUrl: string
}): string {
  const lines: string[] = []
  if (params.memberName) lines.push(`Hi ${params.memberName},`)
  lines.push(`Base URL: ${params.baseUrl}`)
  lines.push(`API Key: ${params.key}`)
  lines.push(`Docs: ${params.docsUrl}`)
  return lines.join('\n')
}
