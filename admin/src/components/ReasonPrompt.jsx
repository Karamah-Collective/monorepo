import { useState } from "react";

// A tiny inline popover (not a full modal) for the one field a rejection
// needs — keeps the reject flow to "click Reject, type why, confirm."
export default function ReasonPrompt({ onSubmit, onCancel }) {
  const [reason, setReason] = useState("");

  return (
    <div className="pp-reason-popover" onClick={(e) => e.stopPropagation()}>
      <textarea
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
      <div className="pp-reason-popover-actions">
        <button className="pp-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="pp-btn pp-btn-reject" onClick={() => onSubmit(reason)}>
          Confirm reject
        </button>
      </div>
    </div>
  );
}
