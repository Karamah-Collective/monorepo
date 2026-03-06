// Halal Finder Helsinki – Google Apps Script Web App
// Sheet: https://docs.google.com/spreadsheets/d/1rixpqkzB-msw_whxJpPXIb4Y75o3h9_G_AgWoTYT2jA
//
// Sheet "Draft" cols:  A=Timestamp B=Name(User) C=Type D=Address(User) E=Tags F=MapsLink G=Notes H=Score
//                      (raw archive of every user submission – never deleted)
// Sheet "New" cols:    A=Timestamp B=Name(User) C=Type D=Address(User) E=Tags F=MapsLink G=Notes H=Score
//                      I=Name(Google) J=Address(Google) K=Lat L=Lng M=PlaceID N=Website O=EnrichedAt P=Approved
//                      (deduplicated – only unique entries make it here from Draft)
// Sheet "Edit" cols:   A=Timestamp B=PlaceID C=Name D=Type E=Address F=Tags G=MapsLink H=Notes I=Score J=ChangesSummary K=Approved
// Sheet "Places" cols: A=id B=name C=type D=address E=lat F=lng G=tags(JSON) H=notes
// Sheet "Tags" cols:   A=type B=tag_id C=label
//
// Flow: User submits → Draft (always) → dedupe check → New (if unique) → Approve → Places
// Setup: Deploy as Web App (Execute as: Me, Access: Anyone). Run setupEnrichmentTrigger() once.
//        Run setupApprovalTrigger() once to auto-copy approved rows to "Places".
// Optional: Set MAPS_API_KEY in Project Settings → Script Properties (Places API must be enabled).

var SPREADSHEET_ID = '1rixpqkzB-msw_whxJpPXIb4Y75o3h9_G_AgWoTYT2jA';

function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var ts    = new Date().toLocaleString('en-FI', { timeZone: 'Europe/Helsinki' });
    var score = (data.score != null) ? Number(data.score).toFixed(2) : '';

    if (data.formType === 'new') {
      var newRow = [ts, data.name||'', data.type||'', data.address||'', data.tags||'', data.gmaps||'', data.notes||'', score];

      // 1. Always archive to Draft
      var draft = ss.getSheetByName('Draft');
      if (draft) draft.appendRow(newRow);

      // 2. Deduplicate: only add to "New" if not already present
      var newSheet = ss.getSheetByName('New');
      if (!newSheet) return respond({ error: 'Sheet "New" not found' });

      var mapsLink = (data.gmaps || '').toString().trim();
      var submittedName = (data.name || '').toString().trim().toLowerCase();
      if (!isDuplicateInPlaces(ss, mapsLink, submittedName) && (!mapsLink || !isDuplicateInNew(newSheet, mapsLink))) {
        newSheet.appendRow(newRow);
      }

    } else if (data.formType === 'edit') {
      var editSheet = ss.getSheetByName('Edit');
      if (!editSheet) return respond({ error: 'Sheet "Edit" not found' });
      editSheet.appendRow([ts, data.placeId||'', data.name||'', data.type||'', data.address||'', data.tags||'', data.gmaps||'', data.notes||'', score, data.changesSummary||'']);

    } else {
      return respond({ error: 'Unknown formType: ' + data.formType });
    }

    return respond({ success: true });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// Checks if a Maps link already exists in the "New" sheet (col F) or if enriched
// lat/lng match within ~50 m of an existing enriched row (cols K/L).
function isDuplicateInNew(newSheet, mapsLink) {
  var rows = newSheet.getDataRange().getValues();
  var normLink = normaliseMapsLink(mapsLink);

  for (var i = 1; i < rows.length; i++) {
    // Check Maps link match (col F = index 5)
    var existingLink = normaliseMapsLink((rows[i][5] || '').toString().trim());
    if (normLink && existingLink && normLink === existingLink) return true;
  }
  return false;
}

