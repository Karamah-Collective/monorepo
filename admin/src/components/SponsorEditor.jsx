import { useState } from "react";
import { createPortal } from "react-dom";
import { SPONSOR_TIER_OPTIONS, labelFor } from "../constants.js";
import useAnchoredPopover from "./useAnchoredPopover.js";
import { Icons } from "../icons.jsx";

// Places' sponsor fields (tier, promo, dates) are edited together via one
// small floating popover rather than five separate inline cells — a single
// "Save" commits all of them in one update-sponsor call. Anchored/portaled
// (see useAnchoredPopover) so it isn't clipped by the table's scroll region.
export default function SponsorEditor({ place, onSave, saving }) {
  const { open, style, triggerRef, popoverRef, openPopover, close } = useAnchoredPopover();
  const [tier, setTier] = useState(place.sponsorTier || "");
  const [promo, setPromo] = useState(!!place.sponsorPromo);
  const [promoText, setPromoText] = useState(place.sponsorPromoText || "");
  const [startDate, setStartDate] = useState(place.sponsorStartDate || "");
  const [endDate, setEndDate] = useState(place.sponsorEndDate || "");

  function handleOpen() {
    // Reset fields to the place's current values every time the popover
    // opens, so a stale earlier edit or a background refetch never shows
    // outdated data in the form.
    setTier(place.sponsorTier || "");
    setPromo(!!place.sponsorPromo);
    setPromoText(place.sponsorPromoText || "");
    setStartDate(place.sponsorStartDate || "");
    setEndDate(place.sponsorEndDate || "");
    openPopover();
  }

  function handleSave() {
    onSave({
      placeId: place.id,
      sponsorTier: tier,
      sponsorPromo: promo,
      sponsorPromoText: promoText,
      sponsorStartDate: startDate,
      sponsorEndDate: endDate,
    });
    close();
  }

  return (
    <div className="pp-sponsor-cell">
      <span className="pp-badge pp-badge-pending">{labelFor(SPONSOR_TIER_OPTIONS, place.sponsorTier || "")}</span>
      <button ref={triggerRef} className="pp-icon-btn" onClick={handleOpen} disabled={saving} aria-label="Edit sponsor details" title="Edit sponsor details">
        <Icons.pencil />
      </button>
      {open &&
        createPortal(
          <div className="pp-reason-popover" style={{ ...style, width: 260 }} ref={popoverRef} onClick={(e) => e.stopPropagation()}>
            <div className="pp-field">
              <label>Tier</label>
              <select className="pp-select-cell" value={tier} onChange={(e) => setTier(e.target.value)}>
                {SPONSOR_TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="pp-field">
              <label>
                <input type="checkbox" checked={promo} onChange={(e) => setPromo(e.target.checked)} /> Promo active
              </label>
            </div>
            <div className="pp-field">
              <label>Promo text</label>
              <input type="text" value={promoText} onChange={(e) => setPromoText(e.target.value)} />
            </div>
            <div className="pp-field">
              <label>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="pp-field">
              <label>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="pp-reason-popover-actions">
              <button className="pp-btn" onClick={close}>
                Cancel
              </button>
              <button className="pp-btn pp-btn-approve" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
