import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Popovers triggered from inside a scrollable table row can't be
// position:absolute — the row's own overflow:auto clips them. This anchors
// a popover to its trigger button's screen position and renders it via a
// portal (see FloatingPopover) so it always floats above everything,
// regardless of which scroll container the trigger sits inside.
export default function useAnchoredPopover(width = 260) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const height = popoverRef.current?.offsetHeight || 180;
      const top =
        rect.bottom + height + 14 > window.innerHeight
          ? Math.max(8, rect.top - height - 6)
          : rect.bottom + 6;
      setStyle({
        position: "fixed",
        top,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      });
    }
  }, [width]);

  const openPopover = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (
        popoverRef.current?.contains(e.target) ||
        triggerRef.current?.contains(e.target)
      )
        return;
      close();
    }
    function handleScrollOrResize() {
      updatePosition();
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, close, updatePosition]);

  return { open, style, triggerRef, popoverRef, openPopover, close };
}