// Checks if a place already exists in the "Places" sheet by name match or
// by comparing the Maps link against known data.
function isDuplicateInPlaces(ss, mapsLink, submittedName) {
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return false;
  var rows = sheet.getDataRange().getValues();
  var normLink = normaliseMapsLink(mapsLink);

  for (var i = 1; i < rows.length; i++) {
    // Name match (col B = index 1)
    var existingName = (rows[i][1] || '').toString().trim().toLowerCase();
    if (submittedName && existingName && submittedName === existingName) return true;

    // Address match (col D = index 3) — compare against submitted name in case user typed address as name
    var existingAddr = (rows[i][3] || '').toString().trim().toLowerCase();
    if (submittedName && existingAddr && existingAddr.indexOf(submittedName) !== -1) return true;
  }
  return false;
}

// Strips tracking params and protocol to get a comparable Maps link.
function normaliseMapsLink(url) {
  if (!url) return '';
  url = url.trim().toLowerCase();
  url = url.replace(/^https?:\/\//, '');               // strip protocol
  url = url.replace(/\/(#.*|\?.*)?$/, '');              // strip trailing hash/query on path
  // For short links (maps.app.goo.gl), strip query params that vary between shares
  if (url.indexOf('maps.app.goo.gl') !== -1 || url.indexOf('goo.gl') !== -1) {
    url = url.split('?')[0].split('#')[0];
  }
  return url;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'status';

  if (action === 'all') {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('all_v1');
    if (cached) {
      Logger.log('doGet: cache hit');
      return respondCORS(JSON.parse(cached));
    }
    var data = { places: getPlacesJSON(), tags: getTagsJSON() };
    try { cache.put('all_v1', JSON.stringify(data), 300); } catch (_) {} // 5-min cache
    return respondCORS(data);
  }

  if (action === 'places') return respondCORS(getPlacesJSON());
  if (action === 'tags')   return respondCORS(getTagsJSON());

  return respondCORS({ status: 'alive' });
}

// Clears the Apps Script data cache (call after any Places sheet change).
function invalidateCache() {
  CacheService.getScriptCache().remove('all_v1');
}

// ── Read "Places" sheet → array identical to the old places.json structure ──
function getPlacesJSON() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return [];

  // Build label→tag_id reverse lookup from Tags sheet
  var labelToId = buildLabelToIdMap(ss);

  var rows = sheet.getDataRange().getValues();
  var places = [];
  for (var i = 1; i < rows.length; i++) {   // skip header row
    var id      = rows[i][0];
    var name    = (rows[i][1] || '').toString().trim();
    var type    = (rows[i][2] || '').toString().trim().toLowerCase();
    var address = (rows[i][3] || '').toString().trim();
    var lat     = parseFloat(rows[i][4]);
    var lng     = parseFloat(rows[i][5]);
    var tagsRaw = (rows[i][6] || '').toString().trim();
    var notes   = (rows[i][7] || '').toString().trim();

    if (!name || isNaN(lat) || isNaN(lng)) continue;  // skip invalid rows

    var tags = {};
    if (tagsRaw) {
      try { tags = JSON.parse(tagsRaw); }
      catch (_) {
        // Fallback: comma-separated tag IDs → { tagId: true }
        tagsRaw.split(',').forEach(function(t) {
          t = t.trim();
          if (t) tags[t] = true;
        });
      }
      tags = normaliseTags(tags, labelToId);
    }

    places.push({ id: Number(id), name: name, type: type, address: address, lat: lat, lng: lng, tags: tags, notes: notes });
  }
  return places;
}

// ── Read "Tags" sheet → object identical to the old tags.json structure ──
function getTagsJSON() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Tags');
  if (!sheet) return {};

  var rows = sheet.getDataRange().getValues();
  var tags = {};
  for (var i = 1; i < rows.length; i++) {   // skip header row
    var type  = (rows[i][0] || '').toString().trim().toLowerCase();
    var tagId = (rows[i][1] || '').toString().trim();
    var label = (rows[i][2] || '').toString().trim();
    if (!type || !tagId || !label) continue;

    if (!tags[type]) tags[type] = [];
    tags[type].push({ id: tagId, label: label });
  }
  return tags;
}

// ── Tag normalisation helpers ─────────────────────────────────────────────────

// Builds a lowercase label → tag_id lookup from the Tags sheet.
function buildLabelToIdMap(ss) {
  var sheet = ss.getSheetByName('Tags');
  if (!sheet) return {};
  var rows = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var tagId = (rows[i][1] || '').toString().trim();
    var label = (rows[i][2] || '').toString().trim();
    if (tagId && label) map[label.toLowerCase()] = tagId;
  }
  return map;
}

