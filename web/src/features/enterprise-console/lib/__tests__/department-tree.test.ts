import { describe, expect, test } from 'vitest'

import type { Department } from '../../types'
import {
  buildDepartmentTree,
  collectDescendantIds,
  flattenDepartmentTree,
} from '../department-tree'

const departments: Department[] = [
  { id: 3, parent_id: 1, name: 'Backend', sort: 1 },
  { id: 1, parent_id: 0, name: 'R&D', sort: 0 },
  { id: 2, parent_id: 1, name: 'Frontend', sort: 0 },
  { id: 4, parent_id: 99, name: 'Orphan', sort: 0 },
]

describe('department tree', () => {
  test('flattened tree lists parents before children ordered by sort with depth', () => {
    const flat = flattenDepartmentTree(buildDepartmentTree(departments))
    expect(flat.map((node) => [node.name, node.depth])).toEqual([
      ['R&D', 0],
      ['Frontend', 1],
      ['Backend', 1],
      ['Orphan', 0],
    ])
  })

  test('department with a missing parent is kept as a root', () => {
    const roots = buildDepartmentTree(departments)
    expect(roots.map((node) => node.name)).toContain('Orphan')
  })

  test('descendant ids include the department itself and all children', () => {
    const tree = buildDepartmentTree(departments)
    expect([...collectDescendantIds(tree, 1)].sort()).toEqual([1, 2, 3])
    expect([...collectDescendantIds(tree, 404)]).toEqual([])
  })
})
