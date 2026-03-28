import { getLabelColorClass } from '../../utils/labelColors.js';

interface FilterPopoverProps {
  labels: Array<{ id: string; name: string | null; color: string }>;
  members: Array<{ id: string; displayName: string; username: string; avatarUrl: string | null }>;
  activeLabels: string[];
  activeMembers: string[];
  onToggleLabel: (id: string) => void;
  onToggleMember: (id: string) => void;
  onClose: () => void;
}

export default function FilterPopover({
  labels,
  members,
  activeLabels,
  activeMembers,
  onToggleLabel,
  onToggleMember,
  onClose,
}: FilterPopoverProps) {
  return (
    <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-800">Filter Cards</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          &times;
        </button>
      </div>

      <div className="p-4 max-h-[350px] overflow-y-auto">
        {/* Labels section */}
        {labels.length > 0 && (
          <section className="mb-4">
            <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Labels</h4>
            <div className="flex flex-col gap-1.5">
              {labels.map((label) => {
                const isActive = activeLabels.includes(label.id);
                const bgClass = getLabelColorClass(label.color);
                return (
                  <button
                    key={label.id}
                    onClick={() => onToggleLabel(label.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      isActive
                        ? 'bg-blue-50 ring-2 ring-blue-400'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className={`${bgClass} inline-block w-10 h-5 rounded`} />
                    <span className="text-sm font-medium text-gray-800 flex-1">
                      {label.name || label.color}
                    </span>
                    {isActive && (
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Members section */}
        {members.length > 0 && (
          <section>
            <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Members</h4>
            <div className="flex flex-col gap-1.5">
              {members.map((member) => {
                const isActive = activeMembers.includes(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => onToggleMember(member.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      isActive
                        ? 'bg-blue-50 ring-2 ring-blue-400'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {member.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-800 flex-1">
                      {member.displayName}
                    </span>
                    {isActive && (
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {labels.length === 0 && members.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No labels or members to filter by</p>
        )}
      </div>
    </div>
  );
}
