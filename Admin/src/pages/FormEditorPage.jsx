import { useEffect, useRef, useState, lazy, Suspense } from "react";
const Preview = lazy(() => import('../components/FormPreview.jsx'));
import useUnsavedChanges from '../components/useUnsavedChanges.js';
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  ChartBar,
  Check,
  Copy,
  DownloadSimple,
  Eye,
  FloppyDisk,
  Gear,
  ListBullets,
  Plus,
  Trash,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";
import {
  createQuestion,
  makeId,
  QUESTION_TYPES,
  validateSchema,
} from "../../../shared/forms-domain.mjs";
import { useToast } from "../components/Toast.jsx";
import {
  exportFormResponses,
  formAssetUrl,
  formPublicUrl,
  uploadFormCover,
  useDeleteSubmission,
  useForm,
  useFormAnalytics,
  useFormSubmissions,
  useFormVersion,
  usePublishForm,
  useSaveForm,
  useSetFormStatus,
} from "../api/forms.js";

const TYPE_LABELS = {
  short_text: "Short answer",
  long_text: "Long answer",
  email: "Email",
  phone: "Phone",
  url: "URL",
  number: "Number",
  date: "Date",
  time: "Time",
  datetime: "Date & time",
  single_choice: "Multiple choice",
  multi_choice: "Checkboxes",
  dropdown: "Dropdown",
  multiselect: "Multi-select",
  rating: "Rating",
  scale: "Linear scale",
  yes_no: "Yes / No",
  consent: "Consent",
  matrix: "Multiple-choice grid",
  checkbox_grid: "Checkbox grid",
  file: "File upload",
  ranking: "Ranking",
  address: "Address",
  hidden: "Hidden field",
};
const TABS = [
  ["build", "Build", ListBullets],
  ["logic", "Logic", Warning],
  ["settings", "Settings", Gear],
  ["preview", "Preview", Eye],
  ["responses", "Responses", UsersThree],
  ["analytics", "Analytics", ChartBar],
];
const clone = (value) => structuredClone(value);
const move = (array, index, direction) => {
  const next = [...array],
    target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export default function FormEditorPage() {
  const { id } = useParams();
  return <FormEditor key={id} />;
}
function FormEditor() {
  const { id } = useParams(),
    navigate = useNavigate(),
    toast = useToast(),
    query = useForm(id);
  const save = useSaveForm(),
    publish = usePublishForm(),
    status = useSetFormStatus();
  const [draft, setDraft] = useState(null),
    [revision, setRevision] = useState(0),
    [slug, setSlug] = useState(""),
    [tab, setTab] = useState("build"),
    [selected, setSelected] = useState(null),
    [saveState, setSaveState] = useState("saved"),
    [previewMobile, setPreviewMobile] = useState(false);
  useUnsavedChanges(saveState !== 'saved');
  const hydrated = useRef(false), saveTimer = useRef(0);
  const latest = useRef(null), revisionRef = useRef(0), generation = useRef(0), savedGeneration = useRef(0), saving = useRef(null);
  useEffect(() => {
    if (!query.data || hydrated.current) return;
    hydrated.current = true;
    const schema = clone(query.data.schema);
    latest.current = {schema, slug: query.data.form.slug};
    revisionRef.current = query.data.form.revision;
    setDraft(schema);
    setRevision(query.data.form.revision);
    setSlug(query.data.form.slug);
    setSelected(schema.sections[0]?.blocks?.[0]?.id || null);
  }, [query.data]);
  useEffect(() => {
    const warn = event => { if (generation.current !== savedGeneration.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { clearTimeout(saveTimer.current); window.removeEventListener('beforeunload', warn); };
  }, []);
  function update(recipe) {
    const next = clone(latest.current.schema);
    recipe(next);
    setDraft(next);
    scheduleSave(next);
  }
  function scheduleSave(next, nextSlug = latest.current?.slug ?? slug) {
    latest.current = {schema:next,slug:nextSlug};
    generation.current++;
    setSaveState('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveDraft().catch(() => {}); }, 900);
  }
  async function saveDraft() {
    clearTimeout(saveTimer.current);
    if (saving.current) return saving.current;
    if (!latest.current) return revisionRef.current;
    if (savedGeneration.current === generation.current) return revisionRef.current;
    saving.current = (async () => {
      try {
        while (savedGeneration.current < generation.current) {
          setSaveState('saving');
          const snapshot = latest.current, version = generation.current;
          const result = await save.mutateAsync({id, revision:revisionRef.current, ...snapshot});
          if (result.conflict) throw new Error(result.error);
          revisionRef.current = result.revision;
          setRevision(result.revision);
          savedGeneration.current = version;
          if (generation.current === version) {
            latest.current = {...snapshot,slug:result.slug};
            setSlug(result.slug);
          }
        }
        setSaveState('saved');
        return revisionRef.current;
      } catch (error) {
        setSaveState(error.message.includes('another tab') ? 'conflict' : 'failed');
        throw error;
      } finally { saving.current = null; }
    })();
    return saving.current;
  }
  async function publishNow() {
    clearTimeout(saveTimer.current);
    const check = validateSchema(draft);
    if (!check.valid) {
      toast(check.errors[0], "error");
      setTab("build");
      return;
    }
    try {
      const publishRevision =
        saveState === "saved" ? revision : await saveDraft(draft, slug);
      const result = await publish.mutateAsync({
        id,
        revision: publishRevision,
      });
      toast(`Version ${result.versionNumber} published`);
      query.refetch();
    } catch (error) {
      toast(error.message, "error");
    }
  }
  if (!query.error && (query.isLoading || !draft))
    return (
      <div className="forms-editor-loading">
        <div></div>
        <span></span>
        <span></span>
      </div>
    );
  if (query.error)
    return (
      <div className="query-error">
        <strong>Form could not be loaded</strong>
        <p>{query.error.message}</p>
        <button className="pp-btn" onClick={() => query.refetch()}>
          Try again
        </button>
      </div>
    );
  const form = query.data.form;
  return (
    <div className="form-editor-page">
      <header className="form-editor-header">
        <button
          className="icon-button"
          onClick={async () => { try { await saveDraft(); navigate('/forms'); } catch (error) { toast(error.message, 'error'); } }}
          aria-label="Back to forms"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="form-editor-title">
          <input
            aria-label="Form title"
            value={draft.title}
            onChange={(event) =>
              update((schema) => {
                schema.title = event.target.value;
              })
            }
          />
          <span className={`save-indicator is-${saveState}`}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "dirty"
                ? "Unsaved changes"
                : saveState === "failed"
                  ? "Save failed"
                  : saveState === "conflict"
                    ? "Newer edit detected"
                    : "All changes saved"}
          </span>
        </div>
        <div className="form-editor-header-actions">
          {form.activeVersionId && (
            <a
              className="pp-btn"
              href={formPublicUrl(form.shareCode)}
              target="_blank"
              rel="noreferrer"
            >
              Open live <ArrowSquareOut size={14} />
            </a>
          )}
          <button
            className="pp-btn"
            onClick={() => {
              setTab("preview");
            }}
          >
            Preview
          </button>
          <button
            className="pp-btn pp-btn-primary"
            onClick={publishNow}
            disabled={publish.isPending || saveState === "conflict"}
          >
            {publish.isPending ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>
      <nav
        className="pp-section-tabs forms-editor-tabs"
        aria-label="Form areas"
      >
        {TABS.map(([value, label, Icon]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => setTab(value)}
          >
            <Icon size={15} />
            {label}
            {value === "responses" && form.responseCount > 0 && (
              <em>{form.responseCount}</em>
            )}
          </button>
        ))}
      </nav>
      {tab === "build" && (
        <Builder
          draft={draft}
          update={update}
          selected={selected}
          setSelected={setSelected}
        />
      )}
      {tab === "logic" && <LogicEditor draft={draft} update={update} />}
      {tab === "settings" && (
        <SettingsEditor
          draft={draft}
          update={update}
          slug={slug}
          setSlug={(value) => {
            setSlug(value);
            scheduleSave(draft, value);
          }}
          form={form}
          versions={query.data.versions || []}
          setStatus={(next) =>
            status.mutateAsync({ id, status: next }).then(() => query.refetch())
          }
        />
      )}
      {tab === "preview" && (
        <Preview
          schema={draft}
          mobile={previewMobile}
          setMobile={setPreviewMobile}
        />
      )}
      {tab === "responses" && <Responses formId={id} schema={draft} />}
      {tab === "analytics" && <Analytics formId={id} />}
      {saveState !== "saved" && <div className={`form-save-dock is-${saveState}`}>
        <span>
          {saveState === "saving" ? (
            <FloppyDisk size={15} />
          ) : saveState === "saved" ? (
            <Check size={15} />
          ) : (
            <Warning size={15} />
          )}
          <b>
            {saveState === "saved"
              ? "Draft protected"
              : saveState === "conflict"
                ? "Editing conflict"
                : saveState === "failed"
                  ? "Could not save"
                  : "Draft has changes"}
          </b>
          <small>
            {saveState === "saved"
              ? "Published responses remain tied to their original version."
              : "Keep this page open while changes are saved."}
          </small>
        </span>
        {["failed", "conflict"].includes(saveState) && (
          <button className="pp-btn" onClick={() => saveDraft().catch(error => toast(error.message, 'error'))}>
            Try again
          </button>
        )}
      </div>}
    </div>
  );
}

function Builder({ draft, update, selected, setSelected }) {
  const [sectionId, setSectionId] = useState(draft.sections[0]?.id),
    section =
      draft.sections.find((item) => item.id === sectionId) || draft.sections[0];
  const selectedBlock = section?.blocks?.find((block) => block.id === selected);
  function addQuestion(type = "short_text") {
    const question = createQuestion(type);
    update((schema) =>
      schema.sections
        .find((item) => item.id === section.id)
        .blocks.push(question),
    );
    setSelected(question.id);
  }
  function addContent(kind) {
    const block = {
      id: makeId("block"),
      kind,
      text:
        kind === "divider"
          ? ""
          : kind === "callout"
            ? "Important information"
            : "Add content",
    };
    update((schema) =>
      schema.sections.find((item) => item.id === section.id).blocks.push(block),
    );
    setSelected(block.id);
  }
  function deleteBlock(block) {
    if (
      !confirm(
        `Delete this ${block.kind === "question" ? "question" : "content block"}? Rules that reference it must also be removed.`,
      )
    )
      return;
    update((schema) => {
      for (const sec of schema.sections)
        sec.blocks = sec.blocks.filter((item) => item.id !== block.id);
      schema.rules = (schema.rules || []).filter(
        (rule) =>
          ![...(rule.when?.all || []), ...(rule.when?.any || [])].some(
            (c) => c.questionId === block.id,
          ) && !(rule.actions || []).some((a) => a.targetId === block.id),
      );
    });
    setSelected(null);
  }
  return (
    <div className="builder-layout">
      <aside className="builder-outline">
        <div className="builder-panel-label">
          <span>FORM OUTLINE</span>
          <button
            title="Add section"
            onClick={() => {
              const id = makeId("section");
              update((schema) =>
                schema.sections.push({
                  id,
                  title: `Section ${schema.sections.length + 1}`,
                  description: "",
                  blocks: [],
                }),
              );
              setSectionId(id);
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        {draft.sections.map((item, index) => (
          <button
            key={item.id}
            className={item.id === section.id ? "active" : ""}
            onClick={() => {
              setSectionId(item.id);
              setSelected(item.blocks[0]?.id || null);
            }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <b>{item.title || "Untitled section"}</b>
            <small>
              {item.blocks.filter((block) => block.kind === "question").length}{" "}
              questions
            </small>
          </button>
        ))}
      </aside>
      <main className="builder-canvas">
        <div className="section-editor-heading">
          <label>
            Section title
            <input
              value={section.title}
              placeholder="Untitled section"
              onChange={(event) =>
                update((schema) => {
                  schema.sections.find((item) => item.id === section.id).title =
                    event.target.value;
                })
              }
            />
          </label>
          <label>
            Description
            <textarea
              rows="2"
              value={section.description || ""}
              placeholder="Optional introduction"
              onChange={(event) =>
                update((schema) => {
                  schema.sections.find(
                    (item) => item.id === section.id,
                  ).description = event.target.value;
                })
              }
            />
          </label>
          <div className="section-move">
            <button
              className="icon-button"
              disabled={draft.sections.indexOf(section) === 0}
              onClick={() =>
                update((schema) => {
                  const index = schema.sections.findIndex(
                    (item) => item.id === section.id,
                  );
                  schema.sections = move(schema.sections, index, -1);
                })
              }
            >
              <CaretUp size={15} />
            </button>
            <button
              className="icon-button"
              disabled={
                draft.sections.indexOf(section) === draft.sections.length - 1
              }
              onClick={() =>
                update((schema) => {
                  const index = schema.sections.findIndex(
                    (item) => item.id === section.id,
                  );
                  schema.sections = move(schema.sections, index, 1);
                })
              }
            >
              <CaretDown size={15} />
            </button>
            <button
              className="icon-button danger"
              disabled={draft.sections.length === 1}
              onClick={() => {
                if (confirm("Delete this section and every question in it?"))
                  update((schema) => {
                    schema.sections = schema.sections.filter(
                      (item) => item.id !== section.id,
                    );
                    setSectionId(schema.sections[0].id);
                  });
              }}
            >
              <Trash size={15} />
            </button>
          </div>
        </div>
        <div className="builder-blocks">
          {section.blocks.map((block, index) => (
            <article
              key={block.id}
              className={`builder-block ${selected === block.id ? "is-selected" : ""}`}
              onClick={() => setSelected(block.id)}
            >
              <div className="builder-block-handle">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <button
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      update((schema) => {
                        const sec = schema.sections.find(
                          (item) => item.id === section.id,
                        );
                        sec.blocks = move(sec.blocks, index, -1);
                      });
                    }}
                  >
                    <CaretUp size={13} />
                  </button>
                  <button
                    aria-label="Move down"
                    disabled={index === section.blocks.length - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      update((schema) => {
                        const sec = schema.sections.find(
                          (item) => item.id === section.id,
                        );
                        sec.blocks = move(sec.blocks, index, 1);
                      });
                    }}
                  >
                    <CaretDown size={13} />
                  </button>
                </div>
              </div>
              {block.kind === "question" ? (
                <QuestionEditor
                  question={block}
                  update={(change) =>
                    update((schema) =>
                      change(
                        schema.sections
                          .find((item) => item.id === section.id)
                          .blocks.find((item) => item.id === block.id),
                      ),
                    )
                  }
                  duplicate={() => {
                    const copy = clone(block);
                    copy.id = makeId("q");
                    copy.label += " copy";
                    update((schema) =>
                      schema.sections
                        .find((item) => item.id === section.id)
                        .blocks.splice(index + 1, 0, copy),
                    );
                    setSelected(copy.id);
                  }}
                  remove={() => deleteBlock(block)}
                />
              ) : (
                <ContentEditor
                  block={block}
                  update={(change) =>
                    update((schema) =>
                      change(
                        schema.sections
                          .find((item) => item.id === section.id)
                          .blocks.find((item) => item.id === block.id),
                      ),
                    )
                  }
                  remove={() => deleteBlock(block)}
                />
              )}
            </article>
          ))}
        </div>
        <AddBlockMenu addQuestion={addQuestion} addContent={addContent} />
      </main>
      <aside className="builder-inspector">
        {selectedBlock ? (
          <Inspector
            block={selectedBlock}
            update={(change) =>
              update((schema) =>
                change(
                  schema.sections
                    .find((item) => item.id === section.id)
                    .blocks.find((item) => item.id === selectedBlock.id),
                ),
              )
            }
          />
        ) : (
          <div className="inspector-empty">
            <Gear size={24} />
            <b>Select a block</b>
            <span>Relevant settings appear here.</span>
          </div>
        )}
      </aside>
    </div>
  );
}

function QuestionEditor({ question, update, duplicate, remove }) {
  return (
    <div className="question-editor">
      <div className="question-editor-main">
        <input
          className="question-title-input"
          value={question.label}
          onChange={(e) =>
            update((q) => {
              q.label = e.target.value;
            })
          }
        />
        <textarea
          rows="2"
          placeholder="Description or help text (optional)"
          value={question.description || ""}
          onChange={(e) =>
            update((q) => {
              q.description = e.target.value;
            })
          }
        />
      </div>
      <div className="question-editor-footer">
        <select
          value={question.type}
          onChange={(e) =>
            update((q) => {
              const next = {...createQuestion(e.target.value),
                id: q.id,
                label: q.label,
                description: q.description,
                required: q.required,
              };
              for (const key of Object.keys(q)) delete q[key];
              Object.assign(q, next);
            })
          }
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <label className="compact-toggle">
          <input
            type="checkbox"
            checked={!!question.required}
            onChange={(e) =>
              update((q) => {
                q.required = e.target.checked;
              })
            }
          />
          <span>Required</span>
        </label>
        <button
          className="icon-button"
          title="Duplicate question"
          onClick={duplicate}
        >
          <Copy size={15} />
        </button>
        <button
          className="icon-button danger"
          title="Delete question"
          onClick={remove}
        >
          <Trash size={15} />
        </button>
      </div>
      {question.options && (
        <OptionsEditor question={question} update={update} />
      )}{" "}
      {question.rows && <GridEditor question={question} update={update} />}
    </div>
  );
}
function OptionsEditor({ question, update }) {
  return (
    <div className="option-editor">
      {question.options.map((option, index) => (
        <div key={option.id}>
          <span>{index + 1}</span>
          <input
            value={option.label}
            onChange={(e) =>
              update((q) => {
                q.options[index].label = e.target.value;
              })
            }
          />
          <button
            aria-label="Remove option"
            disabled={question.options.length === 1}
            onClick={() => update((q) => q.options.splice(index, 1))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="option-add"
        onClick={() =>
          update((q) =>
            q.options.push({
              id: makeId("opt"),
              label: `Option ${q.options.length + 1}`,
              description: "",
            }),
          )
        }
      >
        <Plus size={13} />
        Add option
      </button>
    </div>
  );
}
function GridEditor({ question, update }) {
  return (
    <div className="grid-editor">
      <section>
        <b>Rows</b>
        {question.rows.map((item, index) => (
          <div key={item.id}>
            <input
              value={item.label}
              onChange={(e) =>
                update((q) => {
                  q.rows[index].label = e.target.value;
                })
              }
            />
            <button
              disabled={question.rows.length === 1}
              onClick={() => update((q) => q.rows.splice(index, 1))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            update((q) =>
              q.rows.push({
                id: makeId("row"),
                label: `Row ${q.rows.length + 1}`,
              }),
            )
          }
        >
          + Add row
        </button>
      </section>
      <section>
        <b>Columns</b>
        {question.columns.map((item, index) => (
          <div key={item.id}>
            <input
              value={item.label}
              onChange={(e) =>
                update((q) => {
                  q.columns[index].label = e.target.value;
                })
              }
            />
            <button
              disabled={question.columns.length === 1}
              onClick={() => update((q) => q.columns.splice(index, 1))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            update((q) =>
              q.columns.push({
                id: makeId("col"),
                label: `Column ${q.columns.length + 1}`,
              }),
            )
          }
        >
          + Add column
        </button>
      </section>
    </div>
  );
}
function ContentEditor({ block, update, remove }) {
  return (
    <div className="content-editor">
      <span>{block.kind.replace("_", " ")}</span>
      {block.kind !== "divider" && (
        <textarea
          rows={block.kind === "paragraph" ? 4 : 2}
          value={block.text || ""}
          onChange={(e) =>
            update((item) => {
              item.text = e.target.value;
            })
          }
        />
      )}{" "}
      {block.kind === "image" && (
        <>
          <input
            type="url"
            placeholder="Image URL"
            value={block.url || ""}
            onChange={(e) =>
              update((item) => {
                item.url = e.target.value;
              })
            }
          />
          <input
            placeholder="Alt text"
            value={block.alt || ""}
            onChange={(e) =>
              update((item) => {
                item.alt = e.target.value;
              })
            }
          />
        </>
      )}
      <button className="icon-button danger" onClick={remove}>
        <Trash size={15} />
      </button>
    </div>
  );
}
function AddBlockMenu({ addQuestion, addContent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-block">
      <button className="pp-btn" onClick={() => setOpen(!open)}>
        <Plus size={14} />
        Add block
      </button>
      {open && (
        <div className="add-block-menu">
          <section>
            <b>Questions</b>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                onClick={() => {
                  addQuestion(type);
                  setOpen(false);
                }}
              >
                {label}
              </button>
            ))}
          </section>
          <section>
            <b>Content</b>
            {[
              "heading",
              "subheading",
              "paragraph",
              "callout",
              "image",
              "divider",
            ].map((kind) => (
              <button
                key={kind}
                onClick={() => {
                  addContent(kind);
                  setOpen(false);
                }}
              >
                {kind}
              </button>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
function Inspector({ block, update }) {
  if (block.kind !== "question")
    return (
      <div className="inspector-fields">
        <p className="builder-panel-label">CONTENT SETTINGS</p>
        {block.kind === "image" && (
          <label>
            Image alt text
            <input
              value={block.alt || ""}
              onChange={(e) =>
                update((item) => {
                  item.alt = e.target.value;
                })
              }
            />
          </label>
        )}
      </div>
    );
  const validation = block.validation || {};
  return (
    <div className="inspector-fields">
      <p className="builder-panel-label">QUESTION SETTINGS</p>
      {["short_text", "long_text", "email", "phone", "url", "number"].includes(
        block.type,
      ) && (
        <label>
          Placeholder
          <input
            value={block.placeholder || ""}
            onChange={(e) =>
              update((q) => {
                q.placeholder = e.target.value;
              })
            }
          />
        </label>
      )}
      {["short_text", "long_text"].includes(block.type) && (
        <>
          <label>
            Minimum length
            <input
              type="number"
              min="0"
              value={validation.minLength ?? ""}
              onChange={(e) =>
                update((q) => {
                  q.validation = {
                    ...q.validation,
                    minLength:
                      e.target.value === "" ? null : Number(e.target.value),
                  };
                })
              }
            />
          </label>
          <label>
            Maximum length
            <input
              type="number"
              min="1"
              value={validation.maxLength ?? ""}
              onChange={(e) =>
                update((q) => {
                  q.validation = {
                    ...q.validation,
                    maxLength:
                      e.target.value === "" ? null : Number(e.target.value),
                  };
                })
              }
            />
          </label>
        </>
      )}
      {block.type === "number" && (
        <>
          <label>
            Minimum
            <input
              type="number"
              value={validation.min ?? ""}
              onChange={(e) =>
                update((q) => {
                  q.validation = {
                    ...q.validation,
                    min: e.target.value === "" ? null : Number(e.target.value),
                  };
                })
              }
            />
          </label>
          <label>
            Maximum
            <input
              type="number"
              value={validation.max ?? ""}
              onChange={(e) =>
                update((q) => {
                  q.validation = {
                    ...q.validation,
                    max: e.target.value === "" ? null : Number(e.target.value),
                  };
                })
              }
            />
          </label>
        </>
      )}
      {["single_choice", "multi_choice", "dropdown", "multiselect"].includes(
        block.type,
      ) && (
        <label>
          <span>Allow an Other answer</span>
          <input
            type="checkbox"
            checked={!!block.allowOther}
            onChange={(e) =>
              update((q) => {
                q.allowOther = e.target.checked;
              })
            }
          />
        </label>
      )}
      {["rating", "scale"].includes(block.type) && (
        <>
          <label>
            Scale starts
            <input
              type="number"
              min="0"
              max="10"
              value={block.min ?? 1}
              onChange={(e) =>
                update((q) => {
                  q.min = Number(e.target.value);
                })
              }
            />
          </label>
          <label>
            Scale ends
            <input
              type="number"
              min="2"
              max="10"
              value={block.max ?? 5}
              onChange={(e) =>
                update((q) => {
                  q.max = Number(e.target.value);
                })
              }
            />
          </label>
        </>
      )}
      {block.type === "file" && (
        <>
          <label>
            Maximum files
            <input
              type="number"
              min="1"
              max="5"
              value={block.maxFiles || 1}
              onChange={(e) =>
                update((q) => {
                  q.maxFiles = Number(e.target.value);
                })
              }
            />
          </label>
          <label>
            Maximum MB per file
            <input
              type="number"
              min="1"
              max="20"
              value={block.maxSizeMb || 10}
              onChange={(e) =>
                update((q) => {
                  q.maxSizeMb = Number(e.target.value);
                })
              }
            />
          </label>
        </>
      )}
      <label>
        Internal field ID<code>{block.id}</code>
      </label>
    </div>
  );
}

function Integrity({ schema }) {
  const result = validateSchema(schema);
  return (
    <section
      className={`integrity-panel ${result.valid ? "valid" : "invalid"}`}
    >
      <div>
        {result.valid ? <Check size={18} /> : <Warning size={18} />}
        <span>
          <b>{result.valid ? "Ready to publish" : "Publishing is blocked"}</b>
          <small>
            {result.valid
              ? "Stable IDs and rule references passed integrity checks."
              : `${result.errors.length} issue${result.errors.length === 1 ? "" : "s"} must be resolved.`}
          </small>
        </span>
      </div>
      {[...result.errors, ...result.warnings].map((message, index) => (
        <p key={index}>{message}</p>
      ))}
    </section>
  );
}

function SettingsEditor({ draft, update, slug, setSlug, form, versions, setStatus }) {
  const s = draft.settings,
    [uploading, setUploading] = useState(false),
    toast = useToast();
  async function cover(file) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFormCover(
        form.id,
        file,
        draft.coverImage?.alt || "",
      );
      update((x) => {
        x.coverImage = { assetId: result.assetId, alt: result.alt || "" };
      });
      toast("Cover image uploaded");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="settings-workspace">
      <section>
        <p className="page-eyebrow">GENERAL</p>
        <h2>Public identity</h2>
        <div className="settings-grid">
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) =>
                update((x) => {
                  x.title = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Share link" hint="Private, unguessable address generated for this form.">
            <input readOnly value={form.shareCode ? formPublicUrl(form.shareCode) : "Available after the share-code migration"} onFocus={(event) => event.currentTarget.select()} />
          </Field>
          <Field label="Subtitle">
            <input
              value={draft.subtitle || ""}
              onChange={(e) =>
                update((x) => {
                  x.subtitle = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Description" wide>
            <textarea
              rows="4"
              value={draft.description || ""}
              onChange={(e) =>
                update((x) => {
                  x.description = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Cover image" wide>
            {draft.coverImage?.assetId && (
              <img
                className="settings-cover-preview"
                src={formAssetUrl(draft.coverImage.assetId)}
                alt={draft.coverImage.alt || ""}
              />
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(e) => cover(e.target.files?.[0])}
            />
            <input
              placeholder="Image description for accessibility"
              value={draft.coverImage?.alt || ""}
              onChange={(e) =>
                update((x) => {
                  x.coverImage = {
                    ...(x.coverImage || {}),
                    alt: e.target.value,
                  };
                })
              }
            />
            {draft.coverImage && (
              <button
                type="button"
                className="pp-btn"
                onClick={() =>
                  update((x) => {
                    x.coverImage = null;
                  })
                }
              >
                Remove cover
              </button>
            )}
          </Field>
        </div>
      </section>
      <section>
        <p className="page-eyebrow">ACCESS & AVAILABILITY</p>
        <h2>Who can respond</h2>
        <div className="settings-grid access-settings-grid">
          <Field label="Homepage visibility" hint="Link-only forms stay off the Forms homepage; share their unique URL directly with invitees.">
            <select value={s.visibility || "public"} onChange={(e) => update((x) => { x.settings.visibility = e.target.value; })}>
              <option value="public">Public — list on Forms home</option>
              <option value="link">Link-only — invite via unique link</option>
            </select>
          </Field>
          <Field label="Access">
            <select
              value={s.requiresAuth ? "authenticated" : "public"}
              onChange={(e) =>
                update((x) => {
                  x.settings.requiresAuth = e.target.value === "authenticated";
                })
              }
            >
              <option value="public">Anyone with the link</option>
              <option value="authenticated">Karamah account required</option>
            </select>
          </Field>
          <Field label="Identity">
            <select
              value={s.collectIdentity ? "collect" : "anonymous"}
              onChange={(e) =>
                update((x) => {
                  x.settings.collectIdentity = e.target.value === "collect";
                })
              }
            >
              <option value="anonymous">Do not record identity</option>
              <option value="collect">Record verified identity</option>
            </select>
          </Field>
          <Field label="Opens at">
            <input
              type="datetime-local"
              value={s.opensAt?.slice(0, 16) || ""}
              onChange={(e) =>
                update((x) => {
                  x.settings.opensAt = e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null;
                })
              }
            />
          </Field>
          <Field label="Closes at">
            <input
              type="datetime-local"
              value={s.closesAt?.slice(0, 16) || ""}
              onChange={(e) =>
                update((x) => {
                  x.settings.closesAt = e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null;
                })
              }
            />
          </Field>
          <Field label="Global response limit">
            <input
              type="number"
              min="1"
              value={s.responseLimit ?? ""}
              placeholder="Unlimited"
              onChange={(e) =>
                update((x) => {
                  x.settings.responseLimit = e.target.value
                    ? Number(e.target.value)
                    : null;
                })
              }
            />
          </Field>
          <Field
            label="Per-user limit"
            hint="Applies to signed-in respondents."
          >
            <input
              type="number"
              min="1"
              value={s.perUserLimit ?? ""}
              placeholder="Unlimited"
              onChange={(e) =>
                update((x) => {
                  x.settings.perUserLimit = e.target.value
                    ? Number(e.target.value)
                    : null;
                })
              }
            />
          </Field>
        </div>
      </section>
      <section>
        <p className="page-eyebrow">PRESENTATION & COMPLETION</p>
        <h2>Respondent experience</h2>
        <div className="settings-grid">
          <Field label="Progress">
            <select
              value={s.progress}
              onChange={(e) =>
                update((x) => {
                  x.settings.progress = e.target.value;
                })
              }
            >
              <option value="bar">Progress bar</option>
              <option value="page">Page number</option>
              <option value="none">None</option>
            </select>
          </Field>
          <Field label="Question numbering">
            <select
              value={s.questionNumbers ? "yes" : "no"}
              onChange={(e) =>
                update((x) => {
                  x.settings.questionNumbers = e.target.value === "yes";
                })
              }
            >
              <option value="yes">Show numbers</option>
              <option value="no">Hide numbers</option>
            </select>
          </Field>
          <Field label="Confirmation message" wide>
            <textarea
              rows="3"
              value={draft.confirmationMessage || ""}
              onChange={(e) =>
                update((x) => {
                  x.confirmationMessage = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Closed message" wide>
            <textarea
              rows="3"
              value={draft.closedMessage || ""}
              onChange={(e) =>
                update((x) => {
                  x.closedMessage = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Safe redirect URL" wide>
            <input
              type="url"
              value={s.redirectUrl || ""}
              placeholder="https://"
              onChange={(e) =>
                update((x) => {
                  x.settings.redirectUrl = e.target.value;
                })
              }
            />
          </Field>
        </div>
      </section>
      <section className="settings-danger">
        <p className="page-eyebrow">LIFECYCLE</p>
        <h2>Response state</h2>
        <p>
          Closing stops new submissions without changing the published version
          or deleting responses.
        </p>
        <div>
          {form.status === "published" && (
            <button className="pp-btn" onClick={() => setStatus("closed")}>
              Close responses
            </button>
          )}
          {form.status === "closed" && (
            <button
              className="pp-btn pp-btn-primary"
              onClick={() => setStatus("published")}
            >
              Reopen responses
            </button>
          )}
          <button
            className="pp-btn"
            onClick={() =>
              setStatus(form.status === "archived" ? "draft" : "archived")
            }
          >
            {form.status === "archived" ? "Unarchive" : "Archive form"}
          </button>
        </div>
      </section>
      <VersionHistory formId={form.id} versions={versions} activeVersionId={form.activeVersionId} />
    </div>
  );
}

function VersionHistory({ formId, versions, activeVersionId }) {
  const [selectedId, setSelectedId] = useState(activeVersionId || versions[0]?.id || "");
  const version = useFormVersion(formId, selectedId);
  const snapshot = version.data?.version?.schema;
  const questions = snapshot?.sections?.flatMap(section => section.blocks || []).filter(block => block.kind === "question") || [];
  return <section className="version-history">
    <p className="page-eyebrow">VERSION HISTORY</p><h2>Published snapshots</h2><p>Published versions are preserved with every response. Inspecting one never changes your draft.</p>
    {!versions.length ? <div className="version-history-empty">Publish this form to create its first immutable snapshot.</div> : <div className="version-history-layout">
      <div className="version-history-list" aria-label="Published form versions">{versions.map(item => <button type="button" key={item.id} className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><strong>Version {item.number}</strong><span>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "Published date unavailable"}</span>{item.id === activeVersionId && <em>Live</em>}</button>)}</div>
      <div className="version-snapshot" aria-live="polite">{version.isLoading && <p>Loading this snapshot…</p>}{version.error && <p className="version-snapshot-error">This version could not be loaded. Try another snapshot.</p>}{snapshot && <><span>Version {version.data.version.number}</span><h3>{snapshot.title}</h3>{snapshot.description && <p>{snapshot.description}</p>}<dl><div><dt>Sections</dt><dd>{snapshot.sections.length}</dd></div><div><dt>Questions</dt><dd>{questions.length}</dd></div><div><dt>Logic rules</dt><dd>{snapshot.rules?.length || 0}</dd></div></dl><ol>{questions.map(question => <li key={question.id}><b>{question.label || "Untitled question"}</b><span>{TYPE_LABELS[question.type] || question.type}{question.required ? " · Required" : ""}</span></li>)}</ol></>}</div>
    </div>}
  </section>;
}
function Field({ label, hint, wide, children }) {
  return (
    <label className={wide ? "wide" : ""}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}


function Responses({ formId, schema }) {
  const query = useFormSubmissions(formId),
    remove = useDeleteSubmission(),
    toast = useToast(),
    questions = schema.sections
      .flatMap((s) => s.blocks || [])
      .filter((b) => b.kind === "question");
  async function download() {
    const data = await exportFormResponses(formId),
      blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = data.filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (query.isLoading)
    return (
      <div className="forms-editor-loading">
        <span></span>
        <span></span>
      </div>
    );
  const submissions = query.data?.submissions || [];
  return (
    <div className="responses-workspace">
      <header>
        <div>
          <p className="page-eyebrow">RESPONSE LEDGER</p>
          <h2>
            {submissions.length} response{submissions.length === 1 ? "" : "s"}
          </h2>
          <p>
            Every answer stays attached to the published version the respondent
            saw.
          </p>
        </div>
        <button
          className="pp-btn"
          disabled={!submissions.length}
          onClick={download}
        >
          <DownloadSimple size={15} />
          Export CSV
        </button>
      </header>
      {!submissions.length ? (
        <div className="forms-empty compact">
          <span>
            <UsersThree size={28} />
          </span>
          <h2>No responses yet</h2>
          <p>Publish and share this form. New submissions will appear here.</p>
        </div>
      ) : <div className="response-cards">{submissions.map((s) => <details className="response-card" key={s.id}>
        <summary><span><b>{s.respondentEmail || "Anonymous response"}</b><small>{new Date(s.submittedAt).toLocaleString()} · Version {s.version}</small></span><span className="response-card-count">{questions.filter(q => s.answers[q.id] != null && s.answers[q.id] !== "").length} answers</span></summary>
        <div className="response-card-body"><dl>{questions.map(q => <div key={q.id}><dt>{q.label}</dt><dd>{formatAnswer(s.answers[q.id], q)}</dd></div>)}</dl><button className="icon-button danger" aria-label="Delete response" onClick={async () => { if (confirm("Delete this response and its uploaded files?")) { await remove.mutateAsync({ id: formId, submissionId: s.id }); toast("Response deleted"); } }}><Trash size={14} /></button></div>
      </details>)}</div>}
    </div>
  );
}
function formatAnswer(value, question) {
  if (value == null || value === "") return "—";
  if (Array.isArray(value))
    return value
      .map(
        (item) => question.options?.find((o) => o.id === item)?.label || item,
      )
      .join(", ");
  if (typeof value === "object") return Object.values(value).flat().join(", ");
  return question.options?.find((o) => o.id === value)?.label || String(value);
}
function Analytics({ formId }) {
  const query = useFormAnalytics(formId);
  if (query.isLoading)
    return (
      <div className="forms-editor-loading">
        <span></span>
        <span></span>
      </div>
    );
  const data = query.data;
  if (!data?.total)
    return (
      <div className="forms-empty">
        <span>
          <ChartBar size={32} />
        </span>
        <h2>Analytics begin with the first response</h2>
        <p>Charts use persisted answers only; no sample data is invented.</p>
      </div>
    );
  const max = Math.max(...data.trend.map((item) => item.count), 1);
  return (
    <div className="analytics-workspace">
      <header>
        <p className="page-eyebrow">LIVE RESPONSE HEALTH</p>
        <h2>Response overview</h2>
      </header>
      <div className="analytics-metrics">
        <div>
          <strong>{data.total}</strong>
          <span>Total responses</span>
        </div>
        <div>
          <strong>
            {data.firstAt ? new Date(data.firstAt).toLocaleDateString() : "—"}
          </strong>
          <span>First response</span>
        </div>
        <div>
          <strong>
            {data.lastAt ? new Date(data.lastAt).toLocaleDateString() : "—"}
          </strong>
          <span>Latest response</span>
        </div>
      </div>
      <section className="trend-panel">
        <h3>Response trend</h3>
        <div className="trend-bars">
          {data.trend.map((item) => (
            <div key={item.day} title={`${item.day}: ${item.count}`}>
              <i
                style={{ height: `${Math.max(8, (item.count / max) * 100)}%` }}
              ></i>
              <span>{item.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="question-analytics">
        {data.questions.map((q) => (
          <section key={q.label}>
            <header>
              <span>{TYPE_LABELS[q.type] || q.type}</span>
              <h3>{q.label}</h3>
              <small>{q.responses} answered</small>
            </header>
            <div>
              {Object.entries(q.values)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([value, count]) => (
                  <div className="answer-bar" key={value}>
                    <span>{value}</span>
                    <i>
                      <b
                        style={{ width: `${(count / q.responses) * 100}%` }}
                      ></b>
                    </i>
                    <em>{count}</em>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
import LogicEditor from '../components/FormLogicEditor.jsx';
