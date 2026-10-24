/** 把多行文本解析成用户名 / ID 列表（按换行、逗号、分号切分，去空去重，保持顺序） */
export function parseBatchInputs(text: string): string[] {
  const seen = new Set<string>()
  const inputs: string[] = []
  for (const raw of text.split(/[\n,，;；]/)) {
    const value = raw.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    inputs.push(value)
  }
  return inputs
}
