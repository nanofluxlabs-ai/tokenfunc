import type { MemberImportRow } from '../types'

export type MemberLineError = {
  line: number
  reason: 'missing_email' | 'too_many_fields'
}

export type MemberLinesParseResult = {
  rows: MemberImportRow[]
  errors: MemberLineError[]
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FIELD_SEPARATOR = /\s*[,，;；\t]\s*/

/**
 * 一行拆成字段：优先按逗号 / 分号 / 制表符；整行没有这些分隔符时按空白拆，
 * 此时以第一个像邮箱的片段为锚点，之前的片段合成姓名（姓名可含空格），之后依次为工号、团队。
 */
function splitLine(line: string): string[] {
  const byPunctuation = line.split(FIELD_SEPARATOR).map((field) => field.trim())
  if (byPunctuation.length > 1) return byPunctuation
  const tokens = line.split(/\s+/)
  const emailIndex = tokens.findIndex((token) => EMAIL_PATTERN.test(token))
  if (emailIndex < 0) return tokens
  const [employeeNo = '', ...teamTokens] = tokens.slice(emailIndex + 1)
  return [
    tokens.slice(0, emailIndex).join(' '),
    tokens[emailIndex],
    employeeNo,
    teamTokens.join(' '),
  ].filter((field, index) => index < 2 || field !== '')
}

/**
 * 粘贴文本批量导入：一行一人，`姓名, 邮箱, 工号(可选), 团队(可选)`。
 * 产出与 CSV 解析相同的导入行；邮箱缺失 / 不像邮箱、字段多于 4 个的行记错误并标明行号（从 1 起，空行也计数）。
 */
export function parseMemberLines(text: string): MemberLinesParseResult {
  const rows: MemberImportRow[] = []
  const errors: MemberLineError[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (line === '') return
    const fields = splitLine(line)
    if (fields.length > 4) {
      errors.push({ line: index + 1, reason: 'too_many_fields' })
      return
    }
    const [name = '', email = '', employee_no = '', team = ''] = fields
    if (!EMAIL_PATTERN.test(email)) {
      errors.push({ line: index + 1, reason: 'missing_email' })
      return
    }
    rows.push({ name, email, employee_no, team })
  })
  return { rows, errors }
}
