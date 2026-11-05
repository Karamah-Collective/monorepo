import { useState } from "react";
import { createPortal } from "react-dom";
import { SPONSOR_TIER_OPTIONS, labelFor } from "../constants.js";
import useAnchoredPopover from "./useAnchoredPopover.js";
import { CloseIcon, Icons } from "../icons.jsx";

const EMPTY_PROMO = { code: "", description: "", startDate: "", endDate: "" };

function normalizePromos(place) {
  if (Array.isArray(place.promos) && place.promos.length) {
    return place.promos.map((promo) => ({
      code: promo.code || "",
      description: promo.description || promo.text || "",
      startDate: promo.startDate || "",
      endDate: promo.endDate || "",
    }));
  }
  const legacyCode = (place.sponsorPromo || "").toString().trim();
  const code = ["true", "false"].includes(legacyCode.toLowerCase()) ? "" : legacyCode;
  const description = place.sponsorPromoText || "";
  return code || description
    ? [{ code, description, startDate: place.sponsorStartDate || "", endDate: place.sponsorEndDate || "" }]
    : [{ ...EMPTY_PROMO }];
}

export default function SponsorEditor({ place, onSave, saving }) {
  const { open, style, triggerRef, popoverRef, openPopover, close } = useAnchoredPopover(420);
  const [tier, setTier] = useState(place.sponsorTier || "");
  const [promos, setPromos] = useState(() => normalizePromos(place));
  const [startDate, setStartDate] = useState(place.sponsorStartDate || "");
  const [endDate, setEndDate] = useState(place.sponsorEndDate || "");

  function handleOpen() {
    setTier(place.sponsorTier || "");
    setPromos(normalizePromos(place));
    setStartDate(place.sponsorStartDate || "");
    setEndDate(place.sponsorEndDate || "");
    openPopover();
  }

  function updatePromo(index, field, value) {
    setPromos((current) => current.map((promo, i) => (i === index ? { ...promo, [field]: value } : promo)));
  }

  function addPromo() {
    setPromos((current) => [...current, { ...EMPTY_PROMO }]);
  }

  function removePromo(index) {
    setPromos((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length ? next : [{ ...EMPTY_PROMO }];
    });
  }

  function handleSave() {
    onSave({
      placeId: place.id,
      sponsorTier: tier,
      promos,
      sponsorStartDate: startDate,
      sponsorEndDate: endDate,
    });
    close();
  }

  const promoCount = Array.isArray(place.promos) ? place.promos.length : 0;

  return (
    <div className="pp-sponsor-cell">
      <span className="pp-badge pp-badge-pending">{labelFor(SPONSOR_TIER_OPTIONS, place.sponsorTier || "")}</span>
      {promoCount > 0 && <span className="pp-sponsor-promo-count">{promoCount}</span>}
      <button ref={triggerRef} className="pp-icon-btn" onClick={handleOpen} disabled={saving} aria-label="Edit sponsor details" title="Edit sponsor details">
        <Icons.pencil />
      </button>
      {open &&
        createPortal(
          <div className="pp-reason-popover pp-sponsor-popover" style={{ ...style, width: 420 }} ref={popoverRef} onClick={(e) => e.stopPropagation()}>
            <div className="pp-field">
              <label>Sponsor tier</label>
              <select className="pp-select-cell" value={tier} onChange={(e) => setTier(e.target.value)}>
                {SPONSOR_TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="pp-sponsor-date-grid">
              <div className="pp-field">
                <label>Sponsor start</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="pp-field">
                <label>Sponsor end</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="pp-sponsor-promos-head">
              <span>Promos</span>
              <button type="button" className="pp-btn pp-btn-text" onClick={addPromo}>
                Add promo
              </button>
            </div>
            <div className="pp-sponsor-promos">
              {promos.map((promo, index) => (
                <div className="pp-sponsor-promo-row" key={index}>
                  <div className="pp-sponsor-promo-fields">
                    <div className="pp-field">
                      <label>Code</label>
                      <input type="text" value={promo.code} onChange={(e) => updatePromo(index, "code", e.target.value)} />
                    </div>
                    <div className="pp-field">
                      <label>Description</label>
                      <textarea value={promo.description} onChange={(e) => updatePromo(index, "description", e.target.value)} />
                    </div>
                    <div className="pp-sponsor-date-grid">
                      <div className="pp-field">
                        <label>Promo start</label>
                        <input type="date" value={promo.startDate} onChange={(e) => updatePromo(index, "startDate", e.target.value)} />
                      </div>
                      <div className="pp-field">
                        <label>Promo end</label>
                        <input type="date" value={promo.endDate} onChange={(e) => updatePromo(index, "endDate", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <button type="button" className="pp-icon-btn pp-sponsor-remove" onClick={() => removePromo(index)} aria-label="Remove promo" title="Remove promo">
                    <CloseIcon size={15} />
                  </button>
                </div>
              ))}
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
