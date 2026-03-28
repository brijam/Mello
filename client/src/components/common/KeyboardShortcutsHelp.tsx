import Modal from './Modal.js';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['Ctrl', 'K'], description: 'Open search' },
  { keys: ['/'], description: 'Focus search bar' },
  { keys: ['n'], description: 'Add a card to the first list' },
  { keys: ['Esc'], description: 'Close any open modal or dropdown' },
  { keys: ['?'], description: 'Show this help dialog' },
];

export default function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-6">
          <table className="w-full">
            <tbody>
              {shortcuts.map((shortcut, idx) => (
                <tr key={idx} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-gray-400 mx-0.5">+</span>}
                          <kbd className="inline-flex items-center justify-center min-w-[28px] px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-mono font-medium text-gray-700">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 text-base text-gray-700">
                    {shortcut.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
