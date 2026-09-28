import { evaluateRules, validateAnswers } from "/forms-domain.mjs";
import {
  currentUser,
  getToken,
  resetPassword,
  signInEmail,
  signInProvider,
  signOutUser,
  watchAuth,
} from "/auth.js";

const app = document.querySelector("#app"),
  accountSlot = document.querySelector("#account-slot"),
  authDialog = document.querySelector("#auth-dialog"),
  accountDialog = document.querySelector("#account-dialog"),
  authError = document.querySelector("#auth-error");
const colorSchemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
function savedColorMode() {
  try {
    const saved = localStorage.getItem("kc-forms-theme");
    return saved === "dark" || saved === "light" ? saved : null;
  } catch {
    return null;
  }
}
function preferredColorMode() {
  return savedColorMode() || (colorSchemeQuery?.matches ? "dark" : "light");
}
function setColorMode(mode, persist = false) {
  const dark = mode === "dark";
  document.documentElement.dataset.colorMode = dark ? "dark" : "light";
  document.documentElement.dataset.theme = savedColorMode() || "system";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#151d19" : "#f2f1eb");
  document.querySelector("#theme-toggle")?.setAttribute("aria-label", dark ? "Use light mode" : "Use dark mode");
  if (persist) {
    try { localStorage.setItem("kc-forms-theme", dark ? "dark" : "light"); } catch {}
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
}
setColorMode(preferredColorMode());
colorSchemeQuery?.addEventListener?.("change", () => { if (!savedColorMode()) setColorMode(preferredColorMode()); });
document.querySelector("#theme-toggle")?.addEventListener("click", () => {
  setColorMode(document.documentElement.dataset.colorMode === "dark" ? "light" : "dark", true);
});
let previewSchema = (() => {
  const inline = document.querySelector('#forms-preview-data')?.textContent;
  const encoded = new URLSearchParams(location.search).get("schema");
  const hashEncoded = new URLSearchParams(location.hash.replace(/^#/, "")).get("schema");
  const decode = value => JSON.parse(decodeURIComponent(escape(atob(value))));
  try { return inline ? JSON.parse(inline) : encoded ? decode(encoded) : hashEncoded ? decode(hashEncoded) : null; } catch { return null; }
})();
const previewMode = new URLSearchParams(location.search).has('preview');
const route = (() => {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] === "f") return { code: parts[1] || "" };
  if (parts[0] === "forms") return { slug: parts[1] || "" };
  return {};
})();
const formQuery = () => route.code ? `code=${encodeURIComponent(route.code)}` : `slug=${encodeURIComponent(route.slug || "")}`;
let form = null,
  schema = null,
  answers = {},
  errors = {},
  page = 0,
  user = null,
  pending = false,
  uploading = 0,
  saveTimer = 0,
  questionNumber = 0,
  submissionKey = "",
  sectionMotion = "",
  hasRenderedForm = false;
const startupStartedAt = performance.now();
function finishStartup() {
  const screen = document.querySelector("#startup-screen");
  if (!screen || screen.classList.contains("is-closing")) return;
  window.setTimeout(() => {
    screen.classList.add("is-closing");
    screen.setAttribute("aria-hidden", "true");
    window.setTimeout(() => screen.remove(), 260);
  }, Math.max(0, 820 - (performance.now() - startupStartedAt)));
}
const storageKey = () => `karamah-form-draft:${form?.id}:${form?.versionId}`;
const browserId = (() => {
  try {
    const key = "karamah-forms-browser",
      saved = localStorage.getItem(key);
    if (saved) return saved;
    const value = crypto.randomUUID();
    localStorage.setItem(key, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
})();
const node = (tag, props = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "style") element.style.cssText = value;
    else if (key.startsWith("on"))
      element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null && value !== false)
      element.setAttribute(key, value === true ? "" : value);
  }
  for (const child of Array.isArray(children) ? children : [children])
    if (child != null)
      element.append(child.nodeType ? child : document.createTextNode(child));
  return element;
};
const clear = (element) => element.replaceChildren();
const coverStyle = (url, crop) => {
  const values = String(crop || "").split(",").map(Number);
  if (values.length < 4 || values.some(value => !Number.isFinite(value))) return `background-image:url(${JSON.stringify(url)});`;
  const x = Math.max(0, Math.min(100, values[0])), y = Math.max(0, Math.min(100, values[1]));
  const w = Math.max(1, Math.min(100 - x, values[2])), h = Math.max(1, Math.min(100 - y, values[3]));
  const px = w >= 99 ? 50 : Math.max(0, Math.min(100, x / (100 - w) * 100)), py = h >= 99 ? 50 : Math.max(0, Math.min(100, y / (100 - h) * 100));
  return `background-image:url(${JSON.stringify(url)});--cover-crop-size:${10000 / w}% ${10000 / h}%;--cover-crop-x:${px}%;--cover-crop-y:${py}%;`;
};
function descriptionNode(description) {
  if (description.length <= 700) return node("p", { class: "form-description", text: description });
  return node("div", { class: "form-description-expandable" }, [node("p", { class: "form-description", text: `${description.slice(0, 700).trimEnd()}…` }), node("details", {}, [node("summary", { text: "Read full description" }), node("div", { class: "form-description-full" }, [node("p", { text: description })])])]);
}

