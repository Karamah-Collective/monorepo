import ReasonPrompt from "./ReasonPrompt.jsx";
import ManageActions from "./ManageActions.jsx";
import useAnchoredPopover from "./useAnchoredPopover.js";
import { useAdminAppSettings } from "../api/queries.js";

// Keep row-level decisions quiet until the administrator asks for them.
// Rejections retain their anchored reason prompt and approval stays immediate.
export default function ActionCell({ onApprove, onReject, onDelete, approving, rejecting, deleting, deleteLabel = "Delete" }) {
  const { open, style, triggerRef, popoverRef, openPopover, close } = useAnchoredPopover();
  const settingsQuery = useAdminAppSettings();
  const reasons = (settingsQuery.data?.settings?.rejectionReasons || "")
    .split("\n")
    .map((reason) => reason.trim())
    .filter(Boolean)
    .slice(0, 8);
  const busy = approving || rejecting || deleting;

  return (
    <div className="pp-action-cell">
      <ManageActions disabled={busy}>
        {({ close: closeActions }) => <>
          {onApprove && <button role="menuitem" aria-label="Approve" className="pp-manage-action pp-manage-action-positive" onClick={() => { closeActions(); onApprove(); }} disabled={busy}>
            <span>{approving ? "Approving…" : "Approve"}</span><small>Accept this submission</small>
          </button>}
          {onReject && <button role="menuitem" aria-label="Reject" ref={triggerRef} className="pp-manage-action pp-manage-action-danger" onClick={() => { openPopover(); closeActions(); }} disabled={busy}>
            <span>{rejecting ? "Rejecting…" : "Reject"}</span><small>Return it with a reason</small>
          </button>}
          {onDelete && <button role="menuitem" aria-label={deleteLabel} className="pp-manage-action pp-manage-action-danger" onClick={() => { closeActions(); onDelete(); }} disabled={busy}>
            <span>{deleting ? "Removing…" : deleteLabel}</span><small>Remove this record</small>
          </button>}
        </>}
      </ManageActions>
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