// Converts label-keyed tags to tag_id-keyed tags.
// Handles: "Has: Label", "Missing: Label", plain "Label", and already-correct "tag_id".
function normaliseTags(tags, labelToId) {
  var out = {};
  for (var key in tags) {
    if (!tags.hasOwnProperty(key)) continue;
    var val = tags[key];
    var k = key.trim();
    var positive = true;

    // Strip "Has: " or "Missing: " prefix
    if (k.toLowerCase().indexOf('has: ') === 0) {
      k = k.substring(5).trim();
      positive = true;
    } else if (k.toLowerCase().indexOf('missing: ') === 0) {
      k = k.substring(9).trim();
      positive = false;
    }

    // Look up by label → tag_id
    var resolved = labelToId[k.toLowerCase()];
    if (resolved) {
      out[resolved] = positive;
    } else {
      // Already a tag_id or unknown — keep as-is
      out[key] = val;
    }
  }
  return out;
}

// Parses a comma-separated tag string into { tag_id: true/false }.
// Format: "tag1,tag2,!tag3" where ! prefix means false (missing).
// Also handles legacy "Has: Label, Missing: Label | ..." format.
function parseTagString(raw) {
  var tags = {};
  if (!raw) return tags;

  // Legacy format: "Has: A, B | Missing: C, D"
  if (raw.indexOf('Has: ') !== -1 || raw.indexOf('Missing: ') !== -1) {
    var parts = raw.split('|');
    for (var p = 0; p < parts.length; p++) {
      var seg = parts[p].trim();
      if (seg.indexOf('Has: ') === 0) {
        seg.substring(5).split(',').forEach(function(t) { t = t.trim(); if (t) tags[t] = true; });
      } else if (seg.indexOf('Missing: ') === 0) {
        seg.substring(9).split(',').forEach(function(t) { t = t.trim(); if (t) tags[t] = false; });
      }
    }
    return tags;
  }

  // New format: "tag1,tag2,!tag3"
  raw.split(',').forEach(function(t) {
    t = t.trim();
    if (!t) return;
    if (t.charAt(0) === '!') {
      tags[t.substring(1)] = false;
    } else {
      tags[t] = true;
    }
  });
  return tags;
}

function respondCORS(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor to install the 5-minute recurring trigger.
function setupEnrichmentTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enrichPendingRows') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enrichPendingRows').timeBased().everyMinutes(5).create();
  Logger.log('Trigger created.');
}

// Run once from the editor to install the onEdit trigger for approval workflow.
function setupApprovalTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onSheetEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SPREADSHEET_ID).onEdit().create();
  Logger.log('Approval onEdit trigger created.');
}