function renderAccount() {
  clear(accountSlot);
  if (previewMode || previewSchema) {
    accountSlot.append(node("span", { class: "preview-badge", text: "Preview" }));
    return;
  }
  const button = node(
    "button",
    {
      class: "account-button",
      type: "button",
      onClick: () => (user ? openAccountDialog() : openAuthDialog(false)),
    },
    [
      node("span", { class: "account-dot" }),
      document.createTextNode(
        user ? user.displayName || user.email || "Signed in" : "Sign in",
      ),
    ],
  );
  accountSlot.append(button);
}

function showDialog(dialog) {
  if (!dialog) return;
  dialog.classList.remove("is-closing");
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  window.setTimeout(() => {
    dialog.classList.remove("is-closing");
    dialog.close();
  }, 220);
}

function openAuthDialog(required = false) {
  if (!authDialog) return;
  const eyebrow = authDialog.querySelector("[data-auth-eyebrow]");
  const title = authDialog.querySelector("[data-auth-title]");
  const copy = authDialog.querySelector("[data-auth-copy]");
  if (eyebrow) eyebrow.textContent = required ? "IDENTITY REQUIRED" : "SIGN IN";
  if (title) title.textContent = required ? "Sign in to continue" : "Sign in";
  if (copy) copy.textContent = required
    ? "This form uses your Karamah Collective account to manage response limits. Your identity is recorded only when the form says so."
    : "Use your Karamah Collective account to continue. Your identity is recorded only when a form says so.";
  setAuthMessage("");
  showDialog(authDialog);
}

function openAccountDialog() {
  if (!accountDialog || !user) return;
  const email = accountDialog.querySelector("[data-account-email]");
  if (email) email.textContent = user.email || user.displayName || "You are signed in.";
  showDialog(accountDialog);
}

watchAuth((next) => {
  user = next;
  renderAccount();
  if (schema?.settings?.requiresAuth) render();
});
document
  .querySelector("[data-close-auth]")
  ?.addEventListener("click", () => closeDialog(authDialog));
document
  .querySelectorAll("[data-close-account]")
  .forEach((button) => button.addEventListener("click", () => closeDialog(accountDialog)));
document
  .querySelector("[data-account-signout]")
  ?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await signOutUser();
      closeDialog(accountDialog);
    } finally {
      event.currentTarget.disabled = false;
    }
  });
for (const dialog of [authDialog, accountDialog]) {
  let pointerOrigin = null;
  dialog?.addEventListener("pointerdown", (event) => {
    pointerOrigin = event.target;
  });
  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog?.addEventListener("click", (event) => {
    // A drag that begins on dialog copy can finish on the backdrop and produce
    // a click whose target is the dialog. Keep the dialog open in that case,
    // so users can safely select and copy text such as an auth error.
    const selection = window.getSelection();
    if (event.target === dialog && pointerOrigin === dialog && selection?.isCollapsed) closeDialog(dialog);
    pointerOrigin = null;
  });
}
const privacyOverlay = document.querySelector("#privacy-overlay");
async function openPrivacy() {
  if (!privacyOverlay) return;
  if (!privacyOverlay.dataset.loaded) {
    const response = await fetch("/content/privacy.html");
    if (response.ok) privacyOverlay.insertAdjacentHTML("beforeend", await response.text());
    privacyOverlay.dataset.loaded = "true";
  }
  privacyOverlay.classList.add("is-open"); privacyOverlay.setAttribute("aria-hidden", "false");
}
function closePrivacy() { privacyOverlay?.classList.remove("is-open"); privacyOverlay?.setAttribute("aria-hidden", "true"); }
document.querySelectorAll("[data-open-privacy]").forEach(button => button.addEventListener("click", openPrivacy));
privacyOverlay?.addEventListener("click", event => { if (event.target.closest("[data-close-privacy]")) closePrivacy(); });
window.addEventListener("keydown", event => { if (event.key === "Escape") closePrivacy(); });
let emailMode = "signin";
function setAuthMessage(message = "", kind = "error") {
  authError.textContent = message;
  authError.classList.toggle("is-success", kind === "success");
}
document.querySelectorAll("[data-email-mode]").forEach(button => button.addEventListener("click", () => {
  emailMode = button.dataset.emailMode;
  setAuthMessage("");
  document.querySelectorAll("[data-email-mode]").forEach(item => item.classList.toggle("active", item === button));
  const password = document.querySelector("#email-auth input[name=password]");
  if (password) password.autocomplete = emailMode === "signup" ? "new-password" : "current-password";
  const submit = document.querySelector("#email-auth button[type=submit]");
  if (submit) submit.textContent = emailMode === "signup" ? "Create account" : "Sign in with email";
  document.querySelector("[data-reset-password]")?.classList.toggle("hide", emailMode !== "signin");
}));
document.querySelectorAll("[data-provider]").forEach((button) =>
  button.addEventListener("click", async () => {
    setAuthMessage("");
    button.disabled = true;
    try {
      await signInProvider(button.dataset.provider);
      authDialog.close();
    } catch (error) {
      setAuthMessage(friendlyAuthError(error));
    } finally {
      button.disabled = false;
    }
  }),
);
document
  .querySelector("#email-auth")
  ?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("");
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    const data = new FormData(event.currentTarget);
    try {
      await signInEmail(data.get("email"), data.get("password"), emailMode === "signup");
      authDialog.close();
    } catch (error) {
      setAuthMessage(friendlyAuthError(error));
    } finally {
      submit.disabled = false;
    }
  });
