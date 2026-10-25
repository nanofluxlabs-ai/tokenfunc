import type { MemberImportRow } from '../types'

// 支持的列名（不区分大小写），中英文表头都可以；旧模板的「部门」列按团队处理
const COLUMN_ALIASES: Record<keyof MemberImportRow, string[]> = {
  name: ['name', '姓名', '名字'],
  email: ['email', '邮箱', '电子邮箱', 'mail'],
  employee_no: [
    'employee_no',
    'employee no',
    'employee no.',
    'no',
    '工号',
    '员工编号',
  ],
  team: ['team', '团队', 'department', '部门'],
}

/** 解析 CSV 文本为二维数组：处理引号、引号内逗号/换行、双引号转义，以及 BOM 与 CRLF */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.startsWith('﻿') ? text.slice(1) : text
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

export type MemberCsvParseResult = {
  rows: MemberImportRow[]
  /** 表头里没有识别出的必需列时给出错误 */
  error?: 'missing_name_column' | 'empty'
}

/** 把 CSV 文本映射成导入行；第一行必须是表头，至少要有姓名列 */
export function parseMemberCsv(text: string): MemberCsvParseResult {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], error: 'empty' }
  const header = table[0].map((cell) => cell.trim().toLowerCase())
  const columnIndex = (key: keyof MemberImportRow) =>
    header.findIndex((cell) => COLUMN_ALIASES[key].includes(cell))
  const indexes = {
    name: columnIndex('name'),
    email: columnIndex('email'),
    employee_no: columnIndex('employee_no'),
    team: columnIndex('team'),
  }
  if (indexes.name < 0) return { rows: [], error: 'missing_name_column' }
  const pick = (cells: string[], index: number) =>
    index >= 0 ? (cells[index] ?? '').trim() : ''
  const rows = table.slice(1).map((cells) => ({
    name: pick(cells, indexes.name),
    email: pick(cells, indexes.email),
    employee_no: pick(cells, indexes.employee_no),
    team: pick(cells, indexes.team),
  }))
  return { rows, error: rows.length === 0 ? 'empty' : undefined }
}

/** 导入模板内容 */
export const MEMBER_CSV_TEMPLATE =
  'name,email,employee_no,team\nAlice,alice@example.com,E001,R&D\n'
