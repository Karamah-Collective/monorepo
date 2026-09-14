import { useEffect, useMemo, useState } from "react";
import { APP_SETTINGS_FIELDS, DEFAULT_APP_SETTINGS, validateAppSettings } from "../../../src/app-settings-schema.js";
import { MAP_PRESETS } from "../../../src/app-controls-schema.js";
import { useAdminAppSettings, useUpdateAppSettings } from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";

const GROUPS = [
  ["Appearance", "Set the public app's default visual tone for visitors who have not saved their own preferences."],
  ["Map behavior", "Choose the default map detail, marker feel, zoom limits, and optional overlays."],
  ["Search & discovery", "Tune list cards, search behavior, and the empty state visitors see when no places match."],
  ["Navigation", "Control shortcuts and the order of sections in the Menu sheet."],
  ["Categories", "Rename the public category labels without touching taxonomy code."],
  ["Startup", "Control loading, onboarding, and the fallback map position."],
  ["Submissions", "Pause or tighten community contribution workflows from one place."],
  ["Content", "Manage notices, help links, and onboarding copy."],
];

const FIELD_GROUPS = {
  Startup: ["welcomeEnabled", "tutorialEnabled", "autoCityEnabled", "defaultLat", "defaultLng", "defaultZoom", "promosEnabled", "eventsShortcutEnabled", "sponsorCarouselEnabled"],
  Content: ["noticeEnabled", "noticeText", "noticeTextFi", "noticeTextAr", "noticeLanguage", "noticeStartAt", "noticeEndAt", "noticeLinkLabel", "noticeLinkUrl", "supportUrl", "faqUrl", "onboardingTitle", "onboardingText"],
};

const MULTILINE = new Set(["noticeText", "noticeTextFi", "noticeTextAr", "onboardingText", "searchSynonyms", "submissionPauseMessage", "rejectionReasons", "reportReasons"]);
const URL_FIELDS = new Set(["noticeLinkUrl", "supportUrl", "faqUrl"]);

function fieldKeysForGroup(group) {
  if (FIELD_GROUPS[group]) return FIELD_GROUPS[group];
  return Object.entries(APP_SETTINGS_FIELDS)
    .filter(([, field]) => field.group === group)
    .map(([key]) => key);
}

function labelFor(name) {
  return APP_SETTINGS_FIELDS[name].label || name.replace(/([A-Z])/g, " $1").replace(/^./, (ch) => ch.toUpperCase());
}

function ToggleRow({ name, draft, update }) {
  const field = APP_SETTINGS_FIELDS[name];
  const hint = field.hint || "";
  return (
    <label className="pp-settings-toggle" htmlFor={`setting-${name}`}>
      <span><strong>{labelFor(name)}</strong>{hint && <small id={`hint-${name}`}>{hint}</small>}</span>
      <input id={`setting-${name}`} type="checkbox" checked={draft[name]} aria-describedby={hint ? `hint-${name}` : undefined}
        onChange={(event) => update(name, event.target.checked)} />
    </label>
  );
}

