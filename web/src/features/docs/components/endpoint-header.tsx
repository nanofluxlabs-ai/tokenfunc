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
  GET: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  POST: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
}

/** HTTP method badge + endpoint path, e.g. `POST /v1/chat/completions`. */
export function EndpointHeader(props: {
  method: 'GET' | 'POST'
  path: string
  description?: string
}) {
  return (
    <div className='border-border/60 bg-muted/20 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border p-3'>
      <Badge
        variant='outline'
        className={cn(
          'font-mono text-xs font-semibold',
          METHOD_STYLES[props.method]
        )}
      >
        {props.method}
      </Badge>
      <code className='text-foreground font-mono text-sm font-medium'>
        {props.path}
      </code>
      {props.description && (
        <span className='text-muted-foreground text-xs'>
          {props.description}
        </span>
      )}
    </div>
  )
}
