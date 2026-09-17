import { LoadingState } from "../components/QueryState.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ToggleCell from "../components/ToggleCell.jsx";
import {
  useAdminPlaces,
  useDeletePlace,
  useRefreshPlaceInfo,
  useUpdateBoycott,
  useUpdatePlaceCoordinates,
  useUpdatePlaceDisabled,
  useUpdateSponsor,
} from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";
import { SPONSOR_TIER_OPTIONS, TYPE_OPTIONS } from "../constants.js";
import { CloseIcon, Icons } from "../icons.jsx";

const columnHelper = createColumnHelper();
const EMPTY_PROMO = { code: "", description: "", startDate: "", endDate: "" };

function normalizePromos(place) {
  if (Array.isArray(place.promos) && place.promos.length) return place.promos.map((promo) => ({
    code: promo.code || "", description: promo.description || promo.text || "",
    startDate: promo.startDate || "", endDate: promo.endDate || "",
  }));
  return [{ ...EMPTY_PROMO }];
}

function PlaceManager({ place, close, mutations, toast }) {
  const dialog = useRef(null);
  const [tier, setTier] = useState(place.sponsorTier || "");
  const [promos, setPromos] = useState(() => normalizePromos(place));
  const [startDate, setStartDate] = useState(place.sponsorStartDate || "");
  const [endDate, setEndDate] = useState(place.sponsorEndDate || "");
  const [lat, setLat] = useState(String(place.lat ?? ""));
  const [lng, setLng] = useState(String(place.lng ?? ""));
  const [verified, setVerified] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const latitude = Number(lat), longitude = Number(lng);
  const coordinatesValid = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  const busy = Object.values(mutations).some((mutation) => mutation.isPending);
  const mutate = (mutation, body, success, shouldClose = false) => mutation.mutate(body, {
    onSuccess: () => { if (shouldClose) close(); toast(success); },
    onError: (error) => toast(error.message, "error"),
  });
  const updatePromo = (index, field, value) => setPromos((current) => current.map((promo, i) => i === index ? { ...promo, [field]: value } : promo));

  return <dialog ref={dialog} className="website-editor-dialog place-manager-dialog" aria-labelledby="place-manager-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className="place-manager-shell">
      <header>
        <div><span className="eyebrow">PLACE CONTROLS</span><h2 id="place-manager-title">Manage place</h2><p>{place.name}</p></div>
        <button type="button" className="icon-button" aria-label="Close place controls" onClick={close}><CloseIcon /></button>
      </header>
      <div className="place-manager-body pp-scroll">
        <section className="place-action-section">
          <div className="place-action-copy"><span className="place-action-icon"><Icons.pin size={17} /></span><div><h3>Map presence</h3><p>Control how this place appears to visitors.</p></div></div>
          <div className="place-action-toggles">
            <ToggleCell checked={!place.disabled} ariaLabel={`Show ${place.name} on the map`} disabled={busy} label={place.disabled ? "Hidden from map" : "Visible on map"} onChange={(visible) => mutate(mutations.disabled, { placeId: place.id, disabled: !visible }, visible ? "Place visible on map" : "Place hidden from map")} />
            <ToggleCell checked={place.boycott} ariaLabel={`Boycott ${place.name}`} tone="danger" disabled={busy} label={place.boycott ? "Boycotted" : "Not boycotted"} onChange={(boycott) => mutate(mutations.boycott, { placeId: place.id, boycott }, "Boycott status updated")} />
          </div>
        </section>

        <section className="place-action-section">
          <div className="place-action-copy"><span className="place-action-icon"><Icons.star size={17} /></span><div><h3>Sponsorship & promotions</h3><p>Optional commercial details shown with this place.</p></div></div>
          <div className="place-sponsor-fields">
            <div className="place-field-grid"><label className="pp-field">Sponsor tier<select value={tier} onChange={(event) => setTier(event.target.value)} disabled={busy}>{SPONSOR_TIER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="pp-field">Sponsor start<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} /></label><label className="pp-field">Sponsor end<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={busy} /></label></div>
            <div className="place-promos-head"><strong>Promos</strong><button type="button" className="pp-btn pp-btn-text" disabled={busy} onClick={() => setPromos((current) => [...current, { ...EMPTY_PROMO }])}>Add promo</button></div>
            <div className="place-promos">{promos.map((promo, index) => <div className="place-promo" key={index}><div className="place-promo-fields"><div className="place-field-grid"><label className="pp-field">Code<input value={promo.code} onChange={(event) => updatePromo(index, "code", event.target.value)} disabled={busy} /></label><label className="pp-field place-field-wide">Description<input value={promo.description} onChange={(event) => updatePromo(index, "description", event.target.value)} disabled={busy} /></label></div><div className="place-field-grid"><label className="pp-field">Start<input type="date" value={promo.startDate} onChange={(event) => updatePromo(index, "startDate", event.target.value)} disabled={busy} /></label><label className="pp-field">End<input type="date" value={promo.endDate} onChange={(event) => updatePromo(index, "endDate", event.target.value)} disabled={busy} /></label></div></div><button type="button" className="pp-icon-btn pp-sponsor-remove" disabled={busy} aria-label="Remove promo" onClick={() => setPromos((current) => current.length > 1 ? current.filter((_, i) => i !== index) : [{ ...EMPTY_PROMO }])}><CloseIcon size={15} /></button></div>)}</div>
            <button type="button" className="pp-btn pp-btn-refresh" disabled={busy} onClick={() => mutate(mutations.sponsor, { placeId: place.id, sponsorTier: tier, promos, sponsorStartDate: startDate, sponsorEndDate: endDate }, "Sponsorship and promotions saved")}>{mutations.sponsor.isPending ? "Saving…" : "Save sponsorship"}</button>
          </div>
        </section>

        <section className="place-action-section place-refresh-section">
          <div className="place-action-copy"><span className="place-action-icon"><Icons.refresh size={17} /></span><div><h3>Refresh from Google</h3><p>Updates place details, reviews, and its map coordinates from the linked Google listing.</p></div></div>
          <button type="button" className="pp-btn pp-btn-refresh" disabled={busy} onClick={() => mutate(mutations.refresh, { placeId: place.id }, "Place details and coordinates refreshed")}>{mutations.refresh.isPending ? "Refreshing…" : "Refresh place"}</button>
        </section>

        <details className="place-coordinate-details">
          <summary><span><Icons.pin size={16} />Advanced coordinate correction</span><span>Manual override</span></summary>
          <div className="place-coordinate-content">
            <p>Only use this for a verified correction. A later Google refresh will replace these values.</p>
            <div className="place-field-grid"><label className="pp-field">Latitude<input type="number" step="any" min="-90" max="90" value={lat} onChange={(event) => setLat(event.target.value)} disabled={busy} /></label><label className="pp-field">Longitude<input type="number" step="any" min="-180" max="180" value={lng} onChange={(event) => setLng(event.target.value)} disabled={busy} /></label></div>
            <label className="coordinate-confirm"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} disabled={busy} /><span>I checked both values and understand this moves the map pin.</span></label>
            <button type="button" className="pp-btn pp-btn-refresh" disabled={busy || !coordinatesValid || !verified} onClick={() => mutate(mutations.coordinates, { placeId: place.id, lat: latitude, lng: longitude }, "Map coordinates updated")}>{mutations.coordinates.isPending ? "Saving…" : "Save coordinates"}</button>
          </div>
        </details>

        <section className="place-danger-zone">
          <div><h3>Remove this place</h3><p>This also removes its reviews, saved references, events, app links, and social videos.</p></div>
          <button type="button" className="pp-btn pp-btn-delete" disabled={busy} onClick={() => { if (removeArmed) mutate(mutations.remove, { placeId: place.id }, "Place removed from database", true); else setRemoveArmed(true); }}>{mutations.remove.isPending ? "Removing…" : removeArmed ? "Confirm removal" : "Remove place"}</button>
        </section>
      </div>
      <footer><p>Changes are saved immediately to the shared map database.</p><button type="button" className="pp-btn" onClick={close}>Done</button></footer>
    </div>
  </dialog>;
}