function SettingField({ name, draft, update }) {
  const field = APP_SETTINGS_FIELDS[name];
  const id = `setting-${name}`;
  const hint = field.hint || `${String(draft[name] || "").length}/${field.maxLength || ""}`.replace("/"," / ");
  const value = draft[name];
  const common = {
    id,
    value,
    "aria-describedby": `hint-${name}`,
    maxLength: field.maxLength,
    onChange: (event) => update(name, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value),
  };
  return (
    <div className="pp-field">
      <label htmlFor={id}>{labelFor(name)}</label>
      {field.options ? (
        <select {...common}>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : MULTILINE.has(name) ? (
        <textarea {...common} rows={name === "searchSynonyms" || name === "rejectionReasons" || name === "reportReasons" ? 6 : 4} />
      ) : (
        <input {...common} type={field.type === "number" ? "number" : URL_FIELDS.has(name) ? "url" : name.endsWith("At") ? "datetime-local" : "text"}
          min={field.min} max={field.max} step={field.type === "number" && Number.isInteger(field.default) ? "1" : "any"} required={field.type === "number"} />
      )}
      <span className="pp-field-hint" id={`hint-${name}`}>{hint}</span>
    </div>
  );
}

function SettingsGroup({ group, description, draft, update }) {
  const keys = fieldKeysForGroup(group).filter((key) => Object.hasOwn(APP_SETTINGS_FIELDS, key));
  if (!keys.length) return null;
  const booleans = keys.filter((key) => APP_SETTINGS_FIELDS[key].type === "boolean");
  const fields = keys.filter((key) => APP_SETTINGS_FIELDS[key].type !== "boolean");
  return (
    <section className="pp-settings-section" aria-labelledby={`settings-${group.replaceAll(" ", "-").toLowerCase()}`}>
      <div className="pp-settings-section-head">
        <h2 id={`settings-${group.replaceAll(" ", "-").toLowerCase()}`}>{group}</h2>
        {description && <p>{description}</p>}
      </div>
      {group === "Map behavior" && (
        <div className="pp-settings-presets" aria-label="Map presets">
          {Object.entries(MAP_PRESETS).map(([name, values]) => (
            <button key={name} className="pp-btn pp-btn-inline" type="button" onClick={() => {
              for (const [key, value] of Object.entries(values)) update(key, value);
            }}>{name}</button>
          ))}
        </div>
      )}
      {booleans.map((name) => <ToggleRow key={name} name={name} draft={draft} update={update} />)}
      {fields.length > 0 && <div className="pp-settings-grid">
        {fields.map((name) => <SettingField key={name} name={name} draft={draft} update={update} />)}
      </div>}
      {group === "Content" && draft.noticeText && <aside className="pp-settings-preview" aria-label="Community notice preview">
        <small>Preview{!draft.noticeEnabled ? " · hidden in the app" : ""}</small>
        <p>{draft.noticeText}</p>
        {draft.noticeLinkLabel && <span>{draft.noticeLinkLabel}</span>}
      </aside>}
    </section>
  );
}

function useUnsavedWarning(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigate = (event) => {
      const link = event.target.closest("a[href]");
      if (!link || link.target === "_blank" || link.href === window.location.href) return;
      if (!window.confirm("Leave without saving your app settings?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [dirty]);
}

function SettingsEditor({ data, reload, reloading }) {
  const [saved, setSaved] = useState(data);
  const [draft, setDraft] = useState(data.settings);
  const mutation = useUpdateAppSettings();
  const toast = useToast();
  const changedKeys = useMemo(() => Object.keys(DEFAULT_APP_SETTINGS).filter((key) => draft[key] !== saved.settings[key]), [draft, saved.settings]);
  const dirty = changedKeys.length > 0;
  const validationError = validateAppSettings(draft);
  useUnsavedWarning(dirty);
  useEffect(() => {
    if (!dirty && data.revision > saved.revision) {
      setSaved(data);
      setDraft(data.settings);
    }
  }, [data, dirty, saved.revision]);
  const update = (name, value) => { mutation.reset(); setDraft((current) => ({ ...current, [name]: value })); };
  const save = (event) => {
    event.preventDefault();
    if (validationError || !dirty) return;
    mutation.mutate({ settings: draft, revision: saved.revision }, {
      onSuccess: (result) => { setSaved(result); setDraft(result.settings); toast("App settings saved"); },
    });
  };
  return (
    <form className="pp-settings-form" onSubmit={save}>
      <fieldset className="pp-settings-fields" disabled={mutation.isPending}>
        {GROUPS.map(([group, description]) => <SettingsGroup key={group} group={group} description={description} draft={draft} update={update} />)}
      </fieldset>
      <div className="pp-settings-actions">
        <div className="pp-settings-status" role="status">
          <strong>{mutation.isPending ? "Saving..." : dirty ? `${changedKeys.length} unsaved change${changedKeys.length === 1 ? "" : "s"}` : "All changes saved"}</strong>
          <small>{saved.updatedAt ? `Last saved ${new Date(saved.updatedAt).toLocaleString()}` : "Using app defaults"}</small>
        </div>
        <button className="pp-btn" type="button" disabled={!dirty || mutation.isPending} onClick={() => { setDraft(saved.settings); mutation.reset(); }}>Discard changes</button>
        <button className="pp-btn pp-btn-primary" type="submit" disabled={!dirty || !!validationError || mutation.isPending}>Save changes</button>
        {validationError && <p className="pp-error-text" role="alert">{validationError}</p>}
        {mutation.error && <p className="pp-error-text" role="alert">{mutation.error.message}</p>}
        {dirty && data.revision > saved.revision && <p className="pp-error-text" role="alert">A colleague saved a newer version. Discard your draft and reload saved settings before editing again.</p>}
      </div>
      <div className="pp-settings-tools">
        <button className="pp-btn" type="button" disabled={mutation.isPending} onClick={() => { mutation.reset(); setDraft({ ...DEFAULT_APP_SETTINGS }); }}>Reset to defaults</button>
        <button className="pp-btn" type="button" disabled={dirty || mutation.isPending || reloading} onClick={reload}>Reload saved settings</button>
        <p>Reset prepares a draft. Save changes to publish it. Visitors receive saved settings the next time they open or reload the app.</p>
      </div>
    </form>
  );
}

/** Edit the public app's runtime controls using the authenticated admin API. */
export default function AppSettingsPage() {
  const query = useAdminAppSettings();
  return (
    <div className="pp-page">
      <h1 className="pp-page-title">App Settings</h1>
      <p className="pp-page-lead">Manage the visitor experience without a code update. Changes are recorded in the Activity Log.</p>
      {query.isLoading && <p role="status">Loading settings...</p>}
      {query.error && <div role="alert"><p className="pp-error-text">{query.error.message}</p>
        <button className="pp-btn pp-btn-inline" onClick={() => query.refetch()}>Try again</button></div>}
      {query.data && <SettingsEditor data={query.data} reload={() => query.refetch()} reloading={query.isFetching} />}
    </div>
  );
}
