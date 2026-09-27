/** Shared, dependency-free Forms schema, rule and answer validation. */
export const FORM_SCHEMA_VERSION = 1;
export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "date",
  "time",
  "datetime",
  "single_choice",
  "multi_choice",
  "dropdown",
  "multiselect",
  "rating",
  "scale",
  "yes_no",
  "consent",
  "matrix",
  "checkbox_grid",
  "file",
  "ranking",
  "address",
  "hidden",
];
export const CONTENT_TYPES = [
  "heading",
  "subheading",
  "paragraph",
  "image",
  "divider",
  "callout",
];
const QUESTION_SET = new Set(QUESTION_TYPES);
const CHOICE_TYPES = new Set([
  "single_choice",
  "multi_choice",
  "dropdown",
  "multiselect",
  "ranking",
]);
const MULTI_TYPES = new Set(["multi_choice", "multiselect", "ranking"]);

export const makeId = (prefix = "id") => `${prefix}_${crypto.randomUUID()}`;

export function createQuestion(type = "short_text") {
  const question = {
    id: makeId("q"),
    kind: "question",
    type,
    label: "Untitled question",
    description: "",
    required: false,
    validation: {},
  };
  if (CHOICE_TYPES.has(type))
    question.options = ["Option 1", "Option 2"].map((label) => ({
      id: makeId("opt"),
      label,
      description: "",
    }));
  if (["rating", "scale"].includes(type))
    Object.assign(question, { min: 1, max: 5, minLabel: "", maxLabel: "" });
  if (["matrix", "checkbox_grid"].includes(type))
    Object.assign(question, {
      requiredRows: true,
      rows: ["Row 1"].map((label) => ({ id: makeId("row"), label })),
      columns: ["Column 1", "Column 2"].map((label) => ({
        id: makeId("col"),
        label,
      })),
    });
  if (type === "file")
    Object.assign(question, {
      allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
      maxFiles: 1,
      maxSizeMb: 10,
    });
  return question;
}

export function createFormSchema(title = "Untitled form") {
  return {
    schemaVersion: FORM_SCHEMA_VERSION,
    title,
    subtitle: "",
    description: "",
    footer: "",
    confirmationMessage: "Thank you. Your response has been recorded.",
    closedMessage: "This form is no longer accepting responses.",
    coverImage: null,
    settings: {
      requiresAuth: false,
      collectIdentity: false,
      progress: "bar",
      questionNumbers: true,
      spacing: "comfortable",
      responseLimit: null,
      perUserLimit: null,
      onePerBrowser: false,
      opensAt: null,
      closesAt: null,
      allowAnother: true,
      redirectUrl: "",
    },
    sections: [
      {
        id: makeId("section"),
        title: "",
        description: "",
        blocks: [createQuestion()],
      },
    ],
    rules: [],
  };
}

export function normalizeSchema(input) {
  const source = input && typeof input === "object" ? input : {};
  const schema = createFormSchema(
    typeof source.title === "string" ? source.title : "Untitled form",
  );
  Object.assign(schema, source, {
    schemaVersion: FORM_SCHEMA_VERSION,
    settings: { ...schema.settings, ...(source.settings || {}) },
    sections: Array.isArray(source.sections)
      ? source.sections
      : schema.sections,
    rules: Array.isArray(source.rules) ? source.rules : [],
  });
  return schema;
}

const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0) ||
  (!!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.keys(value).length === 0 || Object.values(value).every(isEmpty)));
export function evaluateCondition(condition, answers) { return matches(condition, answers); }
export function evaluateRules(schemaInput, answers = {}) { return evaluateLogic(normalizeSchema(schemaInput), answers); }

