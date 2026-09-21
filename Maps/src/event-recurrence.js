// ─── Event Recurrence Engine ─────────────────────────────────────────────────
// Structured recurrence patterns for events. Replaces free-text recurrence with
// deterministic date resolution so we know EXACTLY when each event occurs.
//
// Pattern format (stored in DB column I / recurrence_pattern):
//   daily
//   weekly:<days>                    e.g. weekly:1,3,5 = Mon, Wed, Fri
//   biweekly:<days>:<anchor>         e.g. biweekly:1,3:2026-05-05
//   monthly-date:<dates>             e.g. monthly-date:1,15
//   monthly-day:<ordinals>:<days>    e.g. monthly-day:1,-1:0,5
//                                         = first Sun, first Fri, last Sun, last Fri
//
// Multi-values are comma-separated within each field.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDINAL_LABELS = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", "-1": "Last" };
const MS_PER_DAY = 86400000;

// ── Frequency options shown in the form ──────────────────────────────────────

/** @type {Array<{value: string, label: string}>} */
const FREQUENCY_OPTIONS = [
  { value: "daily",    label: "Daily" },
  { value: "weekly",   label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly",  label: "Monthly" },
];

/** @type {Array<{value: string, label: string}>} */
const MONTHLY_SUB_OPTIONS = [
  { value: "date", label: "On a date" },
  { value: "day",  label: "On a day" },
];

/** @type {Array<{value: string, label: string}>} */
const ORDINAL_OPTIONS = [
  { value: "1",  label: "1st" },
  { value: "2",  label: "2nd" },
  { value: "3",  label: "3rd" },
  { value: "4",  label: "4th" },
  { value: "-1", label: "Last" },
];

// ── Pattern builder ──────────────────────────────────────────────────────────

/**
 * Build a structured recurrence pattern string from form selections.
 * @param {string} frequency - daily | weekly | biweekly | monthly
 * @param {{days?: number[], anchor?: string, monthlyType?: string, monthDates?: number[], ordinals?: number[]}} opts
 * @returns {string} Structured pattern string
 */
function buildPattern(frequency, opts = {}) {
  switch (frequency) {
    case "daily":
      return "daily";
    case "weekly":
      return `weekly:${(opts.days || [0]).join(",")}`;
    case "biweekly":
      return `biweekly:${(opts.days || [0]).join(",")}:${opts.anchor || _todayISO()}`;
    case "monthly":
      if (opts.monthlyType === "day") {
        return `monthly-day:${(opts.ordinals || [1]).join(",")}:${(opts.days || [0]).join(",")}`;
      }
      return `monthly-date:${(opts.monthDates || [1]).join(",")}`;
    default:
      return frequency; // passthrough for legacy free-text
  }
}

// ── Pattern parser ───────────────────────────────────────────────────────────

/**
 * Parse a pattern string into a structured object.
 * Multi-value fields are always arrays.
 * @param {string} pattern
 * @returns {{type: string, days?: number[], anchor?: string, monthDates?: number[], ordinals?: number[]} | null}
 */
function parsePattern(pattern) {
  if (!pattern) return null;
  if (pattern === "daily") return { type: "daily" };

  const parts = pattern.split(":");
  switch (parts[0]) {
    case "weekly":
      return { type: "weekly", days: _parseNums(parts[1]) };
    case "biweekly":
      return { type: "biweekly", days: _parseNums(parts[1]), anchor: parts[2] || _todayISO() };
    case "monthly-date":
      return { type: "monthly-date", monthDates: _parseNums(parts[1]) };
    case "monthly-day":
      return { type: "monthly-day", ordinals: _parseNums(parts[1]), days: _parseNums(parts[2]) };
    default:
      return null; // legacy free-text — not parseable
  }
}

/** Parse a comma-separated string of numbers into an array. */
function _parseNums(s) {
  if (!s) return [];
  return s.split(",").map(Number).filter(Number.isFinite);
}

// ── Human-readable label ─────────────────────────────────────────────────────

/**
 * Format a recurrence pattern as a human-readable string.
 * @param {string} pattern
 * @returns {string}
 */
function formatRecurrence(pattern) {
  const p = parsePattern(pattern);
  if (!p) return pattern || ""; // legacy free-text fallback

  switch (p.type) {
    case "daily":
      return "Every day";
    case "weekly": {
      const names = p.days.map((d) => DAY_NAMES[d]);
      return names.length === 1
        ? `Every ${names[0]}`
        : `Every ${_joinList(names)}`;
    }
    case "biweekly": {
      const names = p.days.map((d) => DAY_NAMES[d]);
      return names.length === 1
        ? `Every other ${names[0]}`
        : `Every other ${_joinList(names)}`;
    }
    case "monthly-date": {
      const dates = p.monthDates.map((d) => _ordinalSuffix(d));
      return dates.length === 1
        ? `Monthly on the ${dates[0]}`
        : `Monthly on the ${_joinList(dates)}`;
    }
    case "monthly-day": {
      // Cartesian product of ordinals × days
      const combos = [];
      for (const ord of p.ordinals) {
        for (const day of p.days) {
          combos.push(`${ORDINAL_LABELS[ord] || ""} ${DAY_NAMES[day]}`);
        }
      }
      return combos.length === 1
        ? `${combos[0]} of every month`
        : `${_joinList(combos)} of every month`;
    }
    default:
      return pattern;
  }
}

/** Join an array of strings with commas and "and" before the last item. */
function _joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

// ── Date resolution ──────────────────────────────────────────────────────────

/**
 * Resolve all occurrences of a recurrence pattern within a date range.
 * @param {string} pattern - Structured pattern string
 * @param {Date} rangeStart - Inclusive start of range
 * @param {Date} rangeEnd - Inclusive end of range
 * @returns {Date[]} Array of occurrence dates (midnight local time), sorted ascending
 */
function resolveOccurrences(pattern, rangeStart, rangeEnd) {
  const p = parsePattern(pattern);
  if (!p) return [];

  const start = _midnight(rangeStart);
  const end = _midnight(rangeEnd);
  const results = [];

  switch (p.type) {
    case "daily":
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        results.push(new Date(d));
      }
      break;

    case "weekly": {
      const daySet = new Set(p.days);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (daySet.has(d.getDay())) results.push(new Date(d));
      }
      break;
    }

    case "biweekly": {
      const daySet = new Set(p.days);
      const anchor = _midnight(new Date(p.anchor + "T00:00:00"));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (daySet.has(d.getDay())) {
          const weeksDiff = Math.round((d - anchor) / (7 * MS_PER_DAY));
          if (weeksDiff >= 0 && weeksDiff % 2 === 0) {
            results.push(new Date(d));
          }
        }
      }
      break;
    }

    case "monthly-date":
      for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m.setMonth(m.getMonth() + 1)) {
        const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        for (const md of p.monthDates) {
          if (md <= daysInMonth) {
            const candidate = new Date(m.getFullYear(), m.getMonth(), md);
            if (candidate >= start && candidate <= end) results.push(candidate);
          }
        }
      }
      break;

    case "monthly-day":
      for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m.setMonth(m.getMonth() + 1)) {
        for (const ord of p.ordinals) {
          for (const day of p.days) {
            const candidate = _nthWeekday(m.getFullYear(), m.getMonth(), ord, day);
            if (candidate && candidate >= start && candidate <= end) results.push(candidate);
          }
        }
      }
      break;
  }

  // Sort ascending (multi-value patterns can produce out-of-order dates)
  results.sort((a, b) => a - b);
  return results;
}