export default function PlacesPage() {
  const { data, isLoading, error } = useAdminPlaces();
  const updateBoycott = useUpdateBoycott();
  const updateDisabled = useUpdatePlaceDisabled();
  const updateCoordinates = useUpdatePlaceCoordinates();
  const updateSponsor = useUpdateSponsor();
  const refreshPlace = useRefreshPlaceInfo();
  const deletePlace = useDeletePlace();
  const toast = useToast();
  const [managedPlace, setManagedPlace] = useState(null);
  const columns = useMemo(() => [
    columnHelper.accessor("name", { header: "Name" }),
    columnHelper.accessor("type", { header: "Type", meta: { filterVariant: "select", options: TYPE_OPTIONS }, filterFn: "equals" }),
    columnHelper.accessor((row) => `${row.address || ""} ${row.city || ""}`, { id: "location", header: "Location", cell: (info) => <div className="place-location-cell"><strong>{info.row.original.address || "Address unavailable"}</strong>{info.row.original.city && <small>{info.row.original.city}</small>}</div> }),
    columnHelper.display({ id: "actions", header: "Actions", cell: (info) => <button className="pp-btn pp-btn-refresh place-manage-button" onClick={() => setManagedPlace(info.row.original)}><Icons.settings size={14} />Manage</button> }),
  ], []);
  const mutations = { boycott: updateBoycott, disabled: updateDisabled, coordinates: updateCoordinates, sponsor: updateSponsor, refresh: refreshPlace, remove: deletePlace };
  return <div className="pp-page">
    <h1 className="pp-page-title">Places</h1>
    <p className="pp-page-lead">Review each place’s public map presence, enrichment, sponsorship, and location data from one focused control panel.</p>
    {isLoading && <LoadingState />}
    {error && <p className="pp-error-text">{error.message}</p>}
    {data && <DataTable data={data} columns={columns} getRowId={(row) => row.id} />}
    {managedPlace && <PlaceManager place={managedPlace} close={() => setManagedPlace(null)} mutations={mutations} toast={toast} />}
  </div>;
}