// Run ONCE to migrate existing Places sheet tags from label-keyed
// (e.g. {"Has: 5 Daily":true,"Missing: Eid Prayer":true})
// to tag_id-keyed (e.g. {"daily_prayers":true,"eid_prayer":false}).
// Safe to re-run — already-correct rows are left unchanged.
function migrateTagsToIds() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Places');
  if (!sheet) { Logger.log('"Places" sheet not found.'); return; }

  var labelToId = buildLabelToIdMap(ss);
  var rows = sheet.getDataRange().getValues();
  var fixed = 0;

  for (var i = 1; i < rows.length; i++) {
    var tagsRaw = (rows[i][6] || '').toString().trim();
    if (!tagsRaw) continue;

    var tags;
    try { tags = JSON.parse(tagsRaw); } catch (_) { continue; }

    var normalised = normaliseTags(tags, labelToId);
    var newJson = JSON.stringify(normalised);
    if (newJson !== tagsRaw) {
      sheet.getRange(i + 1, 7).setValue(newJson);  // col G = tags
      fixed++;
      Logger.log('Row ' + (i + 1) + ': ' + tagsRaw + ' → ' + newJson);
    }
  }
  Logger.log('migrateTagsToIds: fixed ' + fixed + ' of ' + (rows.length - 1) + ' rows.');
}

// Run ONCE to copy all existing "New" rows into "Draft" as a backup.
// Creates the "Draft" sheet if it doesn't exist. Safe to re-run (appends).
function backupNewToDraft() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var src   = ss.getSheetByName('New');
  if (!src) { Logger.log('"New" sheet not found.'); return; }
  var draft = ss.getSheetByName('Draft');
  if (!draft) {
    draft = ss.insertSheet('Draft');
    draft.appendRow(['Timestamp', 'Name (User)', 'Type', 'Address (User)', 'Tags', 'Maps Link', 'Notes', 'Score']);
  }
  var rows = src.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    // Copy cols A–H only (no enrichment or Approved columns in Draft)
    draft.appendRow([rows[i][0], rows[i][1], rows[i][2], rows[i][3], rows[i][4], rows[i][5], rows[i][6], rows[i][7]]);
  }
  Logger.log('Backed up ' + (rows.length - 1) + ' rows from New → Draft.');
}

// Run ONCE to deduplicate existing "New" sheet rows by Maps link.
// Keeps the first occurrence, removes later duplicates.
function deduplicateNewSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('New');
  if (!sheet) { Logger.log('"New" sheet not found.'); return; }

  var rows  = sheet.getDataRange().getValues();
  var seen  = {};
  var toDelete = [];

  for (var i = 1; i < rows.length; i++) {
    var link = normaliseMapsLink((rows[i][5] || '').toString().trim());
    if (!link) continue;
    if (seen[link]) {
      toDelete.push(i + 1); // 1-indexed row number
    } else {
      seen[link] = true;
    }
  }

  // Delete from bottom to top so row indices stay valid
  for (var j = toDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(toDelete[j]);
  }
  Logger.log('Removed ' + toDelete.length + ' duplicate rows from "New".');
}

// ── Approval workflow: copies row to "Places" when Approved = Yes ───────────
function onSheetEdit(e) {
  if (!e || !e.range) return;
  var sheet     = e.range.getSheet();
  var sheetName = sheet.getName();
  var col       = e.range.getColumn();
  var row       = e.range.getRow();
  var val       = (e.value || '').toString().trim().toLowerCase();

  // "New" sheet: Approved is col P (16)
  if (sheetName === 'New' && col === 16 && val === 'yes') {
    copyNewRowToPlaces(sheet, row);
  }
  // "New" sheet: data edit in cols A–H → trigger enrichment for unenriched rows
  if (sheetName === 'New' && col <= 8 && row > 1) {
    enrichPendingRows();
  }
  // "Edit" sheet: Approved is col K (11)
  if (sheetName === 'Edit' && col === 11 && val === 'yes') {
    applyEditToPlaces(sheet, row);
  }
}