export function validateSchema(schemaInput) {
  const schema = normalizeSchema(schemaInput);
  const errors = [],
    warnings = [],
    ids = new Set(),
    questions = new Map(),
    sections = new Set(),
    navigation = new Map();
  if (!schema.title.trim()) errors.push("Give the form a title.");
  if (!schema.sections.length) errors.push("Add at least one section.");
  for (const section of schema.sections) {
    if (!section?.id || ids.has(section.id))
      errors.push("Every section needs a unique stable ID.");
    ids.add(section?.id);
    sections.add(section?.id);
    for (const block of section.blocks || []) {
      if (!block?.id || ids.has(block.id))
        errors.push("Every block needs a unique stable ID.");
      ids.add(block?.id);
      if (block.kind === "question") {
        questions.set(block.id, block);
        if (!QUESTION_SET.has(block.type))
          errors.push(`Unsupported question type: ${block.type || "missing"}.`);
        if (!String(block.label || "").trim())
          errors.push("Every question needs a label.");
        if (
          CHOICE_TYPES.has(block.type) &&
          (!Array.isArray(block.options) || block.options.length < 1)
        )
          errors.push(`“${block.label}” needs at least one option.`);
        if (block.validation?.minLength > block.validation?.maxLength)
          errors.push(`“${block.label}” has an invalid length range.`);
        if (Number(block.min) > Number(block.max))
          errors.push(`“${block.label}” has an invalid range.`);
      } else if (!CONTENT_TYPES.includes(block.kind))
        errors.push(`Unsupported content block: ${block.kind || "missing"}.`);
    }
  }
  for (const rule of schema.rules || []) {
    const conditions = [...(rule.when?.all || []), ...(rule.when?.any || [])];
    const conditionIds = new Set(
      conditions.map((condition) => condition.questionId),
    );
    for (const condition of conditions) {
      if (!questions.has(condition.questionId))
        errors.push("A conditional rule references a missing question.");
    }
    for (const action of rule.actions || []) {
      if (
        ["show", "hide", "set_required"].includes(action.type) &&
        !ids.has(action.targetId)
      )
        errors.push("A rule action references a missing block.");
      if (
        ["show_section", "skip_section", "navigate"].includes(action.type) &&
        !sections.has(action.targetId)
      )
        errors.push("A rule references a missing section.");
      if (
        ["show", "hide", "set_required"].includes(action.type) &&
        conditionIds.has(action.targetId)
      )
        errors.push("A rule cannot change the same question it evaluates.");
      if (action.type === "navigate" && action.sourceId) {
        if (action.sourceId === action.targetId)
          errors.push("A section cannot navigate to itself.");
        if (!navigation.has(action.sourceId))
          navigation.set(action.sourceId, []);
        navigation.get(action.sourceId).push(action.targetId);
      }
    }
  }
  const visiting = new Set(),
    visited = new Set();
  const cyclic = (sectionId) => {
    if (visiting.has(sectionId)) return true;
    if (visited.has(sectionId)) return false;
    visiting.add(sectionId);
    for (const target of navigation.get(sectionId) || [])
      if (cyclic(target)) return true;
    visiting.delete(sectionId);
    visited.add(sectionId);
    return false;
  };
  if ([...sections].some(cyclic))
    errors.push("Section navigation contains a cycle.");
  if (schema.settings.redirectUrl) {
    try {
      if (!/^https?:$/.test(new URL(schema.settings.redirectUrl).protocol))
        throw new Error();
    } catch {
      errors.push("The completion redirect must be a safe HTTP or HTTPS URL.");
    }
  }
  if (
    schema.settings.opensAt &&
    schema.settings.closesAt &&
    new Date(schema.settings.opensAt) >= new Date(schema.settings.closesAt)
  )
    errors.push("The closing time must be after the opening time.");
  if (!questions.size)
    warnings.push(
      "This form has no questions and will submit an empty response.",
    );
  errors.push(...validateLogic(schema));
  return { valid: errors.length === 0, errors, warnings, schema };
}

