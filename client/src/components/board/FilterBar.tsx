import { useState, useRef, useEffect } from 'react';
import { getLabelColorClass } from '../../utils/labelColors.js';
import FilterPopover from './FilterPopover.js';

interface FilterBarProps {
  labels: Array<{ id: string; name: string | null; color: string }>;
  members: Array<{ id: string; displayName: string; username: string; avatarUrl: string | null }>;
  activeLabels: string[];
  activeMembers: string[];
  onToggleLabel: (id: string) => void;
  onToggleMember: (id: string) => void;
  onClearFilters: () => void;
}

export default function FilterBar({
  labels,
  members,
  activeLabels,
  activeMembers,
  onToggleLabel,
  onToggleMember,
  onClearFilters,
}: FilterBarProps) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasFilters = activeLabels.length > 0 || activeMembers.length > 0;

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopover]);

  const activeFilterLabels = labels.filter((l) => activeLabels.includes(l.id));
  const activeFilterMembers = members.filter((m) => activeMembers.includes(m.id));

  return (
    <div className="bg-white/90 backdrop-blur-sm px-4 py-2 flex items-center gap-3 overflow-x-auto">
      {/* Filter button */}
      <div className="relative flex-shrink-0" ref={popoverRef}>
        <button
          onClick={() => setShowPopover((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            hasFilters
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter
        </button>

        {showPopover && (
          <FilterPopover
            labels={labels}
            members={members}
            activeLabels={activeLabels}
            activeMembers={activeMembers}
            onToggleLabel={onToggleLabel}
            onToggleMember={onToggleMember}
            onClose={() => setShowPopover(false)}
          />
        )}
      </div>

      {/* Active filter pills */}
      {activeFilterLabels.map((label) => {
        const bgClass = getLabelColorClass(label.color);
        return (
          <button
            key={`label-${label.id}`}
            onClick={() => onToggleLabel(label.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex-shrink-0"
            title="Click to remove filter"
          >
            <span className={`${bgClass} inline-block w-3 h-3 rounded-full`} />
            <span className="text-sm font-medium text-gray-700">{label.name || label.color}</span>
            <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        );
      })}

      {activeFilterMembers.map((member) => (
        <button
          key={`member-${member.id}`}
          onClick={() => onToggleMember(member.id)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex-shrink-0"
          title="Click to remove filter"
        >
          <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-bold">
            {member.displayName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700">{member.displayName}</span>
          <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      ))}

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline flex-shrink-0 ml-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
