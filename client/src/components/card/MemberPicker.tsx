import { useState } from 'react';
import { useBoardStore } from '../../stores/boardStore.js';
import { api } from '../../api/client.js';

interface MemberPickerProps {
  cardId: string;
  boardId: string;
  cardMemberIds: string[];
  onToggle: (userId: string, added: boolean) => void;
}

export default function MemberPicker({ cardId, cardMemberIds, onToggle }: MemberPickerProps) {
  const members = useBoardStore((s) => s.members);
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggle(userId: string) {
    const isAssigned = cardMemberIds.includes(userId);
    setToggling(userId);
    try {
      if (isAssigned) {
        await api.delete(`/cards/${cardId}/members/${userId}`);
      } else {
        await api.post(`/cards/${cardId}/members/${userId}`);
      }
      onToggle(userId, !isAssigned);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="p-3 space-y-2">
      <h4 className="text-sm font-semibold text-gray-700 text-center">Members</h4>

      <div className="space-y-1">
        {members.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-2">No board members found</p>
        )}
        {members.map((member) => {
          const isAssigned = cardMemberIds.includes(member.id);
          return (
            <button
              key={member.id}
              onClick={() => handleToggle(member.id)}
              disabled={toggling === member.id}
              className={`w-full flex items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 ${
                isAssigned ? 'bg-blue-50' : ''
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-white flex-shrink-0 overflow-hidden">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  member.displayName.charAt(0).toUpperCase()
                )}
              </div>
              <span className="flex-1 text-left text-gray-800 truncate">
                {member.displayName}
              </span>
              {isAssigned && (
                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
