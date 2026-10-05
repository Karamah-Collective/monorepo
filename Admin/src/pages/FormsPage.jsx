import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardText,
  DotsThree,
  Eye,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import { useToast } from "../components/Toast.jsx";
import {
  formPublicUrl,
  formShortUrl,
  useCreateForm,
  useDeleteForm,
  useDuplicateForm,
  useForms,
  useSetFormStatus,
} from "../api/forms.js";
import ManageActions from "../components/ManageActions.jsx";

const STATUS_LABELS = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  archived: "Archived",
};
const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";

export default function FormsPage() {
  const navigate = useNavigate(),
    toast = useToast();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState("updated_at");
  const query = useForms({ search, status, sort }),
    create = useCreateForm(),
    duplicate = useDuplicateForm(),
    changeStatus = useSetFormStatus(),
    remove = useDeleteForm();
  const formActionBusy =
    duplicate.isPending || changeStatus.isPending || remove.isPending;
  const forms = query.data?.forms || [];
  const counts = useMemo(
    () =>
      forms.reduce(
        (result, form) => ({
          ...result,
          [form.status]: (result[form.status] || 0) + 1,
        }),
        {},
      ),
    [forms],
  );
  async function createNew() {
    try {
      const result = await create.mutateAsync({ title: "Untitled form" });
      toast("Form created");
      navigate(`/forms/${result.id}`);
    } catch (error) {
      toast(error.message, "error");
    }
  }
  async function duplicateForm(form) {
    try {
      const result = await duplicate.mutateAsync({ id: form.id });
      toast("Form duplicated");
      navigate(`/forms/${result.id}`);
    } catch (error) {
      toast(error.message, "error");
    }
  }
  async function updateStatus(form, status) {
    const action = {
      archived: "Form archived",
      closed: "Responses closed",
      draft: "Form restored to drafts",
      published: "Form reopened",
    }[status] || "Form updated";
    try {
      await changeStatus.mutateAsync({ id: form.id, status });
      toast(action);
    } catch (error) {
      toast(error.message, "error");
    }
  }
  async function deleteForm(form) {
    if (
      !confirm(
        `Move “${form.title}” to deleted forms? Responses will remain protected.`,
      )
    )
      return;
    try {
      await remove.mutateAsync({ id: form.id });
      toast("Form removed");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  return (
    <div className="forms-page">
      <header className="forms-page-header">
        <div>
          <p className="page-eyebrow">PUBLISH & COLLECT</p>
          <h1 className="pp-page-title">Forms</h1>
          <p className="pp-page-lead">
            Build thoughtful workflows, then follow every response from one
            place.
          </p>
        </div>
        <button
          className="pp-btn pp-btn-primary"
          onClick={createNew}
          disabled={create.isPending}
        >
          <Plus size={16} />
          {create.isPending ? "Creating…" : "Create form"}
        </button>
      </header>
      <section className="forms-summary" aria-label="Form overview">
        <div>
          <strong>{forms.length}</strong>
          <span>visible forms</span>
        </div>
        <div>
          <strong>{counts.published || 0}</strong>
          <span>collecting responses</span>
        </div>
        <div>
          <strong>
            {forms.reduce((sum, form) => sum + form.responseCount, 0)}
          </strong>
          <span>total responses</span>
        </div>
      </section>
      <div className="forms-toolbar">
        <label className="forms-search">
          <MagnifyingGlass size={15} />
          <span className="sr-only">Search forms</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search forms"
          />
        </label>
        <div className="forms-filters">
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All states</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort forms"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="updated_at">Recently updated</option>
            <option value="created_at">Recently created</option>
            <option value="title">Title</option>
            <option value="response_count">Most responses</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>
      {query.isLoading && (
        <div className="forms-list-skeleton">
          {[1, 2, 3].map((item) => (
            <div key={item}>
              <i></i>
              <span></span>
              <span></span>
            </div>
          ))}
        </div>
      )}
      {query.error && (
        <div className="query-error" role="alert">
          <strong>Forms could not be loaded</strong>
          <p>{query.error.message}</p>
          <button className="pp-btn" onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {!query.isLoading && !query.error && !forms.length && (
        <div className="forms-empty">
          <span>
            <ClipboardText size={34} />
          </span>
          <h2>
            {search || status !== "all"
              ? "No forms match this view"
              : "Your first form starts here"}
          </h2>
          <p>
            {search || status !== "all"
              ? "Clear your search or choose another state."
              : "Create a form, add questions, preview the full journey, and publish when it is ready."}
          </p>
          {!search && status === "all" && (
            <button className="pp-btn pp-btn-primary" onClick={createNew}>
              Create form
            </button>
          )}
        </div>
      )}
      {!!forms.length && (
        <div className="forms-collection">
          {forms.map((form) => (
            <article className="form-row" key={form.id}>
              <button
                className="form-row-main"
                onClick={() => navigate(`/forms/${form.id}`)}
              >
                <span className="form-document">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <span>
                  <strong>{form.title}</strong>
                  <small>
                    <span className={`form-access-label is-${form.accessRelation || "owner"}`}>{form.accessRelation === "collaborator" ? "Shared with you" : form.accessRelation === "administrator" ? (form.ownerEmail ? `Owned by ${form.ownerEmail}` : "Administrator view") : "Owned by you"}</span> · Updated {dateLabel(form.updatedAt)} · {form.responseCount}{" "}
                    response{form.responseCount === 1 ? "" : "s"}
                  </small>
                </span>
              </button>
              <span className={`form-status status-${form.status}`}>
                <i></i>
                {STATUS_LABELS[form.status]}
              </span>
              <span className="form-row-last">
                <small>Last response</small>
                {dateLabel(form.lastResponseAt)}
              </span>
              <div className="form-row-actions">
                {form.activeVersionId && (
                  <a
                    className="icon-button"
                    title="Open public form"
                    aria-label={`Open ${form.title}`}
                    href={formPublicUrl(form.shareCode)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Eye size={16} />
                  </a>
                )}
                <ManageActions
                  label={`Manage ${form.title}`}
                  className="icon-button form-manage-trigger"
                  icon={<DotsThree size={18} />}
                  iconOnly
                  disabled={formActionBusy}
                >
                  {() => (
                    <>
                      {form.activeVersionId && (
                        <button
                          role="menuitem"
                          className="pp-manage-action"
                          onClick={() =>
                            navigate(
                              `/links/qr?source=form&title=${encodeURIComponent(form.title || "Form")}&url=${encodeURIComponent(formShortUrl(form.shortCode || form.shareCode))}`,
                            )
                          }
                        >
                          <span>Create QR</span>
                          <small>Open the shared QR generator</small>
                        </button>
                      )}
                      <button
                        role="menuitem"
                        className="pp-manage-action"
                        onClick={() => duplicateForm(form)}
                      >
                        <span>Duplicate</span>
                        <small>Create a copy to edit separately</small>
                      </button>
                      {form.status === "published" && (
                        <button
                          role="menuitem"
                          className="pp-manage-action"
                          onClick={() => updateStatus(form, "closed")}
                        >
                          <span>Close responses</span>
                          <small>Keep the form visible but stop submissions</small>
                        </button>
                      )}
                      {form.status === "closed" && (
                        <button
                          role="menuitem"
                          className="pp-manage-action"
                          onClick={() => updateStatus(form, "published")}
                        >
                          <span>Reopen</span>
                          <small>Allow new responses again</small>
                        </button>
                      )}
                      <button
                        role="menuitem"
                        className="pp-manage-action"
                        onClick={() =>
                          updateStatus(
                            form,
                            form.status === "archived" ? "draft" : "archived",
                          )
                        }
                      >
                        <span>
                          {form.status === "archived" ? "Unarchive" : "Archive"}
                        </span>
                        <small>
                          {form.status === "archived"
                            ? "Return it to drafts"
                            : "Move it out of active views"}
                        </small>
                      </button>
                      <button
                        role="menuitem"
                        className="pp-manage-action pp-manage-action-danger"
                        onClick={() => deleteForm(form)}
                      >
                        <span>Delete</span>
                        <small>Remove it from the forms list</small>
                      </button>
                    </>
                  )}
                </ManageActions>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