document
  .querySelector("[data-reset-password]")
  ?.addEventListener("click", async (event) => {
    setAuthMessage("");
    const form = document.querySelector("#email-auth");
    const email = form?.elements?.email?.value?.trim();
    if (!email) {
      setAuthMessage("Enter your email address first, then request a reset link.");
      form?.elements?.email?.focus();
      return;
    }
    event.currentTarget.disabled = true;
    try {
      await resetPassword(email);
      setAuthMessage("If an account exists for that email, a reset link is on its way.", "success");
    } catch (error) {
      setAuthMessage(friendlyAuthError(error));
    } finally {
      event.currentTarget.disabled = false;
    }
  });
function friendlyAuthError(error) {
  const code = error?.code ? ` (${error.code})` : "";
  return error?.code === "auth/popup-closed-by-user"
    ? "The sign-in window was closed."
    : error?.code === "auth/unauthorized-domain"
      ? `This domain is not authorized in Firebase Authentication${code}.`
      : error?.code === "auth/operation-not-allowed"
        ? `This sign-in provider is not enabled in Firebase Authentication${code}.`
        : error?.code === "auth/api-key-not-valid" || error?.code === "auth/invalid-api-key"
          ? `Firebase rejected the API key. Check Google Cloud API key restrictions for this domain${code}.`
          : error?.code === "auth/configuration-not-found"
            ? `Firebase Authentication is not configured for this project or provider${code}.`
            : error?.code === "auth/internal-error"
              ? `Firebase could not complete this sign-in. Check that this provider is enabled, its OAuth settings are valid, and this domain is authorized${code}.`
    : error?.code === "auth/weak-password"
      ? "Use a password with at least 6 characters."
      : error?.code === "auth/verification-sent"
        ? "Account created. Open the verification email we sent, then sign in here."
      : error?.code === "auth/account-exists-with-different-credential"
        ? "This email already has a Karamah account. Sign in with its existing method, then Facebook will be connected."
        : `Sign-in did not work. Check your details and try again${code}.`;
}

function stateView(title, message, kind = "info", action = null) {
  clear(app);
  const shell = node(
    "section",
    { class: `state-shell ${kind}`, "aria-live": "polite" },
    [
      node("div", {
        class: "state-mark",
        text: kind === "success" ? "✓" : kind === "error" ? "!" : "·",
      }),
      node("p", { class: "eyebrow", text: "KARAMAH FORMS" }),
      node("h1", { text: title }),
      node("p", { text: message }),
    ],
  );
  if (action)
    shell.append(
      node("button", {
        class: "btn primary",
        type: "button",
        onClick: action.onClick,
        text: action.label,
      }),
    );
  app.append(shell);
  app.focus();
}

async function load() {
  if (previewSchema) {
    schema = previewSchema;
    form = {id:'preview',versionId:'preview'};
    render();
    finishStartup();
    return;
  }
  if (previewMode) return;
  if (!route.code && !route.slug) {
    await renderHome();
    finishStartup();
    return;
  }
  try {
    const response = await fetch(`/api/form?${formQuery()}`),
      data = await response.json();
    if (!response.ok) {
      stateView(
        data.state === "closed" ? "Responses are closed" : "Form not found",
        data.error || "This form is not available.",
        "error",
      );
      return;
    }
    form = data;
    schema = data.schema;
    document.title = `${schema.title} — Karamah Collective Forms`;
    try {
      answers = JSON.parse(localStorage.getItem(storageKey())) || {};
      submissionKey =
        sessionStorage.getItem(`${storageKey()}:submission`) || "";
    } catch {
      answers = {};
    }
    if (data.status.state !== "open") {
      stateView(
        data.status.state === "not_open"
          ? "This form opens soon"
          : "Responses are closed",
        data.status.message,
        "info",
      );
      return;
    }
    render();
  } catch {
    stateView(
      "We could not load this form",
      "Check your connection and try again.",
      "error",
      { label: "Try again", onClick: load },
    );
  } finally {
    finishStartup();
  }
}

