import { useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore.js';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp';

export default function AvatarUpload() {
  const { user, updateAvatar, removeAvatar } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  if (!user) return null;

  const initials = user.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleClick = () => {
    if (user.avatarUrl) {
      setShowMenu((v) => !v);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setShowMenu(false);
    try {
      await updateAvatar(file);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setShowMenu(false);
    setUploading(true);
    try {
      await removeAvatar();
    } catch (err) {
      console.error('Avatar removal failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleChangePhoto = () => {
    setShowMenu(false);
    fileInputRef.current?.click();
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={uploading}
        className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 flex-shrink-0"
        title="Change avatar"
      >
        {uploading ? (
          <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs font-semibold text-white">{initials}</span>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg py-1 min-w-[140px]">
            <button
              onClick={handleChangePhoto}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Change photo
            </button>
            <button
              onClick={handleRemove}
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-gray-100"
            >
              Remove photo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
