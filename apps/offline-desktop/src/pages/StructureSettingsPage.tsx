import React, { useCallback, useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { StructureNodeTree } from '../shared/types';

/**
 * Basic academic structure-tree admin UI (Phase A #5 -- "doesn't need to be
 * polished, but needs to exist enough to prove the CRUD IPC works end-to-end"
 * per the build contract; a nicer UI is explicitly Phase B/C's job). A
 * simple recursive tree view with add-child / rename / deactivate / move-up
 * controls -- no drag-and-drop.
 */
export default function StructureSettingsPage() {
  const { school } = useSchool();
  const [tree, setTree] = useState<StructureNodeTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!school) return;
    setLoading(true);
    try {
      const result = await window.api.structure.tree(school.id);
      setTree(result);
    } finally {
      setLoading(false);
    }
  }, [school]);

  useEffect(() => {
    load();
  }, [load]);

  async function addChild(parentId: string | null) {
    if (!school) return;
    const name = window.prompt('Name for the new node (e.g. "Science Department"):');
    if (!name) return;
    const nodeType = window.prompt('Node type (e.g. "department", "level", "stream"):', 'section') || 'section';
    setError(null);
    try {
      await window.api.structure.create({
        school_id: school.id,
        parent_id: parentId,
        node_type: nodeType,
        name,
        sort_order: 0,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function rename(nodeId: string, currentName: string) {
    const name = window.prompt('New name:', currentName);
    if (!name || name === currentName) return;
    setError(null);
    try {
      await window.api.structure.update(nodeId, { name });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleActive(nodeId: string, isActive: number) {
    setError(null);
    try {
      await window.api.structure.update(nodeId, { is_active: isActive ? 0 : 1 });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(nodeId: string) {
    if (!window.confirm('Delete this node and all its children? This cannot be undone.')) return;
    setError(null);
    try {
      await window.api.structure.delete(nodeId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moveToRoot(nodeId: string) {
    setError(null);
    try {
      await window.api.structure.move(nodeId, null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!school) return null;

  return (
    <div>
      <h1 className="page-title">Academic Structure</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Build your school's own section / department / level / stream hierarchy. Not every school uses
        every layer -- a node's meaning comes from where it sits in the tree, not a fixed name.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2 mb-4">{error}</div>
      )}

      <div className="card space-y-2">
        <button type="button" className="btn-secondary mb-2" onClick={() => addChild(null)}>
          + Add top-level node
        </button>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="text-sm text-muted-foreground">No structure nodes yet.</div>
        ) : (
          <ul className="space-y-1">
            {tree.map((node) => (
              <StructureNodeItem
                key={node.id}
                node={node}
                depth={0}
                onAddChild={addChild}
                onRename={rename}
                onToggleActive={toggleActive}
                onDelete={remove}
                onMoveToRoot={moveToRoot}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StructureNodeItem({
  node,
  depth,
  onAddChild,
  onRename,
  onToggleActive,
  onDelete,
  onMoveToRoot,
}: {
  node: StructureNodeTree;
  depth: number;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, currentName: string) => void;
  onToggleActive: (id: string, isActive: number) => void;
  onDelete: (id: string) => void;
  onMoveToRoot: (id: string) => void;
}) {
  return (
    <li>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 20 }}>
        <span className={`text-sm ${node.is_active ? '' : 'text-muted-foreground line-through'}`}>
          {node.name}
        </span>
        <span className="text-xs text-muted-foreground">({node.node_type})</span>
        <div className="flex gap-2 ml-auto text-xs">
          <button type="button" className="text-primary hover:underline" onClick={() => onAddChild(node.id)}>
            + child
          </button>
          <button type="button" className="text-primary hover:underline" onClick={() => onRename(node.id, node.name)}>
            rename
          </button>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onToggleActive(node.id, node.is_active)}
          >
            {node.is_active ? 'deactivate' : 'activate'}
          </button>
          {depth > 0 && (
            <button type="button" className="text-primary hover:underline" onClick={() => onMoveToRoot(node.id)}>
              move to root
            </button>
          )}
          <button type="button" className="text-destructive hover:underline" onClick={() => onDelete(node.id)}>
            delete
          </button>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <StructureNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onRename={onRename}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onMoveToRoot={onMoveToRoot}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
