import type { Department, DepartmentNode } from '../types'

/**
 * 把扁平部门列表构建成树；父部门缺失（已删除或异常数据）的节点挂到顶级，避免丢失
 */
export function buildDepartmentTree(
  departments: Department[]
): DepartmentNode[] {
  const nodes = new Map<number, DepartmentNode>()
  for (const department of departments) {
    nodes.set(department.id, { ...department, depth: 0, children: [] })
  }
  const roots: DepartmentNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const assignDepth = (list: DepartmentNode[], depth: number) => {
    list.sort((a, b) => a.sort - b.sort || a.id - b.id)
    for (const node of list) {
      node.depth = depth
      assignDepth(node.children, depth + 1)
    }
  }
  assignDepth(roots, 0)
  return roots
}

/** 按树的先序遍历展开，用于下拉框（带层级缩进） */
export function flattenDepartmentTree(
  tree: DepartmentNode[]
): DepartmentNode[] {
  const result: DepartmentNode[] = []
  const walk = (list: DepartmentNode[]) => {
    for (const node of list) {
      result.push(node)
      walk(node.children)
    }
  }
  walk(tree)
  return result
}

/** 某部门及其全部子孙的 id，用于编辑时排除不可选的父部门 */
export function collectDescendantIds(
  tree: DepartmentNode[],
  id: number
): Set<number> {
  const ids = new Set<number>()
  const collect = (node: DepartmentNode) => {
    ids.add(node.id)
    node.children.forEach(collect)
  }
  const find = (list: DepartmentNode[]): boolean => {
    for (const node of list) {
      if (node.id === id) {
        collect(node)
        return true
      }
      if (find(node.children)) return true
    }
    return false
  }
  find(tree)
  return ids
}
