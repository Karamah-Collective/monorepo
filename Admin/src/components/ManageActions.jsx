import { createPortal } from "react-dom";
import { Icons } from "../icons.jsx";
import useAnchoredPopover from "./useAnchoredPopover.js";

export default function ManageActions({
  children,
  label = "Manage",
  disabled = false,
  className = "",
  icon = <Icons.settings size={14} />,
  iconOnly = false,
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
        aria-label={iconOnly ? label : undefined}
        disabled={disabled}
        onClick={open ? close : openPopover}
      >
        {icon}
        {!iconOnly && label}
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="pp-manage-popover"
            style={style || undefined}
            role="menu"
            aria-label={`${label} actions`}
            onClick={(event) => {
              const item = event.target.closest('[role="menuitem"]');
              if (item && !item.disabled && item.getAttribute("aria-disabled") !== "true") close();
            }}
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>,
          document.body,
        )}
    </>
  );
}
