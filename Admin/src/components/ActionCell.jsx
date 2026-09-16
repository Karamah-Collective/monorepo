import ReasonPrompt from "./ReasonPrompt.jsx";
import useAnchoredPopover from "./useAnchoredPopover.js";
import { useAdminAppSettings } from "../api/queries.js";

// Approve fires immediately (no confirmation — approvals are the common,
// low-risk path). Reject opens a one-field floating reason prompt first,
// anchored to the button so it never gets clipped by the table's own
// scroll region (see useAnchoredPopover).
export default function ActionCell({ onApprove, onReject, onDelete, approving, rejecting, deleting, deleteLabel = "Delete" }) {
  const { open, style, triggerRef, popoverRef, openPopover, close } = useAnchoredPopover();
  const settingsQuery = useAdminAppSettings();
  const reasons = (settingsQuery.data?.settings?.rejectionReasons || "")
    .split("\n")
    .map((reason) => reason.trim())
    .filter(Boolean)
    .slice(0, 8);

  return (
    <div className="pp-action-cell">
      {onApprove && <button className="pp-btn pp-btn-approve" onClick={onApprove} disabled={approving || rejecting || deleting}>
        {approving ? "…" : "Approve"}
      </button>}
      {onReject && <button ref={triggerRef} className="pp-btn pp-btn-reject" onClick={openPopover} disabled={approving || rejecting || deleting}>
        {rejecting ? "…" : "Reject"}
      </button>}
      {onDelete && <button className="pp-btn pp-btn-delete" onClick={onDelete} disabled={approving || rejecting || deleting}>
        {deleting ? "..." : deleteLabel}
      </button>}
      {onReject && open && (
        <ReasonPrompt
          style={style}
          popoverRef={popoverRef}
          reasons={reasons}
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
