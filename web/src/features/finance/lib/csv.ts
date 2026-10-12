/** 文件名里去掉路径分隔与控制字符 */
function sanitizeFilenamePart(value: string): string {
  return (
    value
      .replaceAll(/\p{Cc}/gu, '')
      .replaceAll(/[\\/:*?"<>|]+/g, '_')
      .trim() || 'export'
  )
}

/** 用量 CSV 文件名：{主体}-{起}~{止}-{后缀}.csv */
export function buildUsageCsvFilename(
  subject: string,
  start: string,
  end: string,
  suffix: string
): string {
  return `${sanitizeFilenamePart(subject)}-${start}~${end}-${suffix}.csv`
}

/** 后端在业务失败时仍返回 JSON（success=false）；按 blob 的 MIME 判断并读出 message */
export async function readBlobError(blob: Blob): Promise<string | null> {
  if (!blob.type.includes('application/json')) return null
  try {
    const parsed = JSON.parse(await blob.text()) as { message?: string }
    return parsed.message || 'Export failed'
  } catch {
    return 'Export failed'
  }
}

/** 触发浏览器下载 */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
