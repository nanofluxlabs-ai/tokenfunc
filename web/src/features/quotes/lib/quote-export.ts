import DOMPurify from 'dompurify'
import { Marked } from 'marked'

/**
 * 报价单导出：Markdown → 自包含 HTML（打印样式）→ 下载 / 新标签页打印另存 PDF。
 *
 * 关于浏览器打印的页眉页脚：Chrome 打印对话框的「页眉和页脚」开关网页无法关闭，
 * 这里做三件事尽量减弱：`@page margin: 0`（没有 margin 区域可显示页眉页脚，
 * body 自留 padding 承担页边距）、`<title>` 留空（页眉的标题项为空）、
 * UI 上提示用户在打印对话框取消勾选（浏览器会记住）。
 */

/** 与 brand-presets.css 的 tokenfunc 亮色预设对齐的打印配色 */
export const QUOTE_PRINT_THEME = {
  brand: '#1ed760',
  brandInk: '#117a3b',
  brandForeground: '#121212',
  text: '#121212',
  textMuted: '#6a6a6a',
  background: '#ffffff',
  border: '#e8e8e8',
  stripe: '#f3faf5',
  quoteBackground: '#eafaf0',
  codeBackground: '#f1f1f1',
  preBackground: '#121212',
  preText: '#f6f6f6',
} as const

const markdownParser = new Marked({ async: false, gfm: true, breaks: true })

/** 后端生成的 Markdown（含表格单元格里的 <br/>）→ 消毒后的 HTML 片段 */
export function renderQuoteMarkdownToHtml(markdown: string): string {
  const html = markdownParser.parse(markdown) as string
  return DOMPurify.sanitize(html)
}

export function buildQuoteStandaloneHtml(htmlBody: string): string {
  const c = QUOTE_PRINT_THEME
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title></title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
  html, body {
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
    font-size: 10pt; line-height: 1.55; color: ${c.text}; background: ${c.background}; margin: 0;
  }
  body { padding: 12mm 14mm 14mm 14mm; }
  h1 { font-size: 22pt; font-weight: 700; margin: 0 0 4px; padding-bottom: 10px; border-bottom: 3px solid ${c.brand}; }
  h2 { font-size: 15pt; font-weight: 700; margin: 22px 0 10px; border-left: 5px solid ${c.brand}; padding-left: 12px; page-break-after: avoid; break-after: avoid; }
  h3 { font-size: 12pt; font-weight: 700; color: ${c.brandInk}; margin: 14px 0 8px; page-break-after: avoid; break-after: avoid; }
  p { margin: 6px 0; }
  blockquote { margin: 8px 0; padding: 10px 14px; background: ${c.quoteBackground}; border-left: 4px solid ${c.brand}; font-size: 9.5pt; border-radius: 0 4px 4px 0; page-break-inside: avoid; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 8.5pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th { background: ${c.brand} !important; color: ${c.brandForeground} !important; padding: 7px; text-align: left; font-weight: 600; border: 1px solid ${c.brand}; }
  td { padding: 6px 7px; border: 1px solid ${c.border}; vertical-align: top; word-break: break-word; }
  tr:nth-child(even) td { background: ${c.stripe} !important; }
  tr:nth-child(odd) td { background: ${c.background} !important; }
  td strong { color: ${c.brandInk} !important; font-weight: 700; }
  code { font-family: "SF Mono", Menlo, monospace; background: ${c.codeBackground}; padding: 1px 5px; border-radius: 3px; font-size: 9pt; color: ${c.brandInk}; }
  pre { background: ${c.preBackground} !important; color: ${c.preText} !important; padding: 12px 14px; border-radius: 6px; font-size: 9pt; overflow: visible; border-left: 3px solid ${c.brand}; page-break-inside: avoid; break-inside: avoid; white-space: pre-wrap; word-break: break-word; }
  pre code { background: transparent !important; color: inherit !important; padding: 0; }
  hr { border: none; border-top: 1px dashed ${c.border}; margin: 16px 0; }
  ul, ol { margin: 6px 0; padding-left: 1.6em; }
  li { margin: 2px 0; }
  li::marker { color: ${c.brand}; }
  @media screen { body { max-width: 297mm; margin: 16px auto; box-shadow: 0 4px 20px rgba(0,0,0,0.08); } }
</style>
</head>
<body>
${htmlBody}
<script>try { document.title = ''; } catch (_) {}</script>
</body>
</html>`
}

export function quoteFileName(brand: string, date: string, ext: 'md' | 'html') {
  const slug =
    brand
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-') || 'quote'
  return `${slug}-pricing-${date}.${ext}`
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime: string
) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 新标签页打开自包含 HTML 并触发打印；被弹窗拦截时返回 false */
export function openQuotePrintPreview(standaloneHtml: string): boolean {
  const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    return false
  }
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      // 用户仍可在新标签页手动 Ctrl+P
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, 1200)
  return true
}
