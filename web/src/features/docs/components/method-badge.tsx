/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  POST: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
}

/** 接口的请求方法标签，正文地址栏（md）与侧栏（sm）共用同一套配色 */
export function MethodBadge(props: {
  method: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const method = props.method.toUpperCase()
  return (
    <Badge
      className={cn(
        'rounded-md font-mono font-bold',
        props.size === 'sm' ? 'h-4 w-9 px-0 text-[10px]' : 'h-6 px-2 text-xs',
        METHOD_STYLES[method] ?? 'bg-muted text-foreground',
        props.className
      )}
    >
      {method}
    </Badge>
  )
}
