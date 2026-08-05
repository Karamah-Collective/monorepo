import { useState } from "react";
import { SPONSOR_TIER_OPTIONS, labelFor } from "../constants.js";

// Places' sponsor fields (tier, promo, dates) are edited together via one
// small popover rather than five separate inline cells — a single "Save"
// commits all of them in one update-sponsor call.
export default function SponsorEditor({ place, onSave, saving }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState(place.sponsorTier || "");
  const [promo, setPromo] = useState(!!place.sponsorPromo);
  const [promoText, setPromoText] = useState(place.sponsorPromoText || "");
  const [startDate, setStartDate] = useState(place.sponsorStartDate || "");
  const [endDate, setEndDate] = useState(place.sponsorEndDate || "");

  function handleSave() {
    onSave({
      placeId: place.id,
      sponsorTier: tier,
      sponsorPromo: promo,
      sponsorPromoText: promoText,
      sponsorStartDate: startDate,
      sponsorEndDate: endDate,
    });
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <span className="pp-badge pp-badge-pending">{labelFor(SPONSOR_TIER_OPTIONS, place.sponsorTier || "")}</span>{" "}
      <button className="pp-btn" onClick={() => setOpen(true)} disabled={saving}>
        Edit
      </button>
      {open && (
        <div className="pp-reason-popover" style={{ width: 260 }} onClick={(e) => e.stopPropagation()}>
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
            <button className="pp-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="pp-btn pp-btn-approve" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
