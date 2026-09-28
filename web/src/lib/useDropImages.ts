import { useRef, useState, type DragEvent } from 'react';

/**
 * Drag-and-drop photos from the desktop / Finder / another tab onto an area —
 * the companion of `usePasteImage`. Spread `dropProps` on the drop target and
 * use `dragging` to highlight it while a file hovers.
 *
 * Only drags that carry files react, so dragging text or a link across the
 * page doesn't light the area up. Enter/leave fire for every child element,
 * so a depth counter (not a boolean) tracks whether we're still inside.
 *
 * @param enabled  false ignores drops (read-only, at the photo limit…).
 * @param onImages called with the dropped image files; non-images are skipped.
 */
export function useDropImages(enabled: boolean, onImages: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const dropProps = {
    onDragEnter: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      // Required, or the browser opens the file instead of dropping it here.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const images = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (images.length) onImages(images);
    },
  };

  return { dragging: enabled && dragging, dropProps };
}
