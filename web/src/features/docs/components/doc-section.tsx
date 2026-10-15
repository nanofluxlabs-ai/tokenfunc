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
import type { ReactNode } from 'react'

/**
 * Titled section with a stable anchor id. `scroll-mt` keeps anchored
 * headings below the sticky public header when jumping to #hash links.
 */
export function DocSection(props: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={props.id} className='scroll-mt-28'>
      <h2 className='text-foreground mt-12 mb-4 text-xl font-semibold tracking-tight'>
        {props.title}
      </h2>
      {props.children}
    </section>
  )
}
