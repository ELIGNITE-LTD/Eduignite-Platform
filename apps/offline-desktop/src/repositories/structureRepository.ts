import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { StructureNode, StructureNodeTree } from '../shared/types';
import { buildTree, validateMove } from '../domain/structureTree';
import { enqueueChange } from './syncQueueRepository';

// Configurable academic structure tree (Phase A #2). CRUD + a "full tree for
// school" read built in JS from a flat SELECT (simpler and more portable
// across SQLite builds than a recursive CTE, and the tree is small enough
// per school — tens of nodes, not thousands — that this is not a perf
// concern).

export type StructureNodeInput = Omit<StructureNode, 'id' | 'is_active' | 'created_at' | 'updated_at'>;

export function listNodes(db: Database.Database, schoolId: string): StructureNode[] {
  return db
    .prepare('SELECT * FROM structure_nodes WHERE school_id = ? ORDER BY sort_order, name')
    .all(schoolId) as StructureNode[];
}

export function getNode(db: Database.Database, id: string): StructureNode | null {
  const row = db.prepare('SELECT * FROM structure_nodes WHERE id = ?').get(id) as StructureNode | undefined;
  return row ?? null;
}

/** Full tree for a school, nested by parent_id. Root nodes have parent_id === null. */
export function getTree(db: Database.Database, schoolId: string): StructureNodeTree[] {
  const nodes = listNodes(db, schoolId);
  return buildTree(nodes) as unknown as StructureNodeTree[];
}

export function createNode(db: Database.Database, input: StructureNodeInput): StructureNode {
  if (input.parent_id) {
    const parent = getNode(db, input.parent_id);
    if (!parent || parent.school_id !== input.school_id) {
      throw new Error(`Parent node ${input.parent_id} not found in this school.`);
    }
  }

  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO structure_nodes (id, school_id, parent_id, node_type, name, sort_order, is_active, created_at, updated_at)
     VALUES (@id, @school_id, @parent_id, @node_type, @name, @sort_order, 1, @created_at, @updated_at)`
  ).run({ id, ...input, parent_id: input.parent_id ?? null, created_at: now, updated_at: now });
  const created = getNode(db, id) as StructureNode;
  enqueueChange(db, 'structure_nodes', id, 'insert', created);
  return created;
}

export function updateNode(
  db: Database.Database,
  id: string,
  input: Partial<Pick<StructureNode, 'node_type' | 'name' | 'sort_order' | 'is_active'>>
): StructureNode {
  const existing = getNode(db, id);
  if (!existing) throw new Error(`Structure node ${id} not found.`);
  const merged = { ...existing, ...input, updated_at: nowIso() };
  db.prepare(
    `UPDATE structure_nodes SET node_type = @node_type, name = @name, sort_order = @sort_order,
      is_active = @is_active, updated_at = @updated_at WHERE id = @id`
  ).run(merged);
  const updated = getNode(db, id) as StructureNode;
  enqueueChange(db, 'structure_nodes', id, 'update', updated);
  return updated;
}

/**
 * Re-parents a node, validated against domain/structureTree.ts's
 * `validateMove` (no self-parenting, no moving under one's own descendants).
 * Throws with the validation's human-readable reason on rejection.
 */
export function moveNode(db: Database.Database, id: string, newParentId: string | null): StructureNode {
  const existing = getNode(db, id);
  if (!existing) throw new Error(`Structure node ${id} not found.`);

  const siblingsAndSelf = listNodes(db, existing.school_id);
  const result = validateMove(siblingsAndSelf, id, newParentId);
  if (!result.valid) throw new Error(result.reason ?? 'Invalid move.');

  if (newParentId) {
    const parent = getNode(db, newParentId);
    if (!parent || parent.school_id !== existing.school_id) {
      throw new Error(`Parent node ${newParentId} not found in this school.`);
    }
  }

  const now = nowIso();
  db.prepare('UPDATE structure_nodes SET parent_id = ?, updated_at = ? WHERE id = ?').run(
    newParentId,
    now,
    id
  );
  const updated = getNode(db, id) as StructureNode;
  enqueueChange(db, 'structure_nodes', id, 'update', updated);
  return updated;
}

export function deleteNode(db: Database.Database, id: string): void {
  const existing = getNode(db, id);
  if (!existing) return;
  db.prepare('DELETE FROM structure_nodes WHERE id = ?').run(id);
  enqueueChange(db, 'structure_nodes', id, 'delete', { id });
}