// Copies an approved "New" row into the "Places" sheet.
// Priority: Google-enriched name/address → fallback to user-submitted name/address.
function copyNewRowToPlaces(srcSheet, row) {
  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var places = ss.getSheetByName('Places');
  if (!places) { Logger.log('Sheet "Places" not found.'); return; }

  var r = srcSheet.getRange(row, 1, 1, 16).getValues()[0];
  // New cols: 0=Timestamp 1=Name(User) 2=Type 3=Address(User) 4=Tags 5=MapsLink 6=Notes 7=Score
  //           8=Name(Google) 9=Address(Google) 10=Lat 11=Lng 12=PlaceID 13=Website 14=EnrichedAt 15=Approved

  var name    = (r[8] || '').toString().trim() || (r[1] || '').toString().trim();  // Google name → User name
  var type    = (r[2] || '').toString().trim().toLowerCase();
  var address = (r[9] || '').toString().trim() || (r[3] || '').toString().trim();  // Google addr → User addr
  var lat     = r[10];
  var lng     = r[11];
  var tagsRaw = (r[4] || '').toString().trim();   // submitted as "tag1,tag2,..."
  var notes   = (r[6] || '').toString().trim();

  if (!name || !lat || !lng) { Logger.log('Row ' + row + ': missing name/lat/lng, skipping.'); return; }

  // Build tags JSON: { "tag_id": true/false }
  var tags = parseTagString(tagsRaw);

  // Generate next ID: max existing ID + 1
  var nextId = 1;
  var existingRows = places.getDataRange().getValues();
  for (var i = 1; i < existingRows.length; i++) {
    var eid = Number(existingRows[i][0]);
    if (eid >= nextId) nextId = eid + 1;
  }

  places.appendRow([nextId, name, type, address, lat, lng, JSON.stringify(tags), notes]);
  invalidateCache();
  Logger.log('Approved new place: "' + name + '" → Places row id=' + nextId);
}

// Applies an approved "Edit" row to an existing place in "Places" sheet.
function applyEditToPlaces(srcSheet, row) {
  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var places = ss.getSheetByName('Places');
  if (!places) { Logger.log('Sheet "Places" not found.'); return; }

  var r = srcSheet.getRange(row, 1, 1, 11).getValues()[0];
  // Edit cols: 0=Timestamp 1=PlaceID 2=Name 3=Type 4=Address 5=Tags 6=MapsLink 7=Notes 8=Score 9=ChangesSummary 10=Approved

  var editPlaceId = Number(r[1]);
  if (!editPlaceId) { Logger.log('Edit row ' + row + ': no PlaceID.'); return; }

  var pRows = places.getDataRange().getValues();
  var targetRow = -1;
  for (var i = 1; i < pRows.length; i++) {
    if (Number(pRows[i][0]) === editPlaceId) { targetRow = i + 1; break; }
  }
  if (targetRow === -1) { Logger.log('Place id=' + editPlaceId + ' not found in Places sheet.'); return; }

  // Only overwrite non-empty edit fields
  var editName    = (r[2] || '').toString().trim();
  var editType    = (r[3] || '').toString().trim().toLowerCase();
  var editAddr    = (r[4] || '').toString().trim();
  var editTagsRaw = (r[5] || '').toString().trim();
  var editNotes   = (r[7] || '').toString().trim();

  if (editName)    places.getRange(targetRow, 2).setValue(editName);
  if (editType)    places.getRange(targetRow, 3).setValue(editType);
  if (editAddr)    places.getRange(targetRow, 4).setValue(editAddr);
  if (editTagsRaw) {
    var tags = parseTagString(editTagsRaw);
    places.getRange(targetRow, 7).setValue(JSON.stringify(tags));
  }
  if (editNotes) places.getRange(targetRow, 8).setValue(editNotes);
  invalidateCache();
  Logger.log('Applied edit to place id=' + editPlaceId + ' at row ' + targetRow);
}

