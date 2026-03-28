import { useState } from 'react';
import { LABEL_COLORS } from '@mello/shared';
import { api } from '../../api/client.js';
import { getLabelColorClass } from '../../utils/labelColors.js';

interface LabelEditorProps {
  boardId: string;
  label?: { id: string; name: string | null; color: string } | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function LabelEditor({ boardId, label, onSave, onCancel }: LabelEditorProps) {
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? LABEL_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const isEditing = !!label;

  async function handleSave() {
    setSaving(true);
    try {
      if (isEditing) {
        await api.patch(`/labels/${label!.id}`, { name: name || null, color });
      } else {
        await api.post(`/boards/${boardId}/labels`, { name: name || undefined, color });
      }
      onSave();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!label) return;
    setSaving(true);
    try {
      await api.delete(`/labels/${label.id}`);
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 text-center">
        {isEditing ? 'Edit Label' : 'Create Label'}
      </h4>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Label name (optional)"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
        <div className="grid grid-cols-5 gap-1.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`${getLabelColorClass(c)} h-8 rounded cursor-pointer ${
                color === c ? 'ring-2 ring-offset-1 ring-gray-700' : ''
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 text-white text-sm font-medium py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isEditing ? 'Save' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>

      {isEditing && (
        <button
          onClick={handleDelete}
          disabled={saving}
          className="w-full text-sm text-red-600 hover:text-red-800 py-1 disabled:opacity-50"
        >
          Delete Label
        </button>
      )}
    </div>
  );
}
