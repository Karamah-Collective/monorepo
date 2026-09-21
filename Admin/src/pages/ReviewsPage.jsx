import { useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";

import { apiGetBlob } from "../api/client.js";
import {
  useAdminReviews,
  useBanReviewer,
  useSetReviewImageStatus,
  useSetReviewStatus,
  useUnbanReviewer,
} from "../api/queries.js";
import DataTable from "../components/DataTable.jsx";
import { LoadingState } from "../components/QueryState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useToast } from "../components/Toast.jsx";
import { CloseIcon, Icons } from "../icons.jsx";

const columnHelper = createColumnHelper();
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "yes", label: "Approved" },
  { value: "no", label: "Hidden" },
];
const REVIEW_STATUS_LABELS = { yes: "Published", no: "Hidden", pending: "Pending", "": "Pending" };
const IMAGE_STATUS_LABELS = { yes: "Visible", no: "Hidden", pending: "Pending", "": "Pending" };

function ReviewImagePreview({ image }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSrc("");
    setFailed(false);
    apiGetBlob("admin-review-image", { id: image.id }).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.id]);

  if (failed) return <div className="review-manager-image-fallback">Preview unavailable</div>;
  if (!src) return <div className="review-manager-image-fallback is-loading">Loading image</div>;
  return <img src={src} alt="Review upload awaiting moderation" />;
}

function ReviewManager({ review, close, mutations, toast }) {
  const dialog = useRef(null);
  const images = Array.isArray(review.images) ? review.images : [];
  const [reason, setReason] = useState(review.moderationReason || review.banReason || "");
  const [banArmed, setBanArmed] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const busy = Object.values(mutations).some((mutation) => mutation.isPending);
  const run = (mutation, body, success) => mutation.mutate(body, {
    onSuccess: () => { setBanArmed(false); toast(success); },
    onError: (error) => toast(error.message, "error"),
  });

  return <dialog ref={dialog} className="website-editor-dialog review-manager-dialog" aria-labelledby="review-manager-title" onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <div className="review-manager-shell">
      <header>
        <div><span className="eyebrow">REVIEW CONTROLS</span><h2 id="review-manager-title">Manage review</h2><p>{review.placeName || review.placeId}</p></div>
        <button type="button" className="icon-button" aria-label="Close review controls" disabled={busy} onClick={close}><CloseIcon /></button>
      </header>
      <div className="review-manager-body pp-scroll">
        <section className="review-manager-section review-manager-summary">
          <div className="review-manager-summary-head"><span className="review-manager-rating">{review.rating}/5</span><StatusBadge status={review.status} labels={REVIEW_STATUS_LABELS} />{review.banned && <span className="pp-badge pp-badge-no">Reviewer banned</span>}</div>
          <p>{review.text || "No written review."}</p>
          <dl><div><dt>Submitted</dt><dd>{review.timestamp || "Unknown"}</dd></div><div><dt>Reviewer</dt><dd>{review.emailHash}</dd></div><div><dt>Place ID</dt><dd>{review.placeId}</dd></div></dl>
        </section>

        <section className="review-manager-section">
          <div className="review-manager-section-head"><div><h3>Publication</h3><p>Show, hold, or hide this review without deleting its history.</p></div><div className="review-manager-actions">{review.status !== "yes" && <button type="button" className="pp-btn pp-btn-approve" disabled={busy} onClick={() => run(mutations.status, { rowIndex: review.rowIndex, status: "yes" }, "Review published")}>Publish</button>}{review.status !== "pending" && <button type="button" className="pp-btn" disabled={busy} onClick={() => run(mutations.status, { rowIndex: review.rowIndex, status: "pending", reason }, "Review moved to pending")}>Move to pending</button>}{review.status !== "no" && <button type="button" className="pp-btn pp-btn-reject" disabled={busy} onClick={() => run(mutations.status, { rowIndex: review.rowIndex, status: "no", reason }, "Review hidden")}>Hide review</button>}</div></div>
          <label className="pp-field review-manager-note">Moderation note<textarea maxLength={300} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional internal reason" disabled={busy} /></label>
        </section>

        <section className="review-manager-section">
          <div className="review-manager-section-head"><div><h3>Images</h3><p>Moderate each upload independently from the written review.</p></div><span className="review-manager-count">{images.length}</span></div>
          {images.length ? <div className="review-manager-images">{images.map((image) => <article className="review-manager-image" key={image.id}><ReviewImagePreview image={image} /><footer><StatusBadge status={image.status} labels={IMAGE_STATUS_LABELS} /><button type="button" className={`pp-btn ${image.status === "yes" ? "pp-btn-reject" : "pp-btn-approve"}`} disabled={busy} onClick={() => run(mutations.image, { imageId: image.id, status: image.status === "yes" ? "no" : "yes", reason }, image.status === "yes" ? "Image hidden" : "Image restored")}>{image.status === "yes" ? "Hide" : "Restore"}</button></footer></article>)}</div> : <p className="review-manager-empty">No images attached to this review.</p>}
        </section>

        <section className="review-manager-section review-manager-account">
          <div><h3>Reviewer access</h3><p>{review.banned ? "This reviewer cannot submit or upload reviews. Hidden reviews stay hidden after access is restored." : "Ban this reviewer and hide all reviews associated with the same protected identity hash."}</p></div>
          {review.banned ? <button type="button" className="pp-btn pp-btn-approve" disabled={busy} onClick={() => run(mutations.unban, { rowIndex: review.rowIndex }, "Reviewer access restored")}>Unban reviewer</button> : <button type="button" className="pp-btn pp-btn-delete" disabled={busy} onClick={() => banArmed ? run(mutations.ban, { rowIndex: review.rowIndex, reason }, "Reviewer banned and reviews hidden") : setBanArmed(true)}>{banArmed ? "Confirm ban and hide reviews" : "Ban reviewer"}</button>}
        </section>
      </div>
      <footer><p>Moderation changes are applied immediately and recorded in the admin log.</p><button type="button" className="pp-btn" disabled={busy} onClick={close}>Done</button></footer>
    </div>
  </dialog>;
}