// Fills cols I–O for any "New" row that has a Maps link (col F) but no Enriched At (col O).
function enrichPendingRows() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('New');
  if (!sheet) { Logger.log('Sheet "New" not found.'); return; }

  var rows    = sheet.getDataRange().getValues();
  var count   = 0;
  var MAX_RUN = 10;

  for (var i = 1; i < rows.length; i++) {
    if (count >= MAX_RUN) break;
    var mapsUrl    = (rows[i][5] || '').toString().trim(); // col F
    var enrichedAt = rows[i][14];                          // col O
    if (!mapsUrl || enrichedAt) continue;

    try {
      var resolved = resolveUrl(mapsUrl);
      var parsed   = parseMapsUrl(resolved);

      var googleName    = parsed.name    || '';
      var googleAddress = parsed.address || '';
      var lat           = parsed.lat  !== null ? parsed.lat  : '';
      var lng           = parsed.lng  !== null ? parsed.lng  : '';
      var placeId       = parsed.placeId || '';
      var website       = '';

      // Places API gives richest data (name, address, coords, website)
      if (placeId) {
        var details = getPlaceDetails(placeId);
        if (details.name)              googleName    = details.name;
        if (details.formatted_address) googleAddress = details.formatted_address;
        if (details.geometry && details.geometry.location) {
          lat = details.geometry.location.lat;
          lng = details.geometry.location.lng;
        }
        if (details.website) website = details.website;
      }

      // Reverse-geocode if we have coords but no address yet
      if (!googleAddress && lat !== '' && lng !== '') {
        googleAddress = reverseGeocode(lat, lng);
      }

      // Forward-geocode when we only have a text name but no coords (e.g. iOS ?q= links)
      if (lat === '' && lng === '' && googleName) {
        var geo = forwardGeocode(googleName + (googleAddress ? ', ' + googleAddress : ''));
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          if (!googleAddress) googleAddress = geo.address;
        }
      }

      var ts = new Date().toLocaleString('en-FI', { timeZone: 'Europe/Helsinki' });
      sheet.getRange(i + 1, 9, 1, 7).setValues([[googleName, googleAddress, lat, lng, placeId, website, ts]]);
      count++;
      Utilities.sleep(300);

    } catch (err) {
      Logger.log('Row ' + (i + 1) + ' error: ' + err.message);
      sheet.getRange(i + 1, 15).setValue('Error: ' + err.message.substring(0, 80));
    }
  }
  Logger.log('enrichPendingRows: processed ' + count + ' rows.');
}

// ── Test helper – run manually from the editor, check View → Logs ─────────────
function testUrlParsing() {
  var tests = [
    // ── Known-real URLs from your sheet ───────────────────────────────────────
    { label: 'iOS in-app share (?g_st=ic)',   url: 'https://maps.app.goo.gl/MfgghJ8X4MLei9ti8?g_st=ic' },
    { label: 'iOS plain share (no params)',   url: 'https://maps.app.goo.gl/cyiSWgJBnVZQhQkeA' },
    { label: 'Browser short share (works)',   url: 'https://maps.app.goo.gl/cJ2xqe6noZwjEVCp7' },

    // ── Full google.com/maps variants to test parseMapsUrl directly ────────────
    { label: 'Full desktop URL (!3d/!4d)',
      url: 'https://www.google.com/maps/place/King+Kebab+Malmi/@60.2520932,25.001,17z/data=!3m1!4b1!4m6!3m5!1s0x46920c5b:0x1234!8m2!3d60.2520932!4d25.0033944' },
    { label: '@lat,lng only (no data segment)',
      url: 'https://www.google.com/maps/@60.2520932,25.0033944,17z' },
    { label: '?q= text name only',
      url: 'https://www.google.com/maps?q=King+Kebab+Malmi+Helsinki' },
    { label: '?q= name+address combined (typical iOS resolve target)',
      url: 'https://www.google.com/maps?q=King+Kebab+Malmi%2C+Kirkonkyl%C3%A4ntie+14%2C+00700+Helsinki' },
    { label: '?q= with lat,lng (embed format)',
      url: 'https://www.google.com/maps?q=60.2520932,25.0033944' },
    { label: '?cid= numeric (iOS app direct link)',
      url: 'https://maps.google.com/?cid=12143437781399356067' },
    { label: '?place_id= ChIJ explicit',
      url: 'https://www.google.com/maps/place/?q&place_id=ChIJ4a6B-P4LkkYRV9BQrumzHW4' },
  ];

  tests.forEach(function(t) {
    Logger.log('');
    Logger.log('┌─ ' + t.label);
    Logger.log('│  IN:       ' + t.url);
    var resolved = resolveUrl(t.url);
    Logger.log('│  RESOLVED: ' + resolved);
    var parsed = parseMapsUrl(resolved);
    Logger.log('│  name:    "' + parsed.name + '"');
    Logger.log('│  address: "' + parsed.address + '"');
    Logger.log('│  lat:      ' + parsed.lat + '   lng: ' + parsed.lng);
    Logger.log('│  placeId: "' + parsed.placeId + '"');
    if (parsed.lat && parsed.lng) {
      Logger.log('│  rev-geo: "' + reverseGeocode(parsed.lat, parsed.lng) + '"');
    } else if (!parsed.placeId && parsed.name) {
      var q   = parsed.name + (parsed.address ? ', ' + parsed.address : '');
      var geo = forwardGeocode(q);
      Logger.log('│  fwd-geo: ' + (geo ? geo.lat + ',' + geo.lng + ' → "' + geo.address + '"' : 'no result'));
    }
    Logger.log('└─────────────────────────────────────────────');
  });
}


