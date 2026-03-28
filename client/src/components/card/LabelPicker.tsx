import { useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';
import { api } from '../../api/client.js';
import { getLabelColorClass } from '../../utils/labelColors.js';
import LabelEditor from '../board/LabelEditor.js';

interface LabelPickerProps {
  cardId: string;
  boardId: string;
  cardLabelIds: string[];
  onToggle: (labelId: string, added: boolean) => void;
}

export default function LabelPicker({ cardId, boardId, cardLabelIds, onToggle }: LabelPickerProps) {
  const labels = useBoardStore((s) => s.labels);
  const [editingLabel, setEditingLabel] = useState<
    { id: string; name: string | null; color: string } | 'new' | null
  >(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggle(labelId: string) {
    const isAssigned = cardLabelIds.includes(labelId);
    setToggling(labelId);
    try {
      if (isAssigned) {
        await api.delete(`/cards/${cardId}/labels/${labelId}`);
      } else {
        await api.post(`/cards/${cardId}/labels/${labelId}`);
      }
      onToggle(labelId, !isAssigned);
    } finally {
      setToggling(null);
    }
  }

  function handleEditorSave() {
    setEditingLabel(null);
    // Parent should re-fetch board data to get updated labels
  }

  if (editingLabel !== null) {
    return (
      <LabelEditor
        boardId={boardId}
        label={editingLabel === 'new' ? null : editingLabel}
        onSave={handleEditorSave}
        onCancel={() => setEditingLabel(null)}
      />
    );
  }

  return (
    <div className="p-3 space-y-2">
      <h4 className="text-sm font-semibold text-gray-700 text-center">Labels</h4>

      <div className="space-y-1">
        {labels.map((label) => {
          const isAssigned = cardLabelIds.includes(label.id);
          return (
            <div key={label.id} className="flex items-center gap-1.5">
              <button
                onClick={() => handleToggle(label.id)}
                disabled={toggling === label.id}
                className={`${getLabelColorClass(label.color)} flex-1 flex items-center justify-between rounded px-3 py-1.5 text-sm text-white font-medium hover:opacity-90 disabled:opacity-50`}
              >
                <span>{label.name || '\u00A0'}</span>
                {isAssigned && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setEditingLabel({ id: label.id, name: label.name ?? null, color: label.color })}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Edit label"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setEditingLabel('new')}
        className="w-full text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded py-1.5 font-medium"
      >
        Create a new label
      </button>
    </div>
  );
}