async function renderHome() {
  clear(app);
  const shell = node("section", { class: "forms-home" }, [
    node("div", { class: "home-intro" }, [node("h1", { text: "Community forms, open to you." })]),
    node("section", { class: "public-forms", "aria-live": "polite" }, [node("p", { class: "eyebrow", text: "OPEN FORMS" }), node("h2", { text: "Take part" }), node("p", { class: "home-loading", text: "Finding available forms…" })]),
  ]);
  app.append(shell);
  try {
    const response = await fetch("/api/forms"), data = await response.json();
    const area = shell.querySelector(".public-forms"); clear(area);
    area.append(node("p", { class: "eyebrow", text: "OPEN FORMS" }), node("h2", { text: "Take part" }));
    const forms = data.forms || [];
    if (!response.ok || !forms.length) {
      area.append(node("p", { class: "home-empty", text: "There are no public forms open right now. Please check back soon." }));
      return;
    }
    const grid = node("div", { class: "public-form-grid" });
    forms.forEach(item => {
      const card = node("a", { class: "public-form-card", href: `/f/${encodeURIComponent(item.shareCode)}` });
      if (item.coverImage?.assetId) card.append(node("div", { class: "public-form-cover", role: "img", "aria-label": item.coverImage.alt || "", style: coverStyle(`/api/media?id=${encodeURIComponent(item.coverImage.assetId)}`, item.coverImage.crop) }));
      const copy = node("div", {}, [node("h3", { text: item.title }), item.subtitle ? node("p", { class: "card-subtitle", text: item.subtitle }) : null, item.description ? node("p", { text: item.description.slice(0, 180) }) : null, node("span", { text: "Open form →" })]);
      card.append(copy); grid.append(card);
    });
    area.append(grid);
  } catch {
    shell.querySelector(".home-loading").textContent = "Forms could not be loaded. Please try again shortly.";
  }
}

if (previewMode) {
  window.addEventListener("message", event => {
    const next = event.data?.type === "karamah-forms-preview" ? event.data.schema : null;
    if (!next || typeof next !== "object" || Array.isArray(next)) return;
    previewSchema = next;
    answers = {};
    errors = {};
    page = 0;
    form = { id: "preview", versionId: "preview" };
    schema = previewSchema;
    render();
    window.parent?.postMessage({ type: "karamah-forms-preview-applied" }, "*");
    finishStartup();
  });
  // The parent can now reliably send the schema even when its first message
  // raced the iframe module booting.
  window.parent?.postMessage({ type: "karamah-forms-preview-ready" }, "*");
}

function visibleSections() {
  const ruleState = evaluateRules(schema, answers);
  return schema.sections.filter(
    (section) => ruleState.path.includes(section.id),
  );
}
function persist() {
  if (previewSchema) return;
  clearTimeout(saveTimer);
  const note = document.querySelector(".draft-note");
  if (note) {
    note.textContent = "Saving progress…";
    note.classList.remove("is-saved");
  }
  saveTimer = setTimeout(() => {
    let saved = false;
    try {
      localStorage.setItem(storageKey(), JSON.stringify(answers));
      saved = true;
    } catch {}
    const current = document.querySelector(".draft-note");
    if (current) {
      current.textContent = saved ? "Progress saved on this device" : "Keep this tab open. Your browser could not save your progress.";
      current.classList.toggle("is-saved", saved);
    }
  }, 450);
}
function setAnswer(id, value) {
  const active = document.activeElement?.id === id,
    selection = active ? document.activeElement.selectionStart : null;
  answers[id] = value;
  const before = new Set(Object.keys(answers));
  const result = validateAnswers(schema, answers);
  answers = result.answers;
  persist();
  errors[id] = undefined;
  const changedVisibility = [...before].some((key) => !(key in answers));
  if (
    changedVisibility ||
    (schema.rules || []).some((rule) =>
      [...(rule.when?.all || []), ...(rule.when?.any || [])].some(
        (condition) => condition.questionId === id,
      ),
    )
  ) {
    render();
    if (active)
      requestAnimationFrame(() => {
        const input = document.getElementById(id);
        input?.focus();
        if (selection != null && input?.setSelectionRange && ['text','search','tel','url','password'].includes(input.type))
          input.setSelectionRange(selection, selection);
      });
  }
}

function questionHeader(question) {
  const label = node("label", {
    class: "question-label",
    id: `label-${question.id}`,
    for: question.id,
  });
  if (schema.settings.questionNumbers)
    label.append(
      node("span", { class: "question-number", text: `${++questionNumber}.` }),
    );
  label.append(document.createTextNode(question.label || "Untitled question"));
  if (evaluateRules(schema, answers).required[question.id])
    label.append(
      node("span", { class: "required", text: "*", title: "Required" }),
    );
  return [
    label,
    question.description
      ? node("p", { class: "question-help", text: question.description })
      : null,
  ];
}
function inputAttrs(question, type = "text") {
  const validation = question.validation || {};
  return {
    type,
    id: question.id,
    name: question.id,
    placeholder: question.placeholder || "",
    minlength: validation.minLength,
    maxlength: validation.maxLength,
    min: validation.min,
    max: validation.max,
    step: question.step,
    "aria-labelledby": `label-${question.id}`,
    "aria-describedby": errors[question.id] ? `error-${question.id}` : null,
  };
}
function answerError(question) {
  return errors[question.id]?.length
    ? node("p", {
        class: "field-error",
        id: `error-${question.id}`,
        role: "alert",
        text: errors[question.id][0],
      })
    : null;
}

