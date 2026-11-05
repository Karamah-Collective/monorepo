import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ManageActions from "../components/ManageActions.jsx";
import { useToast } from "../components/Toast.jsx";
import { Icons } from "../icons.jsx";
import {
  useDeleteWeeklyReportSubscriber,
  useSaveWeeklyReportSubscriber,
  useSaveWeeklyReportSettings,
  useUnsubscribeWeeklyReportSubscriber,
  useWeeklyReportSubscribers,
} from "../api/queries.js";

const columnHelper = createColumnHelper();
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const defaultSettings = {
  enabled: true,
  reportMode: "enabled",
  frequency: "weekly",
  dayOfWeek: 6,
  dayOfMonth: 1,
  sendTime: "09:00",
  timezone: "Europe/Helsinki",
  subjectPrefix: "Manarah weekly report",
  visualDensity: "standard",
  accentColor: "#08705b",
  includeAnalytics: true,
  includeCommunity: true,
  includeQueues: true,
  includeCountries: true,
  includeContributions: true,
};

function fmtDate(value) {
  if (!value) return "Not yet";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function WeeklyReportPage() {
  const query = useWeeklyReportSubscribers();
  const save = useSaveWeeklyReportSubscriber();
  const saveSettings = useSaveWeeklyReportSettings();
  const unsubscribe = useUnsubscribeWeeklyReportSubscriber();
  const remove = useDeleteWeeklyReportSubscriber();
  const toast = useToast();
  const [draft, setDraft] = useState({ email: "", displayName: "" });
  const [settingsDraft, setSettingsDraft] = useState(null);
  const rows = query.data?.subscribers || [];
  const settings = settingsDraft || query.data?.settings || defaultSettings;
  const subscribed = rows.filter((row) => row.status === "subscribed").length;
  const unsubscribed = rows.filter((row) => row.status === "unsubscribed").length;
  const busy = save.isPending || unsubscribe.isPending || remove.isPending;

  const columns = useMemo(() => [
    columnHelper.accessor("displayName", {
      header: "Name",
      cell: ({ row }) => <div className="report-recipient-name"><strong>{row.original.displayName || row.original.email.split("@")[0]}</strong><small>{row.original.email}</small></div>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      meta: { filterVariant: "select", options: [{ value: "subscribed", label: "Subscribed" }, { value: "unsubscribed", label: "Unsubscribed" }] },
      cell: ({ getValue }) => <span className={`pp-status-badge report-status-${getValue()}`}>{getValue()}</span>,
    }),
    columnHelper.accessor("updatedAt", { header: "Updated", cell: ({ getValue }) => fmtDate(getValue()) }),
    columnHelper.display({
      id: "actions",
      header: "Manage",
      cell: ({ row: { original } }) => <ManageActions disabled={busy}>{({ close }) => <>
        {original.status !== "subscribed" && <button role="menuitem" className="pp-manage-action" onClick={() => { close(); save.mutate({ subscriber: { email: original.email, displayName: original.displayName } }, { onSuccess: () => toast("Recipient resubscribed"), onError: error => toast(error.message, "error") }); }}><span>Resubscribe</span><small>Include this person in future reports</small></button>}
        {original.status === "subscribed" && <button role="menuitem" className="pp-manage-action" onClick={() => { close(); unsubscribe.mutate({ id: original.id, email: original.email }, { onSuccess: () => toast("Recipient unsubscribed"), onError: error => toast(error.message, "error") }); }}><span>Unsubscribe</span><small>Keep the record, stop weekly email</small></button>}
        <button role="menuitem" className="pp-manage-action pp-manage-action-danger" onClick={() => { close(); if (window.confirm(`Remove ${original.email} from the weekly report list?`)) remove.mutate({ id: original.id, email: original.email }, { onSuccess: () => toast("Recipient removed"), onError: error => toast(error.message, "error") }); }}><span>Remove</span><small>Delete this recipient record</small></button>
      </>}</ManageActions>,
    }),
  ], [busy, remove, save, toast, unsubscribe]);

  function submit(event) {
    event.preventDefault();
    save.mutate({ subscriber: draft }, {
      onSuccess: () => {
        setDraft({ email: "", displayName: "" });
        toast("Weekly report recipient saved");
      },
      onError: error => toast(error.message, "error"),
    });
  }

  function updateSettings(key, value) {
    setSettingsDraft(current => ({ ...(current || query.data?.settings || defaultSettings), [key]: value }));
  }

  function saveReportSettings(event) {
    event.preventDefault();
    saveSettings.mutate({ settings }, {
      onSuccess: data => {
        setSettingsDraft(data.settings || null);
        toast("Weekly report settings saved");
      },
      onError: error => toast(error.message, "error"),
    });
  }

  return <div className="pp-page weekly-report-page">
    <div className="weekly-report-heading">
      <div>
        <h1 className="pp-page-title">Weekly report</h1>
      </div>
      <Icons.mail size={30} />
    </div>

    <div className="weekly-report-summary">
      <span><strong>{subscribed}</strong> subscribed</span>
      <span><strong>{unsubscribed}</strong> unsubscribed</span>
      <span>GitHub Actions sends the report through the Maps API.</span>
      <button className="pp-btn" disabled={query.isFetching} onClick={() => query.refetch()}>Refresh</button>
    </div>

    <section className="pp-panel weekly-report-settings">
      <div className="weekly-report-panel-heading">
        <div>
          <h2 className="pp-panel-title">Report settings</h2>
          <p>GitHub Actions checks hourly. Test mode sends only when you manually run the workflow.</p>
        </div>
        <label className={`weekly-report-mode weekly-report-mode-${settings.reportMode || (settings.enabled ? "enabled" : "disabled")}`}>
          <span>Mode</span>
          <select value={settings.reportMode || (settings.enabled ? "enabled" : "disabled")} onChange={event => updateSettings("reportMode", event.target.value)}>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="test">Test</option>
          </select>
        </label>
      </div>
      <form onSubmit={saveReportSettings}>
        <div className="weekly-report-settings-grid">
          <div className="pp-field"><label>Frequency</label><select value={settings.frequency} onChange={event => updateSettings("frequency", event.target.value)}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></div>
          {settings.frequency === "monthly" ? <div className="pp-field"><label>Day of month</label><input type="number" min="1" max="31" value={settings.dayOfMonth} onChange={event => updateSettings("dayOfMonth", Number(event.target.value))} /></div> : <div className="pp-field"><label>Day</label><select value={settings.dayOfWeek} onChange={event => updateSettings("dayOfWeek", Number(event.target.value))}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div>}
          <div className="pp-field"><label>Time</label><input type="time" value={settings.sendTime} onChange={event => updateSettings("sendTime", event.target.value)} /></div>
          <div className="pp-field"><label>Timezone</label><select value={settings.timezone} onChange={event => updateSettings("timezone", event.target.value)}><option value="Europe/Helsinki">Europe/Helsinki</option><option value="UTC">UTC</option></select></div>
          <div className="pp-field weekly-report-wide"><label>Subject prefix</label><input value={settings.subjectPrefix} maxLength={120} onChange={event => updateSettings("subjectPrefix", event.target.value)} /></div>
          <div className="pp-field"><label>Visual density</label><select value={settings.visualDensity} onChange={event => updateSettings("visualDensity", event.target.value)}><option value="standard">Standard</option><option value="compact">Compact</option></select></div>
          <div className="pp-field"><label>Accent color</label><input type="color" value={settings.accentColor} onChange={event => updateSettings("accentColor", event.target.value)} /></div>
        </div>
        <div className="weekly-report-content-options">
          {[
            ["includeAnalytics", "Traffic analytics"],
            ["includeCountries", "Country breakdown"],
            ["includeCommunity", "Community activity"],
            ["includeContributions", "Contribution mix"],
            ["includeQueues", "Review queue"],
          ].map(([key, label]) => <label key={key}><input type="checkbox" checked={!!settings[key]} onChange={event => updateSettings(key, event.target.checked)} /><span>{label}</span></label>)}
        </div>
        <div className="weekly-report-settings-footer">
          <span>Last sent: {query.data?.settings?.lastSentAt ? fmtDate(query.data.settings.lastSentAt) : "Not yet"}</span>
          <button className="pp-btn pp-btn-primary" disabled={saveSettings.isPending}>{saveSettings.isPending ? "Saving..." : "Save settings"}</button>
        </div>
      </form>
    </section>

    <section className="pp-panel weekly-report-add">
      <h2 className="pp-panel-title">Add recipient</h2>
      <form onSubmit={submit}>
        <div className="pp-field"><label>Email</label><input required type="email" pattern="^[^@\s]+@karamahcollective\.com$" value={draft.email} placeholder="name@karamahcollective.com" onChange={event => setDraft({ ...draft, email: event.target.value })} /></div>
        <div className="pp-field"><label>Name <span>optional</span></label><input value={draft.displayName} maxLength={80} placeholder="First name or team label" onChange={event => setDraft({ ...draft, displayName: event.target.value })} /></div>
        <div className="weekly-report-add-action">
          <span aria-hidden="true">Action</span>
          <button className="pp-btn pp-btn-primary" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save recipient"}</button>
        </div>
      </form>
    </section>

    {query.isLoading && <div className="loading-state">Loading report recipients...</div>}
    {query.error && <p className="pp-error-text">{query.error.message}</p>}
    {query.data && <DataTable data={rows} columns={columns} getRowId={row => row.id} emptyMessage="No report recipients yet." />}
  </div>;
}
