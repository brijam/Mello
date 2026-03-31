import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client.js';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

interface SortableChecklistItemProps {
  item: ChecklistItem;
  editingItemId: string | null;
  editItemValue: string;
  editItemInputRef: React.RefObject<HTMLInputElement>;
  onToggle: (item: ChecklistItem) => void;
  onStartEdit: (item: ChecklistItem) => void;
  onEditChange: (value: string) => void;
  onEditSave: (item: ChecklistItem) => void;
  onEditCancel: () => void;
  onDelete: (itemId: string) => void;
}

function SortableChecklistItem({
  item,
  editingItemId,
  editItemValue,
  editItemInputRef,
  onToggle,
  onStartEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
}: SortableChecklistItemProps) {
  const isEditing = editingItemId === item.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: 'none' }}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 group py-1 px-1 rounded hover:bg-gray-50 cursor-grab active:cursor-grabbing"
    >
      <span
        className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity select-none"
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
          <circle cx="8" cy="14" r="1.5" />
        </svg>
      </span>
      <input
        type="checkbox"
        checked={item.checked}
        onChange={() => onToggle(item)}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
      />
      {isEditing ? (
        <input
          ref={editItemInputRef}
          className="flex-1 text-sm border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={editItemValue}
          onChange={(e) => onEditChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={() => onEditSave(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSave(item);
            if (e.key === 'Escape') onEditCancel();
          }}
        />
      ) : (
        <span
          className={`flex-1 text-sm cursor-pointer ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}
          onClick={() => onStartEdit(item)}
        >
          {item.name}
        </span>
      )}
      <button
        onClick={() => onDelete(item.id)}
        onPointerDown={(e) => e.stopPropagation()}
        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-1"
        title="Delete item"
      >
        &times;
      </button>
    </div>
  );
}

export default function CardChecklist({ checklist, onUpdate }: CardChecklistProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(checklist.name);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemValue, setEditItemValue] = useState('');
  const [hideChecked, setHideChecked] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const editItemInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  const sortedItems = [...checklist.items].sort((a, b) => a.position - b.position);

  const displayedItems = hideChecked
    ? sortedItems.filter((i) => !i.checked)
    : sortedItems;

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Work with the full sorted list (not filtered by hideChecked)
    const fullSorted = [...checklist.items].sort((a, b) => a.position - b.position);

    const oldIndex = fullSorted.findIndex((i) => i.id === activeId);
    const overIndex = fullSorted.findIndex((i) => i.id === overId);
    if (oldIndex === -1 || overIndex === -1) return;

    // Remove the dragged item to compute the new position in the remaining array
    const withoutActive = fullSorted.filter((i) => i.id !== activeId);

    // Determine the new index in the withoutActive array
    // If moving down (overIndex > oldIndex), insert after the over item
    // If moving up (overIndex < oldIndex), insert before the over item
    const overInRemaining = withoutActive.findIndex((i) => i.id === overId);
    const newIndex = overIndex > oldIndex ? overInRemaining + 1 : overInRemaining;

    let newPosition: number;
    if (newIndex === 0) {
      // Inserting at beginning
      newPosition = withoutActive[0].position / 2;
    } else if (newIndex >= withoutActive.length) {
      // Inserting at end
      newPosition = withoutActive[withoutActive.length - 1].position + 65536;
    } else {
      // Inserting in middle
      newPosition = (withoutActive[newIndex - 1].position + withoutActive[newIndex].position) / 2;
    }

    try {
      await api.patch(`/checklist-items/${activeId}`, { position: newPosition });
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
        <div className="flex items-center gap-1">
          {checkedCount > 0 && (
            <button
              onClick={() => setHideChecked((v) => !v)}
              className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              {hideChecked ? 'Show checked items' : 'Hide checked items'}
            </button>
          )}
          <button
            onClick={handleDeleteChecklist}
            className="text-sm text-gray-400 hover:text-red-500 px-2 py-1"
            title="Delete checklist"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-gray-500 w-8 text-right">{progressPercent}%</span>
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-sm text-gray-500">{checkedCount}/{totalCount}</span>
        </div>
      )}

      {/* Items */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={displayedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {displayedItems.map((item) => (
              <SortableChecklistItem
                key={item.id}
                item={item}
                editingItemId={editingItemId}
                editItemValue={editItemValue}
                editItemInputRef={editItemInputRef}
                onToggle={handleToggleItem}
                onStartEdit={(item) => {
                  setEditingItemId(item.id);
                  setEditItemValue(item.name);
                }}
                onEditChange={setEditItemValue}
                onEditSave={handleItemNameSave}
                onEditCancel={() => setEditingItemId(null)}
                onDelete={handleDeleteItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