/**
 * Get the next occurrence of a recurring event after a given date.
 * @param {string} pattern - Structured pattern string
 * @param {Date} [after] - Date to search from (defaults to today)
 * @returns {Date | null}
 */
function nextOccurrence(pattern, after = new Date()) {
  // Look ahead 400 days to cover any monthly/biweekly edge cases
  const end = new Date(after);
  end.setDate(end.getDate() + 400);
  const occs = resolveOccurrences(pattern, after, end);
  return occs.length ? occs[0] : null;
}

/**
 * Check if a recurring event has an occurrence on a specific date.
 * @param {string} pattern
 * @param {Date} date
 * @returns {boolean}
 */
function occursOn(pattern, date) {
  const d = _midnight(date);
  const occs = resolveOccurrences(pattern, d, d);
  return occs.length > 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function _midnight(d) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  return m;
}

/**
 * Find the Nth weekday of a given month.
 * @param {number} year
 * @param {number} month - 0-indexed
 * @param {number} nth - 1=first, 2=second, 3=third, 4=fourth, -1=last
 * @param {number} dow - day of week (0=Sun..6=Sat)
 * @returns {Date | null}
 */
function _nthWeekday(year, month, nth, dow) {
  if (nth === -1) {
    // Last occurrence: start from end of month
    const lastDay = new Date(year, month + 1, 0);
    for (let d = lastDay.getDate(); d >= 1; d--) {
      const candidate = new Date(year, month, d);
      if (candidate.getDay() === dow) return candidate;
    }
    return null;
  }
  // Forward from 1st
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const candidate = new Date(year, month, d);
    if (candidate.getMonth() !== month) break;
    if (candidate.getDay() === dow) {
      count++;
      if (count === nth) return candidate;
    }
  }
  return null;
}

/**
 * Ordinal suffix for a number (1st, 2nd, 3rd, 4th, ..., 31st).
 * @param {number} n
 * @returns {string}
 */
function _ordinalSuffix(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
  DAY_NAMES,
  DAY_NAMES_SHORT,
  ORDINAL_LABELS,
  FREQUENCY_OPTIONS,
  MONTHLY_SUB_OPTIONS,
  ORDINAL_OPTIONS,
  buildPattern,
  parsePattern,
  formatRecurrence,
  resolveOccurrences,
  nextOccurrence,
  occursOn,
};
