#!/usr/bin/env node
/**
 * Migrates the Google Sheets backup (scripts/local-backups/sheets/halal-finder-sheet.xlsx)
 * into Cloudflare D1. See docs/D1_MIGRATION_PLAN.md for the full plan.
 *
 * Usage:
 *   node scripts/migrate-to-d1.js                 Parse + generate SQL + import into local D1 + verify
 *   node scripts/migrate-to-d1.js --remote         Same, against the real (production) D1 database
 *   node scripts/migrate-to-d1.js --verify-only    Skip import, just re-check local D1 against the xlsx
 *   node scripts/migrate-to-d1.js --verify-only --remote   Same, against remote
 *   node scripts/migrate-to-d1.js --xlsx=path/to/other.xlsx
 *
 * Ground truth for every column mapping and quirk below is
 * scripts/apps-script/Code.gs (read in full) cross-checked against the real
 * xlsx backup's actual headers/data — the two disagree in a few places
 * (typo'd headers, dead unused columns on Events/EventEdit, a "999 blank
 * padding rows" artifact on several sheets) and every disagreement is
 * called out inline where it's resolved.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const XLSX = require('xlsx');

const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_XLSX = path.join(REPO_ROOT, 'scripts/local-backups/sheets/halal-finder-sheet.xlsx');
const GENERATED_DIR = path.join(__dirname, 'migrate-to-d1', 'generated');
const DB_NAME = 'halal-finder-db';
const BATCH_SIZE = 200; // rows per INSERT statement, capped further by MAX_BATCH_BYTES
const MAX_BATCH_BYTES = 80_000; // D1 rejects statements above ~100,000 bytes (SQLITE_TOOBIG); stay well under it

const args = process.argv.slice(2);
const REMOTE = args.includes('--remote');
const VERIFY_ONLY = args.includes('--verify-only');
const xlsxArg = args.find((a) => a.startsWith('--xlsx='));
const XLSX_PATH = xlsxArg ? path.resolve(xlsxArg.slice('--xlsx='.length)) : DEFAULT_XLSX;

// ── Generic helpers ──────────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = v.toString().trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = toNum(v);
  return n === null ? null : Math.trunc(n);
}

function toBool01(v) {
  const s = (v || '').toString().trim().toLowerCase();
  return s === 'yes' || s === 'true' ? 1 : 0;
}

function str(v) {
  return v === null || v === undefined ? '' : v.toString();
}

// Mirrors Code.gs's formatSheetDate/formatSheetTime defensive fallback: the
// xlsx backup is read with raw:false (formatted display strings), so native
// Sheets date cells already arrive as e.g. "2026-05-17" rather than a serial
// number or JS Date object — but if a value ever doesn't look like a date,
// fall back to reparsing it exactly the way Code.gs does, and only pass the
// original string through untouched if even that fails.
function normaliseDateStr(v) {
  const s = str(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  return s;
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Reads one sheet as an array of row-objects already positionally sliced to
// `expectedCols`, with fully-blank rows dropped. The real xlsx backup pads
// several sheets to ~999 rows with entirely empty cells (a Google
// Sheets/export artifact, not real data) — this filter is what makes row
// counts match the live app (verified against Places: raw 987 physical
// rows, 185 non-blank, matching the ~185 places the site actually serves).
function readSheet(wb, sheetName, expectedCols) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in ${XLSX_PATH}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  if (!rows.length) throw new Error(`Sheet "${sheetName}" has no header row`);
  const header = rows[0];
  if (header.length < expectedCols) {
    throw new Error(
      `Sheet "${sheetName}": expected at least ${expectedCols} columns, header only has ${header.length}: ${JSON.stringify(header)}`
    );
  }
  const dataRows = rows
    .slice(1)
    .map((r) => r.slice(0, expectedCols))
    .filter((r) => r.some((c) => c !== '' && c !== null && c !== undefined));
  return { header, dataRows };
}

// ── Per-table transforms ─────────────────────────────────────────────────
// Each entry: sheet name, D1 table name, expected column count in the real
// xlsx (only the first N columns are read — Events/EventEdit have 8 extra
// always-blank dead columns after this, confirmed unused by any Code.gs
// function and empty in every real row; dropped, not migrated), the D1
// column list (defines both INSERT column order and the verify-mode SELECT
// column order — must stay in sync), and a mapper from a positional row
// array to a values array in that same order.

const TABLES = [
  {
    sheet: 'Draft',
    table: 'draft',
    expectedCols: 10,
    columns: ['timestamp', 'name', 'type', 'address', 'tags', 'maps_link', 'notes', 'score', 'opening_hours', 'email_hash'],
    map: (r) => [str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), str(r[5]), str(r[6]), str(r[7]), str(r[8]), str(r[9])],
  },
  {
    // Approved/reject-reason overload: OpeningHours (col Q, idx 16) holds
    // the reject reason instead of JSON once status is 'no' — Code.gs's
    // adminRejectNew (functions/... ported later) writes it there.
    sheet: 'New',
    table: 'new_places',
    expectedCols: 24,
    columns: [
      'timestamp', 'name', 'type', 'address', 'tags', 'maps_link', 'notes', 'score',
      'google_name', 'google_address', 'lat', 'lng', 'place_id', 'website', 'enriched_at',
      'status', 'reject_reason', 'opening_hours', 'google_review', 'google_rating',
      'google_rating_count', 'phone', 'email_hash', 'app_place_id',
    ],
    map: (r) => {
      const approved = str(r[15]).trim().toLowerCase();
      const status = approved === 'yes' ? 'yes' : approved === 'no' ? 'no' : 'pending';
      const rejectReason = status === 'no' ? str(r[16]) : '';
      const openingHours = status === 'no' ? '' : str(r[16]);
      return [
        str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), str(r[5]), str(r[6]), str(r[7]),
        str(r[8]), str(r[9]), toNum(r[10]), toNum(r[11]), str(r[12]), str(r[13]), str(r[14]),
        status, rejectReason, openingHours, str(r[17]), toNum(r[18]),
        toInt(r[19]), str(r[20]), str(r[22]), str(r[23]),
      ];
    },
  },
  {
    // Same overload pattern: OpeningHours (col L, idx 11) holds the reject
    // reason once status is 'no' (adminRejectEdit).
    sheet: 'Edit',
    table: 'edits',
    expectedCols: 15,
    columns: [
      'timestamp', 'place_id', 'name', 'type', 'address', 'tags', 'maps_link', 'notes', 'score',
      'changes_summary', 'status', 'reject_reason', 'opening_hours', 'website', 'phone', 'email_hash',
    ],
    map: (r) => {
      const approved = str(r[10]).trim().toLowerCase();
      const status = approved === 'yes' ? 'yes' : approved === 'no' ? 'no' : 'pending';
      const rejectReason = status === 'no' ? str(r[11]) : '';
      const openingHours = status === 'no' ? '' : str(r[11]);
      return [
        str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), str(r[5]), str(r[6]), str(r[7]), str(r[8]),
        str(r[9]), status, rejectReason, openingHours, str(r[12]), str(r[13]), str(r[14]),
      ];
    },
  },
  {
    sheet: 'Contact',
    table: 'contacts',
    expectedCols: 7,
    columns: ['timestamp', 'name', 'email', 'phone', 'message', 'score', 'replied'],
    map: (r) => {
      const replied = str(r[6]).trim();
      return [str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), str(r[5]), replied === 'Yes' || replied === 'No' ? replied : ''];
    },
  },
  {
    sheet: 'Places',
    table: 'places',
    expectedCols: 19,
    columns: [
      'id', 'name', 'type', 'address', 'lat', 'lng', 'tags', 'notes', 'boycott', 'sponsor_tier',
      'sponsor_promo', 'sponsor_promo_text', 'sponsor_start_date', 'sponsor_end_date', 'opening_hours',
      'website', 'phone', 'google_info', 'google_info_enriched_at',
    ],
    map: (r) => [
      str(r[0]), str(r[1]), str(r[2]), str(r[3]), toNum(r[4]), toNum(r[5]), str(r[6]) || '{}', str(r[7]),
      toBool01(r[8]), str(r[9]), str(r[10]), str(r[11]), str(r[12]), str(r[13]), str(r[14]),
      str(r[15]), str(r[16]), str(r[17]), str(r[18]),
    ],
  },
  {
    sheet: 'Tags',
    table: 'tags',
    expectedCols: 3,
    columns: ['type', 'tag_id', 'label'],
    map: (r) => [str(r[0]), str(r[1]), str(r[2])],
  },
  {
    // adminRejectEid discards its `reason` argument entirely today (never
    // written anywhere) — reject_reason is kept as a real column here
    // anyway (a genuine, zero-cost improvement, not a behavior port) so a
    // future admin.js can start actually storing it.
    sheet: 'EidNew',
    table: 'eid_new',
    expectedCols: 17,
    columns: [
      'timestamp', 'name', 'address', 'maps_link', 'organizer', 'jamaats', 'date', 'notes', 'score',
      'google_name', 'google_address', 'lat', 'lng', 'place_id', 'website', 'enriched_at', 'status',
    ],
    map: (r) => {
      const approved = str(r[16]).trim().toLowerCase();
      const status = approved === 'yes' ? 'yes' : approved === 'no' ? 'no' : 'pending';
      return [
        str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), str(r[5]), normaliseDateStr(r[6]), str(r[7]), str(r[8]),
        str(r[9]), str(r[10]), toNum(r[11]), toNum(r[12]), str(r[13]), str(r[14]), str(r[15]), status,
      ];
    },
  },
  {
    sheet: 'EidPrayers',
    table: 'eid_prayers',
    expectedCols: 9,
    columns: ['id', 'name', 'address', 'lat', 'lng', 'organizer', 'jamaats', 'notes', 'date'],
    map: (r) => [str(r[0]), str(r[1]), str(r[2]), toNum(r[3]), toNum(r[4]), str(r[5]), str(r[6]), str(r[7]), normaliseDateStr(r[8])],
  },
  {
    // Only the first 12 columns (matching Code.gs's EVENT_HEADERS) plus the
    // real reject_reason column at idx 12 are migrated — idx 13-19
    // (location_name/address/lat/lng/organizer_name/organizer_place_id/
    // location_gmaps_link) are confirmed dead: no Code.gs function reads or
    // writes them, and every real row has them blank. Not migrated.
    sheet: 'Events',
    table: 'events',
    expectedCols: 13,
    columns: [
      'id', 'place_id', 'title', 'description', 'event_date', 'event_time', 'end_time', 'recurring',
      'recurrence_pattern', 'url', 'status', 'created_at', 'reject_reason',
    ],
    map: (r) => {
      const approved = str(r[10]).trim().toLowerCase();
      const status = approved === 'yes' ? 'yes' : approved === 'no' ? 'no' : 'pending';
      return [
        str(r[0]), str(r[1]), str(r[2]), str(r[3]), normaliseDateStr(r[4]), str(r[5]), str(r[6]), toBool01(r[7]),
        str(r[8]), str(r[9]), status, str(r[11]), str(r[12]),
      ];
    },
  },
  {
    // Same dead-tail-columns situation as Events; only the first 14 (Code.gs
    // EVENT_EDIT_HEADERS) + the real RejectReason at idx 14 are migrated.
    sheet: 'EventEdit',
    table: 'event_edits',
    expectedCols: 15,
    columns: [
      'timestamp', 'event_id', 'place_id', 'title', 'description', 'event_date', 'event_time', 'end_time',
      'recurring', 'recurrence_pattern', 'url', 'score', 'changes_summary', 'status', 'reject_reason',
    ],
    map: (r) => {
      const approved = str(r[13]).trim().toLowerCase();
      const status = approved === 'yes' ? 'yes' : approved === 'no' ? 'no' : 'pending';
      return [
        str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), normaliseDateStr(r[5]), str(r[6]), str(r[7]),
        toBool01(r[8]), str(r[9]), str(r[10]), str(r[11]), str(r[12]), status, str(r[14]),
      ];
    },
  },
  {
    sheet: 'Wishes',
    table: 'wishes',
    expectedCols: 10,
    columns: ['id', 'title', 'description', 'votes', 'created', 'voted_devices', 'name', 'email', 'approved', 'implemented'],
    map: (r) => {
      const approved = str(r[8]).trim();
      const implemented = str(r[9]).trim();
      return [
        str(r[0]), str(r[1]), str(r[2]), toInt(r[3]) || 0, str(r[4]), str(r[5]), str(r[6]), str(r[7]),
        approved === 'Yes' || approved === 'No' ? approved : '',
        ['Yes', 'Inprogress', 'Out of Scope'].includes(implemented) ? implemented : '',
      ];
    },
  },
  {
    sheet: 'Reviews',
    table: 'reviews',
    expectedCols: 10,
    columns: ['place_id', 'rating', 'text', 'email', 'timestamp', 'status', 'email_hash', 'google_review', 'google_rating', 'google_rating_count'],
    map: (r) => {
      const status = str(r[5]).trim().toLowerCase();
      return [
        str(r[0]), toInt(r[1]), str(r[2]), str(r[3]), str(r[4]),
        ['yes', 'no', 'pending'].includes(status) ? status : 'yes',
        str(r[6]), str(r[7]), toNum(r[8]), toInt(r[9]),
      ];
    },
  },
  {
    sheet: 'SavedPlaces',
    table: 'saved_places',
    expectedCols: 7,
    columns: ['email_hash', 'kind', 'place_id', 'pin_lat', 'pin_lng', 'pin_name', 'saved_at'],
    map: (r) => [str(r[0]), str(r[1]), str(r[2]), toNum(r[3]), toNum(r[4]), str(r[5]), str(r[6])],
  },
  {
    sheet: 'AccountMeta',
    table: 'account_meta',
    expectedCols: 6,
    columns: ['email_hash', 'local_import_resolved', 'resolved_at', 'first_seen_at', 'lifetime_review_count', 'lifetime_visited_place_ids'],
    map: (r) => [str(r[0]), toBool01(r[1]), str(r[2]), str(r[3]), toInt(r[4]) || 0, str(r[5]).trim() || '[]'],
  },
];

// ── Parse + transform ────────────────────────────────────────────────────

function loadWorkbook() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`xlsx backup not found at ${XLSX_PATH}. Run "node scripts/fetch-and-cache-places.js <GAS_URL>" first.`);
  }
  return XLSX.readFile(XLSX_PATH);
}

// Returns { table -> { columns, rows: [[...], ...] } } — `rows` are fully
// transformed, positionally aligned to `columns`, ready for either SQL
// generation or checksum computation.
function transformAll(wb) {
  const out = {};
  for (const t of TABLES) {
    const { dataRows } = readSheet(wb, t.sheet, t.expectedCols);
    const rows = dataRows.map((r, i) => {
      try {
        return t.map(r);
      } catch (err) {
        throw new Error(`Sheet "${t.sheet}" row ${i + 2}: ${err.message}\nRow: ${JSON.stringify(r)}`);
      }
    });
    out[t.table] = { columns: t.columns, rows };
  }
  return out;
}

function tableChecksum(columns, rows) {
  const canon = rows
    .map((r) => JSON.stringify(r.map((v) => (v === undefined ? null : v))))
    .sort();
  return { rowCount: rows.length, checksum: sha256(canon.join('\n')) };
}

// ── SQL generation ────────────────────────────────────────────────────────

function generateSql(transformed) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  for (const t of TABLES) {
    const { columns, rows } = transformed[t.table];
    const colList = columns.join(', ');
    const lines = [];
    let batch = [];
    let batchBytes = 0;
    const flush = () => {
      if (!batch.length) return;
      const valuesSql = batch.join(',\n');
      lines.push(`INSERT INTO ${t.table} (${colList}) VALUES\n${valuesSql};`);
      batch = [];
      batchBytes = 0;
    };
    for (const row of rows) {
      const rowSql = `(${row.map(sqlLiteral).join(', ')})`;
      if (batch.length >= BATCH_SIZE || (batch.length && batchBytes + rowSql.length > MAX_BATCH_BYTES)) flush();
      batch.push(rowSql);
      batchBytes += rowSql.length;
    }
    flush();
    const outPath = path.join(GENERATED_DIR, `${t.table}.sql`);
    fs.writeFileSync(outPath, lines.join('\n\n') + '\n');
  }
}

// ── D1 execution helpers ─────────────────────────────────────────────────

function d1Exec(argsList) {
  const flag = REMOTE ? '--remote' : '--local';
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, flag, ...argsList], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
}

function d1Query(sql) {
  const raw = d1Exec(['--json', '--command', sql]);
  const parsed = JSON.parse(raw);
  return parsed[0].results;
}

function importTable(table) {
  const file = path.join(GENERATED_DIR, `${table}.sql`);
  if (!fs.existsSync(file)) throw new Error(`${file} missing — run generation first`);
  const stat = fs.statSync(file);
  if (stat.size === 0) return; // no rows for this table, nothing to import
  d1Exec(['--file', file]);
}

// ── Verification ──────────────────────────────────────────────────────────

function verify(transformed) {
  console.log(`\nVerifying against ${REMOTE ? 'REMOTE' : 'local'} D1 (${DB_NAME})...\n`);
  let allOk = true;
  for (const t of TABLES) {
    const { columns, rows } = transformed[t.table];
    const expected = tableChecksum(columns, rows);
    const colList = columns.join(', ');
    const actualRows = d1Query(`SELECT ${colList} FROM ${t.table};`);
    const actualArrays = actualRows.map((obj) => columns.map((c) => (obj[c] === undefined ? null : obj[c])));
    const actual = tableChecksum(columns, actualArrays);
    const ok = expected.rowCount === actual.rowCount && expected.checksum === actual.checksum;
    allOk = allOk && ok;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${t.table.padEnd(14)} expected rows=${expected.rowCount} checksum=${expected.checksum.slice(0, 12)}  actual rows=${actual.rowCount} checksum=${actual.checksum.slice(0, 12)}`
    );
    if (!ok) {
      // Show a few sample row mismatches to make debugging fast.
      const expectedSet = new Set(rows.map((r) => JSON.stringify(r)));
      const actualSet = new Set(actualArrays.map((r) => JSON.stringify(r)));
      const missingFromD1 = rows.filter((r) => !actualSet.has(JSON.stringify(r))).slice(0, 3);
      const extraInD1 = actualArrays.filter((r) => !expectedSet.has(JSON.stringify(r))).slice(0, 3);
      if (missingFromD1.length) console.log('  sample rows in source but not in D1:', JSON.stringify(missingFromD1, null, 2));
      if (extraInD1.length) console.log('  sample rows in D1 but not in source:', JSON.stringify(extraInD1, null, 2));
    }
  }
  console.log(allOk ? '\nAll tables verified clean.\n' : '\nVERIFICATION FAILED — see FAIL lines above.\n');
  return allOk;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log(`Reading ${XLSX_PATH}...`);
  const wb = loadWorkbook();
  const transformed = transformAll(wb);

  for (const t of TABLES) {
    console.log(`  ${t.sheet.padEnd(12)} -> ${t.table.padEnd(14)} ${transformed[t.table].rows.length} rows`);
  }

  if (VERIFY_ONLY) {
    const ok = verify(transformed);
    process.exit(ok ? 0 : 1);
  }

  console.log('\nGenerating SQL...');
  generateSql(transformed);

  console.log(`\nImporting into ${REMOTE ? 'REMOTE' : 'local'} D1...`);
  for (const t of TABLES) {
    console.log(`  importing ${t.table}...`);
    importTable(t.table);
  }

  const ok = verify(transformed);
  process.exit(ok ? 0 : 1);
}

main();