function choiceInput(question, multiple = false) {
  const list = node("div", { class: "choice-list" }),
    current = answers[question.id];
  for (const option of question.options || []) {
    const input = node("input", {
      type: multiple ? "checkbox" : "radio",
      name: question.id,
      value: option.id,
      checked: multiple
        ? (current || []).includes(option.id)
        : current === option.id,
    });
    input.addEventListener("change", () => {
      if (!multiple) setAnswer(question.id, option.id);
      else {
        const next = new Set(answers[question.id] || []);
        input.checked ? next.add(option.id) : next.delete(option.id);
        setAnswer(question.id, [...next]);
      }
    });
    const copy = node("span", { text: option.label });
    if (option.description)
      copy.append(node("small", { text: option.description }));
    list.append(node("label", { class: "choice" }, [input, copy]));
  }
  if (question.allowOther) {
    const otherValue = multiple
      ? (current || []).find((item) => String(item).startsWith("other:"))
      : String(current || "").startsWith("other:")
        ? current
        : "";
    const toggle = node("input", {
      type: multiple ? "checkbox" : "radio",
      name: question.id,
      value: "other",
      checked: !!otherValue,
    });
    const text = node("input", {
      type: "text",
      placeholder: "Please specify",
      value: otherValue ? String(otherValue).slice(6) : "",
      "aria-label": "Other answer",
    });
    const commit = (value) => {
      const encoded = `other:${value}`;
      if (!multiple) setAnswer(question.id, encoded);
      else {
        const values = (answers[question.id] || []).filter(
          (item) => !String(item).startsWith("other:"),
        );
        setAnswer(question.id, [...values, encoded]);
      }
    };
    toggle.addEventListener("change", () =>
      toggle.checked
        ? commit(text.value)
        : multiple
          ? setAnswer(
              question.id,
              (answers[question.id] || []).filter(
                (item) => !String(item).startsWith("other:"),
              ),
            )
          : setAnswer(question.id, ""),
    );
    text.addEventListener("input", () => {
      toggle.checked = true;
      commit(text.value);
    });
    list.append(
      node("label", { class: "choice choice-other" }, [
        toggle,
        node("span", { text: "Other" }),
        text,
      ]),
    );
  }
  return list;
}
function matrixInput(question, multiple) {
  const table = node("table", { class: "matrix" }),
    head = node("tr");
  head.append(node("th", { text: "" }));
  for (const col of question.columns || [])
    head.append(node("th", { text: col.label }));
  table.append(node("thead", {}, head));
  const body = node("tbody");
  for (const row of question.rows || []) {
    const tr = node("tr");
    tr.append(node("th", { text: row.label }));
    for (const col of question.columns || []) {
      const current = answers[question.id]?.[row.id],
        input = node("input", {
          type: multiple ? "checkbox" : "radio",
          name: `${question.id}-${row.id}`,
          checked: multiple
            ? (current || []).includes(col.id)
            : current === col.id,
          "aria-label": `${row.label}: ${col.label}`,
        });
      input.addEventListener("change", () => {
        const next = { ...(answers[question.id] || {}) };
        if (!multiple) next[row.id] = col.id;
        else {
          const values = new Set(next[row.id] || []);
          input.checked ? values.add(col.id) : values.delete(col.id);
          next[row.id] = [...values];
        }
        setAnswer(question.id, next);
      });
      tr.append(node("td", {}, input));
    }
    body.append(tr);
  }
  table.append(body);
  return node("div", { class: "matrix-scroll" }, table);
}
async function upload(question, input, status) {
  const files = [...input.files].slice(0, question.maxFiles || 1),
    uploaded = [];
  if (previewSchema) {
    setAnswer(question.id, files.map((_, index) => `preview-file-${index}`));
    status.textContent = 'Preview only. No files were uploaded.';
    return;
  }
  uploading++;
  status.textContent = files.length ? "Uploading…" : "";
  input.disabled = true;
  try {
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/form?${formQuery()}&questionId=${encodeURIComponent(question.id)}`,
        { method: "POST", body, headers: { Authorization: `Bearer ${await getToken()}` } },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      uploaded.push(data.uploadToken);
    }
    setAnswer(question.id, uploaded);
    status.textContent = `${files.length} file${files.length === 1 ? "" : "s"} ready to submit.`;
  } catch (error) {
    status.textContent = error.message || "Upload failed. Try again.";
    input.value = "";
  } finally {
    uploading--;
    input.disabled = false;
  }
}
function questionControl(question) {
  const value = answers[question.id];
  if (["short_text", "email", "phone", "url"].includes(question.type)) {
    const type =
      question.type === "short_text"
        ? "text"
        : question.type === "phone"
          ? "tel"
          : question.type;
    const input = node("input", {
      ...inputAttrs(question, type),
      value: value ?? "",
    });
    input.addEventListener("input", (event) =>
      setAnswer(question.id, event.target.value),
    );
    return input;
  }
  if (question.type === "long_text") {
    const input = node("textarea", {
      ...inputAttrs(question),
      rows: 4,
      text: value ?? "",
    });
    input.addEventListener("input", (event) =>
      setAnswer(question.id, event.target.value),
    );
    return input;
  }
  if (question.type === "number") {
    const input = node("input", {
      ...inputAttrs(question, "number"),
      value: value ?? "",
    });
    input.addEventListener("input", (event) =>
      setAnswer(
        question.id,
        event.target.value === "" ? "" : Number(event.target.value),
      ),
    );
    return input;
  }
  if (["date", "time", "datetime"].includes(question.type)) {
    const input = node("input", {
      ...inputAttrs(
        question,
        question.type === "datetime" ? "datetime-local" : question.type,
      ),
      value: value ?? "",
    });
    input.addEventListener("change", (event) =>
      setAnswer(question.id, event.target.value),
    );
    return input;
  }
  if (["single_choice", "yes_no", "consent"].includes(question.type)) {
    if (question.type === "single_choice") return choiceInput(question);
    const options =
      question.type === "yes_no"
        ? [
            [true, "Yes"],
            [false, "No"],
          ]
        : [[true, question.consentLabel || "I agree"]];
    const list = node("div", { class: "choice-list" });
    for (const [choice, label] of options) {
      const input = node("input", {
        type: question.type === "consent" ? "checkbox" : "radio",
        name: question.id,
        checked: value === choice,
      });
      input.addEventListener("change", () => setAnswer(question.id, question.type === 'consent' ? input.checked : choice));
      list.append(
        node("label", { class: "choice" }, [
          input,
          node("span", { text: label }),
        ]),
      );
    }
    return list;
  }
  if (question.type === 'ranking') {
    const options = question.options || [];
    const order = Array.isArray(value) ? value : options.map(option => option.id);
    answers[question.id] = order;
    const list = node('ol', {class:'rank-list', 'aria-labelledby':`label-${question.id}`});
    order.forEach((id, index) => {
      const row = node('li', {class:'rank-row'}, [node('span', {text:`${index + 1}. ${options.find(option => option.id === id)?.label || ''}`})]);
      for (const [direction, label] of [[-1,'Move up'],[1,'Move down']]) {
        row.append(node('button', {type:'button', text:direction === -1 ? '↑' : '↓', 'aria-label':`${label}: ${options.find(option => option.id === id)?.label || ''}`, disabled:index + direction < 0 || index + direction >= order.length, onClick:() => {
          const next = [...order];
          [next[index],next[index + direction]] = [next[index + direction],next[index]];
          setAnswer(question.id,next);
          render();
        }}));
      }
      list.append(row);
    });
    return list;
  }
  if (["multi_choice", "multiselect"].includes(question.type))
    return choiceInput(question, true);
  if (question.type === "dropdown") {
    const other = typeof value === 'string' && value.startsWith('other:');
    const select = node(
      "select",
      { ...inputAttrs(question), "aria-labelledby": `label-${question.id}` },
      [node("option", { value: "", text: "Choose an option" })],
    );
    for (const option of question.options || [])
      select.append(
        node("option", {
          value: option.id,
          text: option.label,
          selected: value === option.id,
        }),
      );
    if (question.allowOther) select.append(node('option',{value:'other',text:'Other',selected:other}));
    select.addEventListener('change', event => {setAnswer(question.id, event.target.value === 'other' ? 'other:' : event.target.value); render();});
    const wrap = node('div',{},[select]);
    if (other) {
      const input = node('input',{type:'text',value:value.slice(6),placeholder:'Please specify','aria-label':`${question.label}: Other answer`});
      input.addEventListener('input', event=>setAnswer(question.id,`other:${event.target.value}`));
      wrap.append(input);
    }
    return wrap;
  }
  if (["rating", "scale"].includes(question.type)) {
    const wrap = node("div");
    const scale = node("div", { class: "scale" });
    for (
      let index = Number(question.min ?? 1);
      index <= Number(question.max ?? 5);
      index++
    ) {
      const input = node("input", {
        type: "radio",
        name: question.id,
        value: index,
        checked: value !== undefined && value !== '' && Number(value) === index,
        'aria-label': `${index} of ${question.max ?? 5}`,
      });
      input.addEventListener("change", () => setAnswer(question.id, index));
      scale.append(
        node("label", {}, [
          input,
          node("span", {
            text: String(question.type === "rating" ? "★" : index),
            title: String(index),
          }),
        ]),
      );
    }
    wrap.append(
      scale,
      node("div", { class: "scale-labels" }, [
        node("span", { text: question.minLabel || "" }),
        node("span", { text: question.maxLabel || "" }),
      ]),
    );
    return wrap;
  }
  if (["matrix", "checkbox_grid"].includes(question.type))
    return matrixInput(question, question.type === "checkbox_grid");
  if (question.type === "file") {
    const status = node("div", {
        class: "upload-status",
        "aria-live": "polite",
        text: value?.length
          ? `${value.length} file ready to submit.`
          : `Up to ${question.maxFiles || 1} file(s), ${question.maxSizeMb || 10} MB each.`,
      }),
      input = node("input", {
        type: "file",
        id: question.id,
        'aria-labelledby': `label-${question.id}`,
        multiple: (question.maxFiles || 1) > 1,
        accept: (question.allowedTypes || []).join(","),
      });
    input.addEventListener("change", () => upload(question, input, status));
    return node("div", { class: "upload-zone" }, [input, status]);
  }
  if (question.type === "address") {
    const fields = [
        ["street", "Street address"],
        ["city", "City"],
        ["postalCode", "Postal code"],
        ["country", "Country"],
      ],
      grid = node("div", { class: "address-grid" });
    for (const [key, label] of fields) {
      const input = node("input", { type: "text", value: value?.[key] || "" });
      input.addEventListener("input", (event) =>
        setAnswer(question.id, {
          ...(answers[question.id] || {}),
          [key]: event.target.value,
        }),
      );
      grid.append(node("label", {}, [document.createTextNode(label), input]));
    }
    return grid;
  }
  return node("input", {
    type: "text",
    value: value ?? "",
    onInput: (event) => setAnswer(question.id, event.target.value),
  });
}
function renderBlock(block, ruleState) {
  if (ruleState.visible[block.id] === false) return null;
  if (block.kind === "heading")
    return node("h3", { class: "content-heading", text: block.text || "" });
  if (block.kind === "subheading")
    return node("h4", { class: "content-subheading", text: block.text || "" });
  if (block.kind === "paragraph")
    return node("p", { class: "content-paragraph", text: block.text || "" });
  if (block.kind === "callout")
    return node("div", { class: "content-callout", text: block.text || "" });
  if (block.kind === "divider") return node("hr", { class: "content-divider" });
  if (block.kind === "image")
    return node("img", {
      class: "content-image",
      src: block.url || "",
      alt: block.alt || "",
    });
  if (block.kind !== "question" || block.type === "hidden") return null;
  const wrap = node("div", {
    class: `block${errors[block.id] ? " has-error" : ""}`,
    "data-question": block.id,
  });
  for (const header of questionHeader(block)) if (header) wrap.append(header);
  wrap.append(questionControl(block));
  const error = answerError(block);
  if (error) wrap.append(error);
  return wrap;
}
function nextPageIndex(sections, current, ruleState) {
  const source = sections[current]?.id,
    target = ruleState.nextSection[source] || ruleState.nextSection["*"];
  if (target) {
    const targetIndex = sections.findIndex((section) => section.id === target);
    if (targetIndex > current) return targetIndex;
  }
  return Math.min(current + 1, sections.length - 1);
}
function validateCurrent(sections) {
  if (previewSchema) {
    errors = {};
    return true;
  }
  const section = sections[page],
    checked = validateAnswers(schema, answers);
  errors = {};
  for (const block of section.blocks || [])
    if (checked.errors[block.id]) errors[block.id] = checked.errors[block.id];
  if (Object.keys(errors).length) {
    render();
    setTimeout(
      () =>
        document
          .querySelector(
            ".has-error input,.has-error textarea,.has-error select,.has-error [tabindex]",
          )
          ?.focus(),
      0,
    );
    return false;
  }
  return true;
}

function render() {
  if (!schema) return;
  if (schema.settings.requiresAuth && !user && !previewSchema) {
    stateView(
      "Sign in to continue",
      "This form requires a Karamah Collective account. Your answers stay on this device until you submit.",
      "info",
      { label: "Sign in", onClick: () => openAuthDialog(true) },
    );
    return;
  }
  const sections = visibleSections();
  if (!sections.length)
    return stateView(
      "Nothing to complete",
      "This form has no available sections for your answers.",
      "info",
    );
  page = Math.min(page, sections.length - 1);
  questionNumber = schema.sections
    .slice(0, schema.sections.indexOf(sections[page]))
    .flatMap((section) => section.blocks || [])
    .filter(
      (block) => block.kind === "question" && block.type !== "hidden",
    ).length;
  const state = evaluateRules(schema, answers),
    shell = node("div", { class: `form-shell${hasRenderedForm ? "" : " is-entering"}` });
  if (schema.coverImage?.assetId || schema.coverImage?.url)
    shell.append(
      node("div", {
        class: "cover",
        role: "img",
        "aria-label": schema.coverImage.alt || "",
        style: coverStyle(schema.coverImage.assetId
          ? `/api/media?id=${encodeURIComponent(schema.coverImage.assetId)}`
          : schema.coverImage.url,
          schema.coverImage.crop),
      }),
    );
  shell.append(
    node("header", { class: "form-header" }, [
      node("p", { class: "eyebrow", text: "KARAMAH FORMS" }),
      node("h1", { text: schema.title }),
      schema.subtitle
        ? node("p", { class: "form-subtitle", text: schema.subtitle })
        : null,
      schema.description
        ? descriptionNode(schema.description)
        : null,
      schema.settings.collectIdentity
        ? node("p", {
            class: "identity-notice",
            text: `Your verified identity will be recorded with this response${user?.email ? `: ${user.email}` : ""}.`,
          })
        : null,
    ]),
  );
  if (schema.settings.progress !== "none" && sections.length > 1) {
    shell.append(
      node("div", { class: "progress-copy" }, [
        node("span", { text: `Section ${page + 1} of ${sections.length}` }),
        node("span", {
          text: schema.rules.length ? 'Your path adapts to your answers' : `${Math.round((page / sections.length) * 100)}% complete`,
        }),
      ]),
      node(
        "div",
        {
          class: "progress-track",
          hidden: schema.settings.progress === 'page',
          "aria-label": `Section ${page + 1} of ${sections.length}`,
        },
        node("span", {
          style: `transform:scaleX(${page / sections.length})`,
        }),
      ),
    );
  }
  const section = sections[page],
    heading = node("div", { class: "section-heading" }, [
      section.title ? node("h2", { text: section.title }) : null,
      section.description ? node("p", { text: section.description }) : null,
    ]),
    card = node(
      "section",
      {
        class: `section-card${sectionMotion ? ` ${sectionMotion}` : ""}`,
        "aria-labelledby": section.title ? `section-${section.id}` : null,
      },
      heading,
    );
  if (section.title) heading.querySelector("h2").id = `section-${section.id}`;
  for (const block of section.blocks || []) {
    const rendered = renderBlock(block, state);
    if (rendered) card.append(rendered);
  }
  shell.append(card);
  const actions = node("div", { class: "form-actions" });
  if (page > 0)
    actions.append(
      node("button", {
        class: "btn",
        type: "button",
        text: "Back",
        onClick: () => {
          page--; sectionMotion = "slide-from-left";
          errors = {};
          render();
          scrollTo({ top: 0, behavior: "smooth" });
        },
      }),
    );
  const group = node("div", { class: "action-group" });
  const isLast = page === sections.length - 1;
  group.append(
    node("button", {
      class: "btn primary",
      type: "button",
      disabled: pending,
      text: isLast ? (previewSchema ? "Finish preview" : pending ? "Submitting…" : "Submit response") : "Continue",
      onClick: async () => {
        if (!validateCurrent(sections)) return;
        if (isLast) await submit();
        else {
          page = nextPageIndex(sections, page, state); sectionMotion = "slide-from-right";
          errors = {};
          render();
          scrollTo({ top: 0, behavior: "smooth" });
        }
      },
    }),
  );
  actions.append(group);
  shell.append(
    actions,
    node("p", {
      class: "draft-note is-saved",
      text: previewSchema ? "Preview only. No response will be recorded." : "Your progress stays on this device.",
    }),
  );
  clear(app);
  app.append(shell);
  hasRenderedForm = true;
  sectionMotion = "";
}
async function submit() {
  if (pending) return;
  if (previewSchema) {
    return stateView('Preview complete', schema.confirmationMessage || 'This is where respondents see the confirmation message.', 'success', {label:'Start again',onClick:()=>{answers={};errors={};page=0;render();}});
  }
  if (uploading) {
    const note = document.querySelector('.draft-note');
    if (note) { note.setAttribute('role','alert'); note.textContent = 'Please wait for your files to finish uploading.'; }
    return;
  }
  const checked = validateAnswers(schema, answers);
  if (!checked.valid) {
    errors = checked.errors;
    const invalidSection = visibleSections().findIndex(s=>s.blocks.some(b=>checked.errors[b.id]));
    if (invalidSection >= 0) page = invalidSection;
    render();
    setTimeout(
      () =>
        document
          .querySelector(".has-error")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
    return;
  }
  pending = true;
  render();
  const key =
    submissionKey ||
    `${Date.now().toString(36)}_${crypto.randomUUID().replaceAll("-", "")}`;
  submissionKey = key;
  try {
    sessionStorage.setItem(`${storageKey()}:submission`, key);
  } catch {}
  try {
    const token = await getToken(),
      response = await fetch(`/api/form?${formQuery()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: checked.answers,
          idempotencyKey: key,
          versionId: form.versionId,
          locale: navigator.language,
        }),
      }),
      data = await response.json();
    if (!response.ok) {
      if (data.state === "auth_required") openAuthDialog(true);
      if (data.fieldErrors) {
        errors = data.fieldErrors;
        render();
      }
      throw new Error(data.error || "Submission failed.");
    }
    submissionKey = "";
    clearTimeout(saveTimer);
    try {
      localStorage.removeItem(storageKey());
      sessionStorage.removeItem(`${storageKey()}:submission`);
    } catch {}
    stateView(
      "Response received",
      data.message || "Thank you. Your response has been recorded.",
      "success",
    );
    const shell = app.querySelector(".state-shell");
    shell.append(
      node("div", {
        class: "reference",
        text: `Reference ${data.submissionId}`,
      }),
    );
    if (data.allowAnother)
      shell.append(
        node("button", {
          class: "btn",
          type: "button",
          text: "Submit another response",
          onClick: () => {
            answers = {};
            errors = {};
            page = 0;
            submissionKey = "";
            render();
          },
        }),
      );
    if (data.redirectUrl)
      setTimeout(() => location.assign(data.redirectUrl), 1800);
  } catch (error) {
    if (!document.querySelector(".form-shell"))
      stateView(
        "Your response was not submitted",
        error.message || "Check your connection and try again.",
        "error",
        {
          label: "Return to form",
          onClick: () => {
            pending = false;
            render();
          },
        },
      );
    else {
      pending = false;
      render();
      const note = document.querySelector(".draft-note");
      if (note) {
        note.setAttribute('role','alert');
        note.textContent =
          error.message || "Submission failed. Your answers are saved.";
        note.classList.remove("is-saved");
      }
    }
  } finally {
    pending = false;
  }
}

load();
