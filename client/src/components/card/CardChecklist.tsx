import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client.js';

interface ChecklistItem {
  id: string;
  name: string;
  checked: boolean;
  position: number;
}

interface Checklist {
  id: string;
  name: string;
  position: number;
  items: ChecklistItem[];
}

interface CardChecklistProps {
  checklist: Checklist;
  onUpdate: () => void;
}

export default function CardChecklist({ checklist, onUpdate }: CardChecklistProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(checklist.name);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemValue, setEditItemValue] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const editItemInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  useEffect(() => {
    if (addingItem) newItemInputRef.current?.focus();
  }, [addingItem]);

  useEffect(() => {
    if (editingItemId) editItemInputRef.current?.focus();
  }, [editingItemId]);

  const checkedCount = checklist.items.filter((i) => i.checked).length;
  const totalCount = checklist.items.length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const handleNameSave = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === checklist.name) {
      setNameValue(checklist.name);
      setEditingName(false);
      return;
    }
    try {
      await api.patch(`/checklists/${checklist.id}`, { name: trimmed });
      onUpdate();
    } catch {
      setNameValue(checklist.name);
    }
    setEditingName(false);
  };

  const handleDeleteChecklist = async () => {
    if (!confirm('Delete this checklist?')) return;
    try {
      await api.delete(`/checklists/${checklist.id}`);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleToggleItem = async (item: ChecklistItem) => {
    try {
      await api.patch(`/checklist-items/${item.id}`, { checked: !item.checked });
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleAddItem = async () => {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    try {
      await api.post(`/checklists/${checklist.id}/items`, { name: trimmed });
      setNewItemName('');
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleItemNameSave = async (item: ChecklistItem) => {
    const trimmed = editItemValue.trim();
    if (!trimmed || trimmed === item.name) {
      setEditingItemId(null);
      return;
    }
    try {
      await api.patch(`/checklist-items/${item.id}`, { name: trimmed });
      onUpdate();
    } catch {
      // ignore
    }
    setEditingItemId(null);
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await api.delete(`/checklist-items/${itemId}`);
      onUpdate();
    } catch {
      // ignore
    }
  };

  return (
    <div className="mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        {editingName ? (
          <input
            ref={nameInputRef}
            className="text-sm font-semibold border border-blue-400 rounded px-2 py-1 flex-1 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSave();
              if (e.key === 'Escape') {
                setNameValue(checklist.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <h4
            className="text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2"
            onClick={() => {
              setNameValue(checklist.name);
              setEditingName(true);
            }}
          >
            {checklist.name}
          </h4>
        )}
        <button
          onClick={handleDeleteChecklist}
          className="text-xs text-gray-400 hover:text-red-500 px-2 py-1"
          title="Delete checklist"
        >
          Delete
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500 w-8 text-right">{progressPercent}%</span>
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{checkedCount}/{totalCount}</span>
        </div>
      )}

      {/* Items */}
      <div className="space-y-1">
        {checklist.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 group py-1 px-1 rounded hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => handleToggleItem(item)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
            />
            {editingItemId === item.id ? (
              <input
                ref={editItemInputRef}
                className="flex-1 text-sm border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={editItemValue}
                onChange={(e) => setEditItemValue(e.target.value)}
                onBlur={() => handleItemNameSave(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleItemNameSave(item);
                  if (e.key === 'Escape') setEditingItemId(null);
                }}
              />
            ) : (
              <span
                className={`flex-1 text-sm cursor-pointer ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}
                onClick={() => {
                  setEditingItemId(item.id);
                  setEditItemValue(item.name);
                }}
              >
                {item.name}
              </span>
            )}
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-1"
              title="Delete item"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Add item */}
      {addingItem ? (
        <div className="mt-2">
          <input
            ref={newItemInputRef}
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add an item..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddItem();
              if (e.key === 'Escape') {
                setAddingItem(false);
                setNewItemName('');
              }
            }}
          />
          <div className="flex gap-2 mt-1.5">
            <button
              onClick={handleAddItem}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAddingItem(false);
                setNewItemName('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingItem(true)}
          className="mt-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded"
        >
          + Add an item
        </button>
      )}
    </div>
  );
}
