import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { upsertSchool } from '../src/repositories/schoolRepository';
import {
  createNode,
  deleteNode,
  getTree,
  listNodes,
  moveNode,
  updateNode,
} from '../src/repositories/structureRepository';

describe('structureRepository', () => {
  let handle: TestDbHandle;
  const SCHOOL_ID = 'SCH-STRUCT';

  beforeEach(() => {
    handle = createTestDb();
    upsertSchool(handle.db, {
      id: SCHOOL_ID,
      name: 'Structure Test School',
      short_name: 'STS',
      principal: '',
      motto: '',
      location: '',
      division: '',
      sub_division: '',
      city_village: '',
      address: '',
      postal_code: null,
      academic_year: '2026-2027',
      active_term: 'TERM_1',
      locale: 'en',
      subscription_currency: 'XAF',
    });
  });

  afterEach(() => {
    handle.close();
  });

  it('creates root and child nodes, and getTree nests them correctly', () => {
    const section = createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: null,
      node_type: 'section',
      name: 'Anglophone Section',
      sort_order: 0,
    });
    const department = createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: section.id,
      node_type: 'department',
      name: 'Science Department',
      sort_order: 0,
    });

    const tree = getTree(handle.db, SCHOOL_ID);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(section.id);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(department.id);
  });

  it('rejects creating a node under a parent from a different school', () => {
    // The app's own repository layer treats `schools` as a single-row table
    // (upsertSchool always updates the one existing row rather than
    // inserting a second), so a genuine second school has to be inserted
    // directly to exercise structureRepository's own cross-school guard in
    // isolation, independent of that single-tenant assumption elsewhere.
    const otherSchoolId = 'SCH-OTHER';
    handle.db
      .prepare(
        `INSERT INTO schools (id, name, short_name, principal, motto, location, division, sub_division,
          city_village, address, postal_code, academic_year, active_term, locale, subscription_currency)
         VALUES (@id, 'Other School', 'OS', '', '', '', '', '', '', '', NULL, '2026-2027', 'TERM_1', 'en', 'XAF')`
      )
      .run({ id: otherSchoolId });

    const foreignNode = createNode(handle.db, {
      school_id: otherSchoolId,
      parent_id: null,
      node_type: 'section',
      name: 'Foreign Section',
      sort_order: 0,
    });

    expect(() =>
      createNode(handle.db, {
        school_id: SCHOOL_ID,
        parent_id: foreignNode.id,
        node_type: 'department',
        name: 'Cross-school department',
        sort_order: 0,
      })
    ).toThrow(/not found in this school/);
  });

  it('updateNode renames and can deactivate a node', () => {
    const node = createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: null,
      node_type: 'level',
      name: 'Form 1',
      sort_order: 0,
    });

    const renamed = updateNode(handle.db, node.id, { name: 'Form One' });
    expect(renamed.name).toBe('Form One');

    const deactivated = updateNode(handle.db, node.id, { is_active: 0 });
    expect(deactivated.is_active).toBe(0);
  });

  it('moveNode re-parents a node and rejects a cycle via the same validation the domain layer tests directly', () => {
    const root = createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: null,
      node_type: 'section',
      name: 'Root',
      sort_order: 0,
    });
    const child = createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: root.id,
      node_type: 'department',
      name: 'Child',
      sort_order: 0,
    });
    const grandchild = createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: child.id,
      node_type: 'level',
      name: 'Grandchild',
      sort_order: 0,
    });

    // Valid move: grandchild becomes a root.
    const moved = moveNode(handle.db, grandchild.id, null);
    expect(moved.parent_id).toBeNull();

    // Invalid: moving root under its own descendant (child) must be rejected
    // end-to-end through the repository, not just the pure domain function.
    expect(() => moveNode(handle.db, root.id, child.id)).toThrow(/cycle/);

    // The rejected move must not have partially applied.
    const rootAfter = listNodes(handle.db, SCHOOL_ID).find((n) => n.id === root.id)!;
    expect(rootAfter.parent_id).toBeNull();
  });

  it('deleteNode cascades to children (self-referencing FK ON DELETE CASCADE)', () => {
    const root = createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: null,
      node_type: 'section',
      name: 'Root',
      sort_order: 0,
    });
    createNode(handle.db, {
      school_id: SCHOOL_ID,
      parent_id: root.id,
      node_type: 'department',
      name: 'Child',
      sort_order: 0,
    });

    deleteNode(handle.db, root.id);

    expect(listNodes(handle.db, SCHOOL_ID)).toHaveLength(0);
  });
});
