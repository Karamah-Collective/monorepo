import ReasonPrompt from "./ReasonPrompt.jsx";
import useAnchoredPopover from "./useAnchoredPopover.js";

// Approve fires immediately (no confirmation — approvals are the common,
// low-risk path). Reject opens a one-field floating reason prompt first,
// anchored to the button so it never gets clipped by the table's own
// scroll region (see useAnchoredPopover).
export default function ActionCell({ onApprove, onReject, approving, rejecting }) {
  const { open, style, triggerRef, popoverRef, openPopover, close } = useAnchoredPopover();

  return (
    <div className="pp-action-cell">
      <button className="pp-btn pp-btn-approve" onClick={onApprove} disabled={approving || rejecting}>
        {approving ? "…" : "Approve"}
      </button>
      <button ref={triggerRef} className="pp-btn pp-btn-reject" onClick={openPopover} disabled={approving || rejecting}>
        {rejecting ? "…" : "Reject"}
      </button>
      {open && (
        <ReasonPrompt
          style={style}
          popoverRef={popoverRef}
          onCancel={close}
          onSubmit={(reason) => {
            close();
            onReject(reason);
          }}
        />
      )}
    </div>
  );
}
