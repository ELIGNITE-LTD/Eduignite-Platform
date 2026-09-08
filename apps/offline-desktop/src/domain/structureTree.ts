// Pure logic for the configurable academic structure tree (Phase A #2 —
// "section"/"department"/"level"/"stream"/etc, school-defined, not a fixed
// enum). No DB imports — src/repositories/structureRepository.ts fetches the
// rows and calls into here for anything that isn't a plain CRUD statement.

export interface StructureNodeLike {
  id: string;
  parent_id: string | null;
}

export interface StructureTreeNode<T extends StructureNodeLike = StructureNodeLike> {
  node: T;
  children: StructureTreeNode<T>[];
}

/**
 * Builds the nested tree from a flat list of nodes (all belonging to one
 * school — the repository is responsible for that scoping). Nodes whose
 * declared parent isn't present in the list (shouldn't happen given the FK,
 * but defensive) are treated as roots rather than silently dropped.
 */
export function buildTree<T extends StructureNodeLike>(nodes: T[]): StructureTreeNode<T>[] {
  const byId = new Map<string, StructureTreeNode<T>>();
  for (const node of nodes) {
    byId.set(node.id, { node, children: [] });
  }

  const roots: StructureTreeNode<T>[] = [];
  for (const node of nodes) {
    const wrapped = byId.get(node.id)!;
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(wrapped);
    } else {
      roots.push(wrapped);
    }
  }
  return roots;
}

/** Every id in the (inclusive) ancestor chain of `nodeId`, walking parent_id up to a root. */
export function ancestorIds(nodes: StructureNodeLike[], nodeId: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ancestors = new Set<string>();
  let current = byId.get(nodeId);
  const guardAgainstCycles = new Set<string>();
  while (current?.parent_id) {
    if (guardAgainstCycles.has(current.parent_id)) break; // corrupt data safety valve
    guardAgainstCycles.add(current.parent_id);
    ancestors.add(current.parent_id);
    current = byId.get(current.parent_id);
  }
  return ancestors;
}

/** Every id in the (inclusive) descendant set of `nodeId` (nodeId itself included). */
export function descendantIdsInclusive(nodes: StructureNodeLike[], nodeId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const list = childrenOf.get(n.parent_id) ?? [];
    list.push(n.id);
    childrenOf.set(n.parent_id, list);
  }

  const result = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of childrenOf.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}

export interface MoveValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a proposed "set nodeId's parent to newParentId" move. Rejects:
 *  - moving a node under itself,
 *  - moving a node under one of its own descendants (would create a cycle),
 *  - moving a node under a parent that doesn't exist in this school's tree.
 * `newParentId === null` (moving to root) is always valid structurally.
 */
export function validateMove(
  nodes: StructureNodeLike[],
  nodeId: string,
  newParentId: string | null
): MoveValidationResult {
  if (newParentId === null) return { valid: true };

  if (newParentId === nodeId) {
    return { valid: false, reason: 'A node cannot be its own parent.' };
  }

  const exists = nodes.some((n) => n.id === newParentId);
  if (!exists) {
    return { valid: false, reason: `Target parent "${newParentId}" does not exist.` };
  }

  const descendants = descendantIdsInclusive(nodes, nodeId);
  if (descendants.has(newParentId)) {
    return {
      valid: false,
      reason: 'Cannot move a node under one of its own descendants — this would create a cycle.',
    };
  }

  return { valid: true };
}
