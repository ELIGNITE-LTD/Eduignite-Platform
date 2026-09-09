import { describe, expect, it } from 'vitest';
import {
  ancestorIds,
  buildTree,
  descendantIdsInclusive,
  validateMove,
  type StructureNodeLike,
} from '../src/domain/structureTree';

// section -> department -> level (a plausible 3-deep school structure)
const NODES: StructureNodeLike[] = [
  { id: 'section', parent_id: null },
  { id: 'department', parent_id: 'section' },
  { id: 'level', parent_id: 'department' },
  { id: 'other-root', parent_id: null },
];

describe('buildTree', () => {
  it('nests flat rows by parent_id, roots at the top', () => {
    const tree = buildTree(NODES);
    expect(tree.map((t) => t.node.id).sort()).toEqual(['other-root', 'section']);
    const section = tree.find((t) => t.node.id === 'section')!;
    expect(section.children.map((c) => c.node.id)).toEqual(['department']);
    expect(section.children[0].children.map((c) => c.node.id)).toEqual(['level']);
  });

  it('treats a node whose declared parent is missing from the list as a root (defensive)', () => {
    const orphan: StructureNodeLike[] = [{ id: 'orphan', parent_id: 'does-not-exist' }];
    const tree = buildTree(orphan);
    expect(tree.map((t) => t.node.id)).toEqual(['orphan']);
  });
});

describe('ancestorIds', () => {
  it('walks parent_id up to the root, inclusive of every ancestor but not the node itself', () => {
    expect(ancestorIds(NODES, 'level')).toEqual(new Set(['department', 'section']));
    expect(ancestorIds(NODES, 'section')).toEqual(new Set());
  });
});

describe('descendantIdsInclusive', () => {
  it('collects every descendant plus the node itself', () => {
    expect(descendantIdsInclusive(NODES, 'section')).toEqual(new Set(['section', 'department', 'level']));
    expect(descendantIdsInclusive(NODES, 'level')).toEqual(new Set(['level']));
  });
});

describe('validateMove', () => {
  it('allows moving a node to root (null parent)', () => {
    expect(validateMove(NODES, 'level', null)).toEqual({ valid: true });
  });

  it('rejects a node becoming its own parent', () => {
    const result = validateMove(NODES, 'section', 'section');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/own parent/);
  });

  it('rejects moving under a parent that does not exist', () => {
    const result = validateMove(NODES, 'section', 'ghost');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not exist/);
  });

  it('rejects moving a node under one of its own descendants (would create a cycle)', () => {
    const result = validateMove(NODES, 'section', 'level');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/cycle/);
  });

  it('allows a valid re-parent to an unrelated existing node', () => {
    const result = validateMove(NODES, 'level', 'other-root');
    expect(result.valid).toBe(true);
  });
});
