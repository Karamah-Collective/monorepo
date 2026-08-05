import { useState } from "react";
import ReasonPrompt from "./ReasonPrompt.jsx";

// Approve fires immediately (no confirmation — approvals are the common,
// low-risk path). Reject opens a one-field inline reason prompt first.
export default function ActionCell({ onApprove, onReject, approving, rejecting }) {
  const [showReason, setShowReason] = useState(false);

  return (
    <div className="pp-action-cell" style={{ position: "relative" }}>
      <button className="pp-btn pp-btn-approve" onClick={onApprove} disabled={approving || rejecting}>
        {approving ? "…" : "Approve"}
      </button>
      <button className="pp-btn pp-btn-reject" onClick={() => setShowReason(true)} disabled={approving || rejecting}>
        {rejecting ? "…" : "Reject"}
      </button>
      {showReason && (
        <ReasonPrompt
          onCancel={() => setShowReason(false)}
          onSubmit={(reason) => {
            setShowReason(false);
            onReject(reason);
          }}
        />
      )}
    </div>
  );
}