// ── URL helpers ───────────────────────────────────────────────────────────────

// Strips tracking query params from shortlink hosts (e.g. ?g_st=ic breaks redirect chains).
function normaliseUrl(url) {
  if (!url) return url;
  url = url.trim();
  var shortHosts = ['maps.app.goo.gl', 'goo.gl', 'g.co'];
  for (var i = 0; i < shortHosts.length; i++) {
    if (url.indexOf(shortHosts[i]) !== -1) {
      url = url.split('?')[0].split('#')[0];
      break;
    }
  }
  return url;
}

// Follows redirects (up to 8 hops) to resolve short/app links to a full google.com/maps URL.
function resolveUrl(url) {
  if (!url) return url;
  url = normaliseUrl(url);
  if (url.indexOf('google.com/maps') !== -1 || url.indexOf('maps.google.com') !== -1) return url;

  var current = url;
  for (var hop = 1; hop <= 8; hop++) {
    try {
      var resp = UrlFetchApp.fetch(current, { followRedirects: false, muteHttpExceptions: true });
      var code = resp.getResponseCode();
      Logger.log('resolveUrl hop ' + hop + ': HTTP ' + code + ' – ' + current);

      if (code >= 300 && code < 400) {
        var hdrs = resp.getHeaders();
        var next = hdrs['Location'] || hdrs['location'] || '';
        if (!next) break;
        if (next.charAt(0) === '/') {
          var origin = current.match(/^(https?:\/\/[^\/]+)/);
          next = origin ? origin[1] + next : next;
        }
        next = normaliseUrl(next);
        current = next;
        if (current.indexOf('google.com/maps') !== -1 || current.indexOf('maps.google.com') !== -1) return current;
      } else if (code === 200) {
        var body      = resp.getContentText();
        var metaMatch = body.match(/url=([^"'>\s]+google\.com\/maps[^"'>\s]*)/i);
        if (metaMatch) return metaMatch[1];
        break;
      } else {
        break;
      }
    } catch (err) {
      Logger.log('resolveUrl hop ' + hop + ' error: ' + err.message);
      break;
    }
  }
  Logger.log('resolveUrl final: ' + current);
  return current;
}

// Extracts { name, address, lat, lng, placeId } from any resolved google.com/maps URL.
function parseMapsUrl(url) {
  var result = { name: '', address: '', lat: null, lng: null, placeId: '' };
  if (!url) return result;

  // 1. Best coords: !3d/!4d data segment (most precise, present in full share URLs)
  var d3 = url.match(/!3d(-?\d+\.\d+)/);
  var d4 = url.match(/!4d(-?\d+\.\d+)/);
  if (d3 && d4) {
    result.lat = parseFloat(d3[1]);
    result.lng = parseFloat(d4[1]);
  }

  // 2. Fallback coords: @lat,lng
  if (result.lat === null) {
    var atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) { result.lat = parseFloat(atMatch[1]); result.lng = parseFloat(atMatch[2]); }
  }

  // 3. Fallback coords: ?q=lat,lng (embed / directions format)
  if (result.lat === null) {
    var qCoord = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qCoord) { result.lat = parseFloat(qCoord[1]); result.lng = parseFloat(qCoord[2]); }
  }

  // 4. Place name from URL path /maps/place/NAME/
  var nameMatch = url.match(/\/maps\/place\/([^\/@?]+)/);
  if (nameMatch) {
    try   { result.name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')); }
    catch (e) { result.name = nameMatch[1].replace(/\+/g, ' '); }
  }

  // 5. ?q= text value – may be "Name" alone or "Name, Street, City" combined
  if (!result.name) {
    var qText = url.match(/[?&]q=([^&]+)/);
    if (qText) {
      var raw = '';
      try { raw = decodeURIComponent(qText[1].replace(/\+/g, ' ')).trim(); } catch(e) { raw = qText[1]; }
      if (!/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(raw)) {
        // Split "Name, Street, City" so enrichPendingRows gets a clean name vs address
        if (raw.indexOf(',') !== -1) {
          var parts      = raw.split(',');
          result.name    = parts[0].trim();
          result.address = parts.slice(1).join(',').trim();
        } else {
          result.name = raw;
        }
      }
    }
  }

  // 6. iOS app share: ?cid=12345 – Places API accepts "cid:12345" as a place_id
  var cidMatch = url.match(/[?&]cid=(\d+)/);
  if (cidMatch) result.placeId = 'cid:' + cidMatch[1];

  // 7. Explicit ?place_id=ChIJ...
  if (!result.placeId) {
    var pidParam = url.match(/[?&]place_id=(ChIJ[^&]+)/);
    if (pidParam) {
      try { result.placeId = decodeURIComponent(pidParam[1]); } catch(e) { result.placeId = pidParam[1]; }
    }
  }

  // 8. ChIJ Place ID in data segment: !1sChIJ...
  if (!result.placeId) {
    var pidData = url.match(/!1s(ChIJ[^!&]+)/);
    if (pidData) {
      try { result.placeId = decodeURIComponent(pidData[1]); } catch(e) { result.placeId = pidData[1]; }
    }
  }

  Logger.log('parseMapsUrl → name:"' + result.name + '" addr:"' + result.address + '" lat:' + result.lat + ' lng:' + result.lng + ' pid:"' + result.placeId + '"');
  return result;
}

// Reverse-geocodes lat/lng → formatted address string (no API key required).
function reverseGeocode(lat, lng) {
  try {
    var resp = Maps.newGeocoder().setLanguage('en').reverseGeocode(parseFloat(lat), parseFloat(lng));
    if (resp.status === 'OK' && resp.results.length > 0) return resp.results[0].formatted_address;
  } catch (err) { Logger.log('reverseGeocode error: ' + err.message); }
  return '';
}

// Forward-geocodes a text query → { lat, lng, address } (no API key required).
function forwardGeocode(query) {
  try {
    var resp = Maps.newGeocoder().setLanguage('en').geocode(query);
    if (resp.status === 'OK' && resp.results.length > 0) {
      var r = resp.results[0];
      return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: r.formatted_address };
    }
  } catch (err) { Logger.log('forwardGeocode error: ' + err.message); }
  return null;
}

// Gets rich place data from the Places API (requires MAPS_API_KEY in Script Properties).
function getPlaceDetails(placeId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
  if (!apiKey || !placeId) return {};
  try {
    var url  = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + encodeURIComponent(placeId) + '&fields=name,formatted_address,geometry,website&key=' + apiKey;
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());
    if (data.status === 'OK') return data.result;
    Logger.log('Places API status: ' + data.status);
  } catch (err) { Logger.log('getPlaceDetails error: ' + err.message); }
  return {};
}


var respond = respondCORS;  // legacy alias used by doPost