function validateQuestion(question, value, effectiveRequired = false) {
  const errors = [],
    validation = question.validation || {};
  if (value != null && value !== '' && CHOICE_TYPES.has(question.type)) {
    if (MULTI_TYPES.has(question.type) ? !Array.isArray(value) : typeof value !== 'string') return ['Choose valid options.'];
  }
  if (isEmpty(value)) return errors;
  if (
    ["short_text", "long_text", "email", "phone", "url", "hidden"].includes(
      question.type,
    )
  ) {
    if (typeof value !== "string") return ["Enter a valid text answer."];
    if (validation.minLength != null && value.length < validation.minLength)
      errors.push(`Use at least ${validation.minLength} characters.`);
    if (validation.maxLength != null && value.length > validation.maxLength)
      errors.push(`Use no more than ${validation.maxLength} characters.`);
    if (
      validation.exactLength != null &&
      value.length !== validation.exactLength
    )
      errors.push(`Use exactly ${validation.exactLength} characters.`);
    if (
      (question.type === "email" || validation.format === "email") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      errors.push("Enter a valid email address.");
    if (question.type === "url" || validation.format === "url") {
      try {
        if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new Error('Unsafe URL');
      } catch {
        errors.push("Enter a valid URL.");
      }
    }
    if (validation.pattern) {
      try {
        if (!new RegExp(validation.pattern).test(value))
          errors.push(
            validation.message ||
              "This answer does not match the required format.",
          );
      } catch {
        errors.push("This question has an invalid validation pattern.");
      }
    }
  }
  if (question.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      return ["Enter a valid number."];
    if (question.integer && !Number.isInteger(value))
      errors.push("Enter a whole number.");
    if (validation.min != null && value < validation.min)
      errors.push(`Enter ${validation.min} or more.`);
    if (validation.max != null && value > validation.max)
      errors.push(`Enter ${validation.max} or less.`);
  }
  if (CHOICE_TYPES.has(question.type)) {
    const allowed = new Set(
      (question.options || []).map((option) => option.id),
    );
    const values = MULTI_TYPES.has(question.type) ? value : [value];
    if (!Array.isArray(values)) return ['Choose valid options.'];
    if (new Set(values).size !== values.length) errors.push('Choose each option only once.');
    if (question.type === 'ranking' && values.length !== allowed.size) errors.push('Rank every available option.');
    if (
      !Array.isArray(values) ||
      values.some(
        (item) =>
          !allowed.has(item) &&
          !(
            question.allowOther && question.type !== 'ranking' && typeof item === "string" &&
            item.startsWith("other:") &&
            item.slice(6).trim()
          ),
      )
    )
      errors.push("Choose a valid option and complete the Other answer.");
    if (
      validation.minSelections != null &&
      values.length < validation.minSelections
    )
      errors.push(`Choose at least ${validation.minSelections} options.`);
    if (
      validation.maxSelections != null &&
      values.length > validation.maxSelections
    )
      errors.push(`Choose no more than ${validation.maxSelections} options.`);
  }
  if (
    ["rating", "scale"].includes(question.type) &&
    (typeof value !== 'number' || !Number.isInteger(value) ||
      Number(value) < Number(question.min ?? 1) ||
      Number(value) > Number(question.max ?? 5))
  )
    errors.push("Choose a value in the available range.");
  if (question.type === "yes_no" && typeof value !== "boolean")
    errors.push("Choose yes or no.");
  if (question.type === "consent" && value !== true && value !== false)
    errors.push("Choose whether you agree.");
  if (
    question.type === "date" &&
    (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value)
  )
    errors.push("Enter a valid date.");
  if (
    question.type === "time" &&
    (typeof value !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d(?:\:[0-5]\d)?$/.test(value))
  )
    errors.push("Enter a valid time.");
  if (
    question.type === "datetime" &&
    (typeof value !== "string" || Number.isNaN(Date.parse(value)))
  )
    errors.push("Enter a valid date and time.");
  if (
    ["matrix", "checkbox_grid", "address"].includes(question.type) &&
    (!value || typeof value !== "object" || Array.isArray(value))
  )
    errors.push("Complete this grouped answer.");
  if (
    ["matrix", "checkbox_grid"].includes(question.type) &&
    value &&
    typeof value === "object" &&
    (question.requiredRows || effectiveRequired)
  ) {
    if ((question.rows || []).some((row) => isEmpty(value[row.id])))
      errors.push("Complete every required row.");
  }
  if (
    question.type === "file" &&
    (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
  )
    errors.push("Choose a valid uploaded file.");
  if (['matrix','checkbox_grid'].includes(question.type) && value && typeof value === 'object' && !Array.isArray(value)) {
    const rows = new Set((question.rows || []).map(row => row.id));
    const columns = new Set((question.columns || []).map(column => column.id));
    for (const [row, selection] of Object.entries(value)) {
      const cells = question.type === 'matrix' ? [selection] : selection;
      if (!rows.has(row) || !Array.isArray(cells) || new Set(cells).size !== cells.length || cells.some(cell => !columns.has(cell))) errors.push('Choose valid grid options.');
    }
  }
  return errors;
}

export function validateAnswers(schemaInput, inputAnswers = {}) {
  const schema = normalizeSchema(schemaInput),
    state = evaluateRules(schema, inputAnswers),
    answers = { ...state.answers },
    errors = {};
  const questionIds = new Set();
  for (const section of schema.sections)
    for (const question of (section.blocks || []).filter(
      (block) => block.kind === "question",
    )) {
      questionIds.add(question.id);
      const reachable =
        state.path.includes(section.id) &&
        state.visible[question.id] !== false;
      if (!reachable) {
        delete answers[question.id];
        continue;
      }
      const value = answers[question.id];
      if (
        state.required[question.id] &&
        (isEmpty(value) || (question.type === "consent" && value !== true))
      )
        errors[question.id] = [
          question.type === "consent"
            ? "Consent is required to continue."
            : "This question is required.",
        ];
      else {
        const questionErrors = validateQuestion(
          question,
          value,
          state.required[question.id],
        );
        if (questionErrors.length) errors[question.id] = questionErrors;
      }
    }
  for (const id of Object.keys(answers))
    if (!questionIds.has(id)) delete answers[id];
  return { valid: Object.keys(errors).length === 0, errors, answers, state };
}

export function publicSchema(schemaInput) {
  const schema = normalizeSchema(schemaInput);
  delete schema.adminNotes;
  for (const section of schema.sections)
    for (const block of section.blocks || []) delete block.internalLabel;
  return schema;
}
import { matches, evaluateLogic, validateLogic } from './forms-logic.mjs';
