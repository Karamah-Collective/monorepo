import { useCallback, useEffect, useRef, useState } from "react";

// Popovers triggered from inside a scrollable table row can't be
// position:absolute — the row's own overflow:auto clips them. This anchors
// a popover to its trigger button's screen position and renders it via a
// portal (see FloatingPopover) so it always floats above everything,
// regardless of which scroll container the trigger sits inside.
export default function useAnchoredPopover() {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const openPopover = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setStyle({ position: "fixed", top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 260) });
    }
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (popoverRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      close();
    }
    function handleScrollOrResize() {
      close();
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, close]);

  return { open, style, triggerRef, popoverRef, openPopover, close };
}
