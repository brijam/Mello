import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

/** Full-screen overlay that shows an image at its natural size. Click the
 *  backdrop or press Esc to close. Rendered above modals/sheets via a portal. */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      // stopPropagation: when rendered inside a click-to-close overlay (e.g. the
      // mobile card sheet), portal events bubble through the React tree — without
      // this, closing the lightbox would also close the parent sheet.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
    >
      <img
        src={src}
        alt={alt ?? ''}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain select-none"
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute top-3 right-4 text-white/80 hover:text-white text-4xl leading-none"
      >
        &times;
      </button>
    </div>,
    document.body,
  );
}
