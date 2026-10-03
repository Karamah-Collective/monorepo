import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../api/client.js";
import { Icons } from "../icons.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { can } from "../auth/permissions.js";

const permissionGroups = [
  ["Workspace", [["dashboard.view", "Dashboard"], ["activity.view", "Activity log"], ["reports.manage", "Weekly report"]]],
  ["Maps", [["maps.places", "Places"], ["maps.events", "Events"], ["maps.eid", "Eid prayers"], ["maps.social", "Social videos"], ["maps.styles", "Map appearance"], ["maps.settings", "Map settings"]]],
  ["Moderation", [["moderation.places", "Place submissions"], ["moderation.events", "Event edits"], ["moderation.reviews", "Reviews & reviewer access"], ["moderation.wishes", "Wishes"], ["moderation.contacts", "Inbox"]]],
  ["Publishing", [["website.content", "Website content"], ["website.team", "Team directory"], ["website.subscribers", "Update signups"], ["links.manage", "Link hub"], ["forms.manage", "Forms"]]],
];
const roleScopeLabels = {
  "dashboard.view": "Dashboard",
  "activity.view": "Activity log",
  "reports.manage": "Weekly report",
  "maps.*": "Map management",
  "moderation.*": "Moderation",
  "website.*": "Website content",
  "links.*": "Link hub",
  "links.manage": "Link hub",
  "forms.*": "Forms",
  "forms.manage": "Forms",
};
function roleScope(permissions) {
  if (permissions.includes("*")) return "Full workspace access";
  return permissions.map(permission => roleScopeLabels[permission] || permission.split(".").map(part => part.replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase())).join(" ")).join(" / ");
}
function firstName(value, email = "") {
  const source = String(value || "").trim() || String(email).split("@")[0].replace(/[._-]+/g, " ");
  const name = source.split(/\s+/)[0] || "";
  return name ? `${name[0].toUpperCase()}${name.slice(1)}` : "";
}

function TeamAccessRow({ person, roles, currentEmail, saving, onSaveName, onRoleChange, onRemove }) {
  const own = person.email.toLowerCase() === (currentEmail || "").toLowerCase();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(firstName(person.displayName, person.email));
  return <div className="access-row"><div className="access-row-top"><div className="access-person-name">{editing ? <><input aria-label="Your first name" autoComplete="given-name" maxLength={40} value={name} onChange={event => setName(event.target.value)} /><button className="pp-btn pp-btn-text" type="button" onClick={() => { onSaveName(name); setEditing(false); }}>Save</button></> : <><strong>{firstName(person.displayName, person.email)}</strong>{own && <button className="access-name-edit" type="button" onClick={() => setEditing(true)} aria-label="Edit your first name"><Icons.pencil size={15} /></button>}</>}</div>{roles.length ? <button className="pp-btn pp-btn-text access-remove" disabled={saving} onClick={onRemove}>Remove</button> : null}</div><small className="access-email">{person.email}</small><div className="access-role-control">{roles.length ? <select aria-label={`Role for ${person.email}`} value={person.roleId} disabled={saving} onChange={event => onRoleChange(event.target.value)}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select> : <span className="pp-status-badge">{person.roleName}</span>}</div></div>;
}

