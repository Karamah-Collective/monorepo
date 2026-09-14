import { useState } from "react";
import { createPortal } from "react-dom";

// Rendered via a portal at a fixed screen position (see useAnchoredPopover)
// so it floats above the table regardless of the row's own scroll clipping.
export default function ReasonPrompt({ style, popoverRef, onSubmit, onCancel, reasons = [] }) {
  const [reason, setReason] = useState("");

  return createPortal(
    <div className="pp-reason-popover" style={style} ref={popoverRef} onClick={(e) => e.stopPropagation()}>
      <textarea
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
      {reasons.length > 0 && (
        <div className="pp-reason-presets">
          {reasons.map((item) => (
            <button key={item} type="button" className="pp-btn pp-btn-inline" onClick={() => setReason(item)}>
              {item}
            </button>
          ))}
        </div>
      )}
      <div className="pp-reason-popover-actions">
        <button className="pp-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="pp-btn pp-btn-reject" onClick={() => onSubmit(reason)}>
          Confirm reject
        </button>
      </div>
    </div>,
    document.body
  );
}
