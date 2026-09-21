import { createPortal } from "react-dom";
import { Icons } from "../icons.jsx";
import useAnchoredPopover from "./useAnchoredPopover.js";

export default function ManageActions({
  children,
  label = "Manage",
  disabled = false,
  className = "",
}) {
  const { open, style, triggerRef, popoverRef, openPopover, close } =
    useAnchoredPopover(192);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`pp-btn pp-manage-trigger ${className}`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={open ? close : openPopover}
      >
        <Icons.settings size={14} />
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="pp-manage-popover"
            style={style || undefined}
            role="menu"
            aria-label={`${label} actions`}
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>,
          document.body,
        )}
    </>
  );
}