export default function AccessPage() {
  const client = useQueryClient();
  const { user, access, updateDisplayName } = useAuth();
  const isAdmin = can(access, "*");
  const [myName, setMyName] = useState(user?.displayName || "");
  const [member, setMember] = useState({ email: "", displayName: "", roleId: "viewer" });
  const [custom, setCustom] = useState({ id: "", name: "", description: "", permissions: [] });
  const roles = useQuery({ queryKey: ["access-roles"], queryFn: () => apiGet("access-roles"), enabled:isAdmin });
  const members = useQuery({ queryKey: ["access-members"], queryFn: () => apiGet("access-members"), enabled:isAdmin });
  const settings = useQuery({ queryKey: ["access-settings"], queryFn: () => apiGet("access-settings"), enabled:isAdmin });
  const refresh = () => { client.invalidateQueries({ queryKey: ["access-roles"] }); client.invalidateQueries({ queryKey: ["access-members"] }); };
  const saveMember = useMutation({ mutationFn: () => apiPost("save-access-member", { member }), onSuccess: () => { setMember({ email: "", displayName: "", roleId: "viewer" }); refresh(); } });
  const changeMemberRole = useMutation({ mutationFn: ({ email, roleId }) => apiPost("save-access-member", { member:{ email, roleId } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: email => apiPost("delete-access-member", { email }), onSuccess: refresh });
  const saveRole = useMutation({ mutationFn: () => apiPost("save-access-role", { role: custom }), onSuccess: () => { setCustom({ id: "", name: "", description: "", permissions: [] }); refresh(); } });
  const saveDefault = useMutation({ mutationFn: defaultRoleId => apiPost("save-access-settings", { defaultRoleId }), onSuccess: () => client.invalidateQueries({ queryKey: ["access-settings"] }) });
  const saveMyName = useMutation({ mutationFn: value => updateDisplayName(value), onSuccess: () => client.invalidateQueries({ queryKey:["access-members"] }) });
  const toggleGroup = items => setCustom(current => { const ids = items.map(([id]) => id); const all = ids.every(id => current.permissions.includes(id)); return { ...current, permissions: all ? current.permissions.filter(id => !ids.includes(id)) : [...new Set([...current.permissions, ...ids])] }; });
  const updateCustom = (id, enabled) => setCustom(current => ({ ...current, permissions: enabled ? [...current.permissions, id] : current.permissions.filter(value => value !== id) }));
  return <div className="pp-page access-page">
    <div className="access-heading"><div><div className="eyebrow">WORKSPACE / ACCESS</div><h1 className="pp-page-title">Roles & access</h1><p className="pp-page-lead">Choose what each verified Workspace account can do. People sign in with Google or a password first; adding them here grants their workspace role.</p></div><Icons.shield size={30} /></div>
    {!isAdmin && <section className="pp-panel"><h2 className="pp-panel-title">Your workspace profile</h2><TeamAccessRow person={{ email:user?.email || "", displayName:user?.displayName || "", roleId:access?.roleId || "", roleName:access?.roleName || "" }} roles={[]} currentEmail={user?.email} saving={saveMyName.isPending} onSaveName={value => saveMyName.mutate(value)} onRoleChange={()=>{}} onRemove={()=>{}} /></section>}
    {isAdmin && <>
    <section className="pp-panel"><h2 className="pp-panel-title">Default role for new sign-ins</h2><p className="access-panel-copy">Every verified @karamahcollective.com account is added automatically on its first sign-in. You can change their role at any time below.</p><div className="access-default"><select aria-label="Default role" value={settings.data?.defaultRoleId || "viewer"} onChange={e => saveDefault.mutate(e.target.value)}>{roles.data?.roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select><span>{saveDefault.isPending ? "Saving…" : "Applied automatically"}</span></div></section>
    <section className="pp-panel"><h2 className="pp-panel-title">Add or change a team member</h2><form className="access-member-form" onSubmit={e => { e.preventDefault(); saveMember.mutate(); }}><div className="pp-field"><label>Email</label><input required type="email" placeholder="name@karamahcollective.com" value={member.email} onChange={e => setMember({ ...member, email: e.target.value })} /></div><div className="pp-field"><label>First name <span>optional</span></label><input autoComplete="given-name" maxLength={40} value={member.displayName} onChange={e => setMember({ ...member, displayName: e.target.value })} /></div><div className="pp-field"><label>Role</label><select value={member.roleId} onChange={e => setMember({ ...member, roleId: e.target.value })}>{roles.data?.roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div><button className="pp-btn pp-btn-primary" disabled={saveMember.isPending}>{saveMember.isPending ? "Saving…" : "Save role"}</button></form>{saveMember.error && <p className="pp-error-text">{saveMember.error.message}</p>}</section>
    <section className="pp-panel"><div className="access-section-title"><div><h2 className="pp-panel-title">Team access</h2><p>Change roles with care. Each change is recorded in the shared activity log.</p></div></div>{members.isLoading ? <div className="loading-state">Loading access…</div> : <div className="access-list">{members.data?.members?.map(person => <TeamAccessRow key={person.email} person={person} roles={roles.data?.roles || []} currentEmail={user?.email} saving={changeMemberRole.isPending || remove.isPending} onSaveName={value => { setMyName(value); saveMyName.mutate(); }} onRoleChange={roleId => { if (window.confirm(`Change ${person.displayName || person.email}'s role to ${roles.data?.roles?.find(role => role.id === roleId)?.name || roleId}?`)) changeMemberRole.mutate({ email:person.email, roleId }); }} onRemove={() => { if (window.confirm(`Remove ${person.displayName || person.email} from the workspace? They will receive the default role again if they sign in later.`)) remove.mutate(person.email); }} />)}</div>}</section>
    <section className="pp-panel"><h2 className="pp-panel-title">Role library</h2><div className="access-role-grid">{roles.data?.roles?.map(role => <article className="access-role" key={role.id}><strong>{role.name}</strong><small title={role.permissions.includes("*") ? "Everything" : role.permissions.join(" · ")}>{roleScope(role.permissions)}</small></article>)}</div></section>
    <section className="pp-panel access-role-builder"><div className="access-builder-heading"><div><div className="eyebrow">CUSTOM ROLE BUILDER</div><h2 className="pp-panel-title">Shape access with intent</h2><p className="access-panel-copy">Select only the work this role needs. Each switch governs a specific area in the interface and its protected API actions.</p></div><div className="access-selection-count"><strong>{custom.permissions.length}</strong><span>capabilities selected</span></div></div><form className="access-role-form" onSubmit={e => { e.preventDefault(); saveRole.mutate(); }}><div className="pp-field"><label>Role name</label><input required placeholder="e.g. Events coordinator" value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value, id: custom.id || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-") })} /></div><div className="pp-field"><label>Purpose <span>optional</span></label><input placeholder="What this role is for" value={custom.description} onChange={e => setCustom({ ...custom, description: e.target.value })} /></div><div className="access-permissions">{permissionGroups.map(([group, items]) => { const selected = items.filter(([id]) => custom.permissions.includes(id)).length; return <fieldset key={group}><div className="access-permission-heading"><legend>{group}</legend><button type="button" onClick={() => toggleGroup(items)}>{selected === items.length ? "Clear group" : "Select all"}</button></div><small>{selected} of {items.length} selected</small><div className="access-permission-options">{items.map(([id, label]) => <label key={id} className={custom.permissions.includes(id) ? "is-selected" : ""}><input type="checkbox" checked={custom.permissions.includes(id)} onChange={e => updateCustom(id, e.target.checked)} /><span>{label}</span><i aria-hidden="true" /></label>)}</div></fieldset>; })}</div><div className="access-builder-footer"><span>Roles can be changed later without removing anyone from the workspace.</span><button className="pp-btn pp-btn-primary" disabled={saveRole.isPending}>{saveRole.isPending ? "Saving…" : "Create custom role"}</button></div></form>{saveRole.error && <p className="pp-error-text">{saveRole.error.message}</p>}</section>
    </>}
  </div>;
}