export default function ReviewsPage() {
  const { data, isLoading, error } = useAdminReviews();
  const status = useSetReviewStatus();
  const image = useSetReviewImageStatus();
  const ban = useBanReviewer();
  const unban = useUnbanReviewer();
  const showToast = useToast();
  const [managedReviewId, setManagedReviewId] = useState(null);
  const managedReview = data?.find((review) => review.rowIndex === managedReviewId) || null;
  const columns = useMemo(() => [
    columnHelper.accessor("timestamp", { header: "Submitted" }),
    columnHelper.accessor((row) => row.placeName || row.placeId, { id: "place", header: "Place" }),
    columnHelper.accessor("rating", { header: "Rating" }),
    columnHelper.accessor("text", { header: "Text" }),
    columnHelper.accessor("emailHash", { header: "Reviewer" }),
    columnHelper.accessor("status", { header: "Status", meta: { filterVariant: "select", options: STATUS_OPTIONS }, filterFn: (row, id, value) => (row.getValue(id) || "pending") === value, cell: (info) => <StatusBadge status={info.getValue()} labels={REVIEW_STATUS_LABELS} /> }),
    columnHelper.display({ id: "actions", header: "Actions", cell: (info) => <button type="button" className="pp-btn pp-btn-refresh" onClick={() => setManagedReviewId(info.row.original.rowIndex)}><Icons.settings size={14} />Manage</button> }),
  ], []);
  const mutations = { status, image, ban, unban };

  return <div className="pp-page">
    <h1 className="pp-page-title">Reviews</h1>
    <p className="pp-page-lead">Moderate review visibility, individual uploads, and reviewer access from one focused control panel.</p>
    {isLoading && <LoadingState />}
    {error && <p className="pp-error-text">{error.message}</p>}
    {data && <DataTable data={data} columns={columns} getRowId={(row) => row.rowIndex} emptyMessage="No reviews." />}
    {managedReview && <ReviewManager review={managedReview} close={() => setManagedReviewId(null)} mutations={mutations} toast={showToast} />}
  </div>;
}
