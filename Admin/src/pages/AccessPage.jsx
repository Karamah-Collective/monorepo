import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, LockKey, PencilSimple, Plus, UsersThree } from "@phosphor-icons/react";
import { apiGet, apiPost } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { can } from "../auth/permissions.js";

const capabilities = [
  ["Workspace", [["activity", "Activity log"], ["analytics", "Analytics"], ["reports", "Weekly report"]]],
  ["Maps", [["maps.places", "Places"], ["maps.events", "Events"], ["maps.eid", "Eid prayers"], ["maps.social", "Social videos"], ["maps.styles", "Map appearance"], ["maps.settings", "Map settings"]]],
  ["Moderation", [["moderation.places", "Place submissions"], ["moderation.events", "Event edits"], ["moderation.reviews", "Reviews"], ["moderation.wishes", "Wishes"]]],
  ["Communications", [["inbox.contact", "Contact inbox"], ["inbox.manarah", "Manarah inbox"]]],
  ["Publishing", [["website.content", "Website content"], ["website.team", "Team directory"], ["website.subscribers", "Update signups"], ["links", "Link hub"]]],
];
const everyone = [
  ["forms.create", "Create and manage personal forms", "Share a form to add co-owners"],
  ["links.qr", "Create QR codes", "Generate and download branded QR codes"],
  ["maps.places.read", "Browse places", "View place records without changing them"],
  ["access.view", "View people and roles", "See who has access and request more"],
];
const firstName = (value, email = "") => (String(value || "").trim() || String(email).split("@")[0].replace(/[._-]+/g, " ")).split(/\s+/)[0];
const title = value => String(value).replaceAll(".", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const roleSummary = permissions => permissions.includes("*") ? "Full workspace access" : permissions.length ? permissions.map(title).join(" · ") : "Universal access only";

function MemberRow({ person, roles, currentEmail, editable, saving, onSaveName, onRoleChange, onRemove }) {
  const own = person.email.toLowerCase() === (currentEmail || "").toLowerCase();
  const [editing, setEditing] = useState(false), [name, setName] = useState(firstName(person.displayName, person.email));
  return <div className="access-row"><div className="access-row-top"><div className="access-person-name"><span className="access-avatar">{firstName(person.displayName, person.email).slice(0, 1).toUpperCase()}</span>{editing ? <><input aria-label="Your first name" maxLength={40} value={name} onChange={event => setName(event.target.value)} /><button className="pp-btn pp-btn-text" type="button" onClick={() => { onSaveName(name); setEditing(false); }}>Save</button></> : <><strong>{firstName(person.displayName, person.email)}</strong>{own && <button className="access-name-edit" type="button" onClick={() => setEditing(true)} aria-label="Edit your first name"><PencilSimple size={15} /></button>}</>}</div>{editable && !own && <button className="pp-btn pp-btn-text access-remove" disabled={saving} onClick={onRemove}>Remove</button>}</div><small className="access-email">{person.email}</small><div className="access-role-control">{editable ? <select aria-label={`Role for ${person.email}`} value={person.roleId} disabled={saving} onChange={event => onRoleChange(event.target.value)}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select> : <span className="pp-status-badge">{person.roleName}</span>}</div></div>;
}

function PermissionCell({ base, level, permissions, onChange }) {
  const id = `${base}.${level}`, selected = permissions.includes(id);
  const inherited = everyone.some(([permission]) => permission === id);
  const disabled = inherited || (level === "read" && permissions.includes(`${base}.write`));
  return <label className={`permission-cell${selected || disabled ? " is-selected" : ""}${disabled ? " is-implied" : ""}`}><input type="checkbox" checked={selected || disabled} disabled={disabled} onChange={event => onChange(id, event.target.checked)} /><span>{level === "read" ? <Eye size={15} /> : <PencilSimple size={15} />}{level === "read" ? "Read" : "Manage"}</span></label>;
}

export default function AccessPage() {
  const client = useQueryClient(), toast = useToast(), { user, access, updateDisplayName } = useAuth();
  const isAdmin = can(access, "*"), [member, setMember] = useState({ email: "", displayName: "", roleId: "viewer" });
  const [custom, setCustom] = useState({ id: "", name: "", description: "", permissions: [] });
  const [request, setRequest] = useState({ permission: "", adminEmail: "", note: "" });
  const roles = useQuery({ queryKey: ["access-roles"], queryFn: () => apiGet("access-roles") });
  const members = useQuery({ queryKey: ["access-members"], queryFn: () => apiGet("access-members") });
  const settings = useQuery({ queryKey: ["access-settings"], queryFn: () => apiGet("access-settings"), enabled: isAdmin });
  const refresh = () => { client.invalidateQueries({ queryKey: ["access-roles"] }); client.invalidateQueries({ queryKey: ["access-members"] }); };
  const saveMember = useMutation({ mutationFn: payload => apiPost("save-access-member", { member: payload }), onSuccess: () => { setMember({ email: "", displayName: "", roleId: "viewer" }); refresh(); toast("Member access saved"); } });
  const remove = useMutation({ mutationFn: email => apiPost("delete-access-member", { email }), onSuccess: () => { refresh(); toast("Member removed"); } });
  const saveRole = useMutation({ mutationFn: () => apiPost("save-access-role", { role: custom }), onSuccess: () => { setCustom({ id: "", name: "", description: "", permissions: [] }); refresh(); toast("Custom role created"); } });
  const saveDefault = useMutation({ mutationFn: defaultRoleId => apiPost("save-access-settings", { defaultRoleId }), onSuccess: () => client.invalidateQueries({ queryKey: ["access-settings"] }) });
  const saveMyName = useMutation({ mutationFn: updateDisplayName, onSuccess: refresh });
  const sendRequest = useMutation({ mutationFn: () => apiPost("request-access", request), onSuccess: result => { setRequest(current => ({ ...current, permission: "", note: "" })); toast(result.notified ? "Request sent and administrator notified" : "Request saved for the administrator"); } });
  const roleMap = useMemo(() => new Map((roles.data?.roles || []).map(role => [role.id, role])), [roles.data]);
  const admins = (members.data?.members || []).filter(person => roleMap.get(person.roleId)?.permissions?.includes("*"));
  const updatePermission = (id, enabled) => setCustom(current => { let permissions = current.permissions.filter(value => value !== id); if (enabled) permissions.push(id); if (id.endsWith(".write") && enabled) permissions = permissions.filter(value => value !== id.replace(".write", ".read")); return { ...current, permissions }; });
  const requestOptions = capabilities.flatMap(([, items]) => items.map(([base, label]) => [`${base}.write`, `Manage ${label}`]));

  return <div className="pp-page access-page">
    <header className="access-heading"><div><div className="eyebrow">WORKSPACE / ACCESS</div><h1 className="pp-page-title">Roles & access</h1></div><LockKey size={30} /></header>

    <section className="pp-panel access-foundation"><div className="access-section-title"><div><span className="access-kicker">INCLUDED FOR EVERYONE</span><h2 className="pp-panel-title">Your workspace foundation</h2><p>These capabilities follow every verified team member, regardless of role.</p></div><span className="access-fixed"><LockKey size={14} /> Fixed baseline</span></div><div className="access-foundation-grid">{everyone.map(([id, label, description]) => <article key={id}><span><Check size={15} /></span><div><strong>{label}</strong><small>{description}</small></div></article>)}</div></section>

    <section className="pp-panel"><div className="access-section-title"><div><h2 className="pp-panel-title">People & roles</h2><p>Everyone can see the team’s roles. Only administrators can change them.</p></div><span className="access-team-count"><UsersThree size={16} />{members.data?.members?.length || 0} members</span></div>{members.isLoading ? <div className="loading-state">Loading team…</div> : <div className="access-list">{members.data?.members?.map(person => <MemberRow key={person.email} person={person} roles={roles.data?.roles || []} currentEmail={user?.email} editable={isAdmin} saving={saveMember.isPending || remove.isPending} onSaveName={value => saveMyName.mutate(value)} onRoleChange={roleId => saveMember.mutate({ email: person.email, roleId })} onRemove={() => remove.mutate(person.email)} />)}</div>}</section>

    {!isAdmin && <section className="pp-panel access-request"><div><span className="access-kicker">NEED SOMETHING ELSE?</span><h2 className="pp-panel-title">Request additional access</h2><p>Select the capability and the administrator who should review it. They’ll receive an email when notifications are configured.</p></div><form onSubmit={event => { event.preventDefault(); sendRequest.mutate(); }}><label className="pp-field">Access needed<select required value={request.permission} onChange={event => setRequest({ ...request, permission: event.target.value })}><option value="">Choose access</option>{requestOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="pp-field">Send to<select required value={request.adminEmail} onChange={event => setRequest({ ...request, adminEmail: event.target.value })}><option value="">Choose administrator</option>{admins.map(person => <option key={person.email} value={person.email}>{firstName(person.displayName, person.email)} · {person.email}</option>)}</select></label><label className="pp-field access-request-note">Context <span>optional</span><textarea rows="3" maxLength="500" value={request.note} onChange={event => setRequest({ ...request, note: event.target.value })} placeholder="What do you need to do?" /></label><button className="pp-btn pp-btn-primary" disabled={sendRequest.isPending}>{sendRequest.isPending ? "Sending…" : "Send request"}</button></form>{sendRequest.error && <p className="pp-error-text">{sendRequest.error.message}</p>}</section>}

    {isAdmin && <><section className="pp-panel access-admin-settings"><div><h2 className="pp-panel-title">Membership settings</h2><p className="access-panel-copy">New verified accounts receive the universal foundation plus this default role.</p></div><div className="access-default"><select aria-label="Default role" value={settings.data?.defaultRoleId || "viewer"} onChange={event => saveDefault.mutate(event.target.value)}>{roles.data?.roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select><span>{saveDefault.isPending ? "Saving…" : "Default role"}</span></div><form className="access-member-form" onSubmit={event => { event.preventDefault(); saveMember.mutate(member); }}><label className="pp-field">Email<input required type="email" placeholder="name@karamahcollective.com" value={member.email} onChange={event => setMember({ ...member, email: event.target.value })} /></label><label className="pp-field">First name <span>optional</span><input maxLength={40} value={member.displayName} onChange={event => setMember({ ...member, displayName: event.target.value })} /></label><label className="pp-field">Role<select value={member.roleId} onChange={event => setMember({ ...member, roleId: event.target.value })}>{roles.data?.roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><button className="pp-btn pp-btn-primary" disabled={saveMember.isPending}><Plus size={15} />Add member</button></form></section>

    <section className="pp-panel"><h2 className="pp-panel-title">Role library</h2><div className="access-role-grid">{roles.data?.roles?.map(role => <article className="access-role" key={role.id}><div><strong>{role.name}</strong>{role.isPreset && <span>Preset</span>}</div><small title={role.permissions.join(" · ")}>{roleSummary(role.permissions)}</small></article>)}</div></section>

    <section className="pp-panel access-role-builder"><div className="access-builder-heading"><div><span className="access-kicker">CUSTOM ROLE</span><h2 className="pp-panel-title">Create a precise role</h2><p className="access-panel-copy">Read lets someone inspect an area. Manage includes read and allows changes.</p></div><div className="access-selection-count"><strong>{custom.permissions.length}</strong><span>grants</span></div></div><form className="access-role-form" onSubmit={event => { event.preventDefault(); saveRole.mutate(); }}><label className="pp-field">Role name<input required placeholder="Events coordinator" value={custom.name} onChange={event => setCustom({ ...custom, name: event.target.value, id: custom.id || event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-") })} /></label><label className="pp-field">Purpose <span>optional</span><input placeholder="What this role is responsible for" value={custom.description} onChange={event => setCustom({ ...custom, description: event.target.value })} /></label><div className="permission-matrix"><div className="permission-matrix-head"><span>Area</span><span><Eye size={14} />Read</span><span><PencilSimple size={14} />Manage</span></div>{capabilities.map(([group, items]) => <fieldset key={group}><legend>{group}</legend>{items.map(([base, label]) => <div className="permission-row" key={base}><strong>{label}</strong><PermissionCell base={base} level="read" permissions={custom.permissions} onChange={updatePermission} /><PermissionCell base={base} level="write" permissions={custom.permissions} onChange={updatePermission} /></div>)}</fieldset>)}</div><div className="access-builder-footer"><span>Universal access stays available and does not need to be selected.</span><button className="pp-btn pp-btn-primary" disabled={saveRole.isPending || !custom.permissions.length}>{saveRole.isPending ? "Creating…" : "Create role"}</button></div></form>{saveRole.error && <p className="pp-error-text">{saveRole.error.message}</p>}</section></>}
  </div>;
}
