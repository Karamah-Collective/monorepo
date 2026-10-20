// Halal Finder Helsinki – Google Apps Script Web App
// Sheet: https://docs.google.com/spreadsheets/d/1rixpqkzB-msw_whxJpPXIb4Y75o3h9_G_AgWoTYT2jA
//
// Sheet "Draft" cols:  A=Timestamp B=Name(User) C=Type D=Address(User) E=Tags F=MapsLink G=Notes H=Score I=OpeningHours(JSON)
//                      (raw archive of every user submission – never deleted)
// Sheet "New" cols:    A=Timestamp B=Name(User) C=Type D=Address(User) E=Tags F=MapsLink G=Notes H=Score
//                      I=Name(Google) J=Address(Google) K=Lat L=Lng M=PlaceID N=Website O=EnrichedAt P=Approved Q=OpeningHours(JSON)
//                      (deduplicated – only unique entries make it here from Draft)
// Sheet "Edit" cols:   A=Timestamp B=PlaceID C=Name D=Type E=Address F=Tags G=MapsLink H=Notes I=Score J=ChangesSummary K=Approved L=OpeningHours(JSON)
// Sheet "Contact" cols: A=Timestamp B=Name C=Email D=Phone E=Message F=Score
// Sheet "Places" cols: A=id B=name C=type D=address E=lat F=lng G=tags(JSON) H=notes I=boycott
//                      J=sponsor_tier K=sponsor_promo L=sponsor_promo_text M=sponsor_start_date N=sponsor_end_date O=opening_hours(JSON)
// Sheet "Tags" cols:   A=type B=tag_id C=label
//
// Flow: User submits → Draft (always) → dedupe check → New (if unique) → Approve → Places
// Setup: Deploy as Web App (Execute as: Me, Access: Anyone). Create an onEdit trigger for onSheetEdit().
// Optional: Set MAPS_API_KEY in Project Settings → Script Properties (Places API must be enabled).

var SPREADSHEET_ID = '1rixpqkzB-msw_whxJpPXIb4Y75o3h9_G_AgWoTYT2jA';
var CONTACT_HEADERS = ['Timestamp', 'Name', 'Email', 'Phone', 'Message', 'Score', 'Replied'];

function doPost(e) {
  // Self-contained helper — never depends on outer scope, can never be undefined.
  function respond(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var data  = JSON.parse(e.postData.contents);
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var ts    = new Date().toLocaleString('en-FI', { timeZone: 'Europe/Helsinki' });
    var score = (data.score != null) ? Number(data.score).toFixed(2) : '';

    // ── Admin POST actions ──
    var adminPostActions = ['approve-new', 'reject-new', 'approve-edit', 'reject-edit', 'update-boycott', 'update-sponsor', 'update-contact-replied', 'update-wish-approved', 'update-wish-implemented', 'approve-event', 'reject-event', 'approve-event-edit', 'reject-event-edit', 'approve-review', 'reject-review', 'approve-eid', 'reject-eid'];
    if (data.action && adminPostActions.indexOf(data.action) !== -1) {
      if (!data.adminKey || data.adminKey !== getAdminSecret()) {
        return respond({ error: 'Unauthorized' });
      }
      return respond(handleAdminPost(data));
    }

    if (data.formType === 'new') {
      // Persist any user-added cuisine tags to the Tags sheet
      if (data.newCuisines && data.newCuisines.length) addNewCuisineTags(ss, data.newCuisines);

      var openingHours = (data.openingHours || '').toString().trim();
      var newRow = [ts, data.name||'', data.type||'', data.address||'', data.tags||'', data.gmaps||'', data.notes||'', score];

      // 1. Always archive to Draft — auto-create sheet if missing
      var draft = ss.getSheetByName('Draft');
      if (!draft) {
        draft = ss.insertSheet('Draft');
        draft.appendRow(['Timestamp', 'Name (User)', 'Type', 'Address (User)', 'Tags', 'Maps Link', 'Notes', 'Score', 'OpeningHours']);
      }
      draft.appendRow(newRow);
      if (openingHours) draft.getRange(draft.getLastRow(), 9).setValue(openingHours);

      // 2. Deduplicate: only add to "New" if not already present
      var newSheet = ss.getSheetByName('New');
      if (!newSheet) return respond({ error: 'Sheet "New" not found' });

      var mapsLink = (data.gmaps || '').toString().trim();
      var submittedName = (data.name || '').toString().trim().toLowerCase();
      var submittedType = (data.type || '').toString().trim().toLowerCase();
      var pinLat = data.pinLat != null ? parseFloat(data.pinLat) : null;
      var pinLng = data.pinLng != null ? parseFloat(data.pinLng) : null;
      var hasPin = pinLat != null && pinLng != null && !isNaN(pinLat) && !isNaN(pinLng);

      // Reject pin submissions outside Finland (still archived in Draft above)
      if (hasPin && !isInsideFinlandBounds(pinLat, pinLng)) {
        return respond({ error: 'Location must be inside Finland' });
      }

      // Comprehensive dedup: check approved Places then pending New
      var isDupe = isDuplicateInPlaces(ss, mapsLink, submittedName, submittedType, pinLat, pinLng);
      if (!isDupe) isDupe = isDuplicateInNew(newSheet, mapsLink, submittedName, submittedType, pinLat, pinLng);

      if (!isDupe) {
        newSheet.appendRow(newRow);
        var newRowIdx = newSheet.getLastRow();

        if (hasPin) {
          // Pin submission: pre-fill enrichment columns directly
          var googleAddress = '';
          try { googleAddress = reverseGeocode(pinLat, pinLng) || ''; } catch(_) {}
          var enrichTs = new Date().toLocaleString('en-FI', { timeZone: 'Europe/Helsinki' });
          // Cols I–O: Name(Google), Address(Google), Lat, Lng, PlaceID, Website, EnrichedAt
          newSheet.getRange(newRowIdx, 9, 1, 7).setValues([[
            data.name || '',           // Use submitted name (no Google name available)
            googleAddress || data.address || '',
            pinLat,
            pinLng,
            '',                        // No placeId
            '',                        // No website
            'pin:' + enrichTs          // Mark source as pin
          ]]);
          if (openingHours) newSheet.getRange(newRowIdx, 17).setValue(openingHours);
        } else if (mapsLink) {
          enrichPendingRows();
        }
        // Store user-submitted opening hours in New col Q (if not pin, which was handled above)
        if (openingHours && !hasPin) {
          var lastNewRow = newSheet.getLastRow();
          newSheet.getRange(lastNewRow, 17).setValue(openingHours);
        }
      }

    } else if (data.formType === 'edit') {
      // Persist any user-added cuisine tags to the Tags sheet
      if (data.newCuisines && data.newCuisines.length) addNewCuisineTags(ss, data.newCuisines);

      // Auto-create Edit sheet if missing
      var editSheet = ss.getSheetByName('Edit');
      if (!editSheet) {
        editSheet = ss.insertSheet('Edit');
        editSheet.appendRow(['Timestamp', 'PlaceID', 'Name', 'Type', 'Address', 'Tags', 'Maps Link', 'Notes', 'Score', 'Changes Summary', 'Approved']);
      }
      var editHours = (data.openingHours || '').toString().trim();
      editSheet.appendRow([ts, data.placeId||'', data.name||'', data.type||'', data.address||'', data.tags||'', data.gmaps||'', data.notes||'', score, data.changesSummary||'', '', editHours]);

    } else if (data.formType === 'contact') {
      var contactSheet = ensureContactSheet(ss);
      contactSheet.appendRow([ts, data.name||'', data.email||'', data.phone||'', data.message||'', score, '']);

    } else if (data.formType === 'wish') {
      var wishSheet = ensureWishSheet(ss);

      if (data.action === 'add') {
        var wishId = Utilities.getUuid();
        wishSheet.appendRow([wishId, data.title||'', data.description||'', 0, ts, '', data.name||'', data.email||'', '', '']);
        return respond({ success: true, wishId: wishId });

      } else if (data.action === 'vote') {
        var wRows = wishSheet.getDataRange().getValues();
        var found = false;
        for (var w = 1; w < wRows.length; w++) {
          if (wRows[w][0] === data.wishId) {
            // Toggle device vote state (col F = voted devices, comma-separated)
            var votedDevices = (wRows[w][5] || '').toString();
            var deviceList = votedDevices ? votedDevices.split(',').filter(Boolean) : [];
            var existingIdx = deviceList.indexOf(data.deviceId);
            var currentCount = parseInt(wRows[w][3], 10) || 0;
            var newCount;

            if (existingIdx !== -1) {
              deviceList.splice(existingIdx, 1);
              newCount = Math.max(0, currentCount - 1);
              wishSheet.getRange(w + 1, 4).setValue(newCount);
              wishSheet.getRange(w + 1, 6).setValue(deviceList.join(','));
              found = true;
              return respond({ success: true, votes: newCount, voted: false });
            }

            // Increment vote count (col D)
            newCount = currentCount + 1;
            wishSheet.getRange(w + 1, 4).setValue(newCount);
            // Append device ID
            deviceList.push(data.deviceId);
            wishSheet.getRange(w + 1, 6).setValue(deviceList.join(','));
            found = true;
            return respond({ success: true, votes: newCount, voted: true });
          }
        }
        if (!found) return respond({ error: 'Wish not found' });
      }

    } else if (data.formType === 'event') {
      var eventSheet = ensureEventSheet(ss);
      var eventId = Utilities.getUuid();
      var newRow = eventSheet.getLastRow() + 1;
      var evLoc = _resolveEventLocation(data);
      eventSheet.appendRow([
        eventId,
        data.placeId || '',
        data.title || '',
        data.description || '',
        data.eventDate || '',
        data.eventTime || '',
        data.endTime || '',
        data.recurring ? 'yes' : '',
        data.recurrencePattern || '',
        data.url || '',
        '',  // approved — empty = pending
        ts,
        '',  // reject_reason
        evLoc.locationName,
        evLoc.locationAddress,
        evLoc.lat,
        evLoc.lng,
        (data.organizerName || '').toString().trim(),
        (data.organizerPlaceId || '').toString().trim(),
        evLoc.locationGmapsLink
      ]);
      // Force time cells to plain text in case sheet format was not set
      eventSheet.getRange(newRow, 6, 1, 2).setNumberFormat('@');
      if (evLoc.locationGmapsLink) enrichPendingEventRows();
      invalidateCache();
      return respond({ success: true, eventId: eventId });

    } else if (data.formType === 'event-edit') {
      var eventEditSheet = ensureEventEditSheet(ss);
      var editRow = eventEditSheet.getLastRow() + 1;
      var evEditLoc = _resolveEventLocation(data);
      eventEditSheet.appendRow([
        ts,
        data.eventId || '',
        data.placeId || '',
        data.title || '',
        data.description || '',
        data.eventDate || '',
        data.eventTime || '',
        data.endTime || '',
        data.recurring ? 'yes' : '',
        data.recurrencePattern || '',
        data.url || '',
        score,
        data.changesSummary || '',
        '',  // approved — empty = pending
        '',  // reject_reason
        evEditLoc.locationName,
        evEditLoc.locationAddress,
        evEditLoc.lat,
        evEditLoc.lng,
        (data.organizerName || '').toString().trim(),
        (data.organizerPlaceId || '').toString().trim(),
        evEditLoc.locationGmapsLink
      ]);
      // Force time cells to plain text in case sheet format was not set
      eventEditSheet.getRange(editRow, 7, 1, 2).setNumberFormat('@');
      return respond({ success: true });

    } else if (data.formType === 'eid') {
      // Eid prayer place submission — writes to "EidNew" with enrichment columns
      var eidNewSheet = ensureEidNewSheet(ss);

      var eidMapsLink = (data.gmaps || '').toString().trim();
      var eidPinLat = data.pinLat != null ? parseFloat(data.pinLat) : null;
      var eidPinLng = data.pinLng != null ? parseFloat(data.pinLng) : null;
      var eidHasPin = eidPinLat != null && eidPinLng != null && !isNaN(eidPinLat) && !isNaN(eidPinLng);

      // Reject pin submissions outside Finland
      if (eidHasPin && !isInsideFinlandBounds(eidPinLat, eidPinLng)) {
        return respond({ error: 'Location must be inside Finland' });
      }

      // EidNew cols: A=Timestamp B=Name(User) C=Address(User) D=MapsLink E=Organizer F=Jamaats G=Date H=Notes I=Score
      //             J=Name(Google) K=Address(Google) L=Lat M=Lng N=PlaceID O=Website P=EnrichedAt Q=Approved
      var eidRow = [
        ts,
        data.name || '',
        data.address || '',
        eidMapsLink,
        data.eidOrganizer || '',
        data.eidJamaats || '',
        data.eidDate || '',
        data.notes || '',
        score
      ];
      eidNewSheet.appendRow(eidRow);
      var eidNewRowIdx = eidNewSheet.getLastRow();
      // Re-write Jamaats (F) and Date (G) with text format set FIRST —
      // appendRow auto-parses time-like strings before setNumberFormat can prevent it
      eidNewSheet.getRange(eidNewRowIdx, 6).setNumberFormat('@').setValue(data.eidJamaats || '');
      eidNewSheet.getRange(eidNewRowIdx, 7).setNumberFormat('@').setValue(data.eidDate || '');

      if (eidHasPin) {
        var eidGeoAddr = '';
        try { eidGeoAddr = reverseGeocode(eidPinLat, eidPinLng) || ''; } catch(_) {}
        var eidEnrichTs = new Date().toLocaleString('en-FI', { timeZone: 'Europe/Helsinki' });
        // Cols J–P: Name(Google), Address(Google), Lat, Lng, PlaceID, Website, EnrichedAt
        eidNewSheet.getRange(eidNewRowIdx, 10, 1, 7).setValues([[
          data.name || '',
          eidGeoAddr || data.address || '',
          eidPinLat,
          eidPinLng,
          '',
          '',
          'pin:' + eidEnrichTs
        ]]);
      } else if (eidMapsLink) {
        enrichEidPendingRows();
      }

      return respond({ success: true });

    } else if (data.formType === 'review') {
      var reviewResult = handleReviewPost(ss, data);
      return respond(reviewResult);

    } else {
      return respond({ error: 'Unknown formType: ' + data.formType });
    }

    return respond({ success: true });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── Fuzzy name helpers for deduplication ──────────────────────────────────────

// Strips noise from a place name for comparison.
// "The Jump Chick - Helsinki" → "jump chick helsinki"
function normaliseName(name) {
  if (!name) return '';
  var n = name.toString().trim().toLowerCase();
  // Strip common business prefixes
  n = n.replace(/^(the|ravintola|restaurant|café|cafe|bar|pizzeria|kebab)\s+/, '');
  // Replace punctuation with spaces (keep accented / Finnish letters)
  n = n.replace(/[-\u2013\u2014.,;:!?'"()\[\]{}\\|@#&_\/]/g, ' ');
  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// Returns true if two names are similar enough to be the same place.
// Exact normalised match, OR one contains the other (shorter ≥ 5 chars).
function namesMatch(a, b) {
  var na = normaliseName(a);
  var nb = normaliseName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // "King Kebab" inside "King Kebab Malmi" → match.
  // Shorter must be ≥5 chars to avoid false positives on tiny strings.
  var shorter = na.length <= nb.length ? na : nb;
  var longer  = na.length > nb.length ? na : nb;
  if (shorter.length >= 5 && longer.indexOf(shorter) !== -1) return true;
  return false;
}

// ── Comprehensive deduplication checks ────────────────────────────────────────

// Checks the "Places" (approved) sheet for duplicates.
// Signals: fuzzy name match, proximity + same type.
function isDuplicateInPlaces(ss, mapsLink, submittedName, submittedType, pinLat, pinLng) {
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return false;
  var rows = sheet.getDataRange().getValues();
  var THRESHOLD = 0.0005; // ~50 m
  var hasPin = pinLat != null && !isNaN(pinLat) && pinLng != null && !isNaN(pinLng);

  for (var i = 1; i < rows.length; i++) {
    var existingName = (rows[i][1] || '').toString().trim();
    var existingType = (rows[i][2] || '').toString().trim().toLowerCase();
    var pLat = parseFloat(rows[i][4]);
    var pLng = parseFloat(rows[i][5]);

    // 1. Fuzzy name match
    if (namesMatch(submittedName, existingName)) return true;

    // 2. Proximity + same type (e.g. two restaurants at same GPS)
    if (hasPin && !isNaN(pLat) && !isNaN(pLng)) {
      if (Math.abs(pLat - pinLat) < THRESHOLD && Math.abs(pLng - pinLng) < THRESHOLD) {
        if (submittedType && existingType && submittedType === existingType) return true;
      }
    }
  }
  return false;
}

// Checks the "New" (pending) sheet for duplicates.
// Signals: Maps link, fuzzy name (user + Google), proximity + same type.
function isDuplicateInNew(newSheet, mapsLink, submittedName, submittedType, pinLat, pinLng) {
  var rows = newSheet.getDataRange().getValues();
  var normLink = normaliseMapsLink(mapsLink);
  var THRESHOLD = 0.0005; // ~50 m
  var hasPin = pinLat != null && !isNaN(pinLat) && pinLng != null && !isNaN(pinLng);

  for (var i = 1; i < rows.length; i++) {
    // 1. Maps link match (col F = index 5)
    var existingLink = normaliseMapsLink((rows[i][5] || '').toString().trim());
    if (normLink && existingLink && normLink === existingLink) return true;

    // 2. Fuzzy name match against user-submitted name (col B = index 1)
    var existingUserName = (rows[i][1] || '').toString().trim();
    if (namesMatch(submittedName, existingUserName)) return true;

    // 3. Fuzzy name match against Google-enriched name (col I = index 8)
    var existingGoogleName = (rows[i][8] || '').toString().trim();
    if (existingGoogleName && namesMatch(submittedName, existingGoogleName)) return true;

    // 4. Proximity + same type (enriched coords: col K = index 10, col L = index 11)
    if (hasPin) {
      var eLat = parseFloat(rows[i][10]);
      var eLng = parseFloat(rows[i][11]);
      if (!isNaN(eLat) && !isNaN(eLng)) {
        if (Math.abs(eLat - pinLat) < THRESHOLD && Math.abs(eLng - pinLng) < THRESHOLD) {
          var existingType = (rows[i][2] || '').toString().trim().toLowerCase();
          if (submittedType && existingType && submittedType === existingType) return true;
        }
      }
    }
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

// ── Address normalisation ─────────────────────────────────────────────────────
// Swedish → Finnish city name mapping (official bilingual municipalities).
var SWEDISH_TO_FINNISH = {
  'helsingfors': 'Helsinki',
  'esbo': 'Espoo',
  'vanda': 'Vantaa',
  'åbo': 'Turku',
  'tammerfors': 'Tampere',
  'uleåborg': 'Oulu',
  'borgå': 'Porvoo',
  'lovisa': 'Loviisa',
  'raseborg': 'Raasepori',
  'hangö': 'Hanko',
  'ekenäs': 'Tammisaari',
  'grankulla': 'Kauniainen',
  'kyrkslätt': 'Kirkkonummi',
  'sibbo': 'Sipoo',
  'kervo': 'Kerava',
  'träskända': 'Järvenpää',
  'tusby': 'Tuusula',
  'nurmijärvi': 'Nurmijärvi',
  'hyvinge': 'Hyvinkää',
  'riihimäki': 'Riihimäki',
  'tavastehus': 'Hämeenlinna',
  'lahtis': 'Lahti',
  'kouvola': 'Kouvola',
  'kotka': 'Kotka',
  'villmanstrand': 'Lappeenranta',
  's:t michel': 'Mikkeli',
  'saint michel': 'Mikkeli',
  'kuopio': 'Kuopio',
  'joensuu': 'Joensuu',
  'jyväskylä': 'Jyväskylä',
  'seinäjoki': 'Seinäjoki',
  'vasa': 'Vaasa',
  'jakobstad': 'Pietarsaari',
  'karleby': 'Kokkola',
  'nykarleby': 'Uusikaarlepyy',
  'kristinestad': 'Kristiinankaupunki',
  'kaskö': 'Kaskinen',
  'närpes': 'Närpiö',
  'kronoby': 'Kruunupyy',
  'pedersöre': 'Pedersören kunta',
  'larsmo': 'Luoto',
  'nådendal': 'Naantali',
  'raumo': 'Rauma',
  'björneborg': 'Pori',
  'mariehamn': 'Maarianhamina',
  'pargas': 'Parainen',
  'kimitoön': 'Kemiönsaari',
  's:t karins': 'Kaarina',
  'saint karins': 'Kaarina',
  'lojo': 'Lohja',
  'ingå': 'Inkoo',
  'sjundeå': 'Siuntio',
  'vichtis': 'Vihti',
  'mäntsälä': 'Mäntsälä'
};

// Normalises a Finnish address: strips ", Finland" / ", Suomi" and
// replaces Swedish city names with their Finnish equivalents.
function normaliseAddress(address) {
  if (!address) return '';
  var a = address.toString().trim();

  // Strip trailing country: ", Finland" or ", Suomi" (case-insensitive)
  a = a.replace(/,\s*(Finland|Suomi)\s*$/i, '');

  // Replace Swedish city names anywhere they appear as a "word" in the address.
  // We match the last comma-separated segment that looks like a city (after postal code).
  var parts = a.split(',');
  for (var i = 0; i < parts.length; i++) {
    // Strip leading/trailing whitespace and any postal code prefix for lookup
    var segment = parts[i].trim();
    var cityPart = segment.replace(/^\d{5}\s+/, '').trim();
    var key = cityPart.toLowerCase();
    if (SWEDISH_TO_FINNISH[key]) {
      // Reconstruct segment preserving postal code if present
      parts[i] = segment.replace(new RegExp(cityPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), SWEDISH_TO_FINNISH[key]);
    }
  }
  a = parts.join(',');

  return a.trim();
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'status';

  // ── Admin endpoints (guarded by ADMIN_SECRET) ──
  var adminActions = ['pending-new', 'pending-edits', 'admin-places', 'admin-stats', 'admin-contact', 'admin-wishes', 'pending-events', 'pending-event-edits', 'admin-reviews', 'pending-eid'];
  if (adminActions.indexOf(action) !== -1) {
    if (!verifyAdminKey(e)) return respondCORS({ error: 'Unauthorized' });
    if (action === 'admin-stats')         return respondCORS(getAdminStats());
    if (action === 'pending-new')         return respondCORS(getPendingNew());
    if (action === 'pending-edits')       return respondCORS(getPendingEdits());
    if (action === 'admin-places')        return respondCORS(getAdminPlaces());
    if (action === 'admin-contact')       return respondCORS(getAdminContacts());
    if (action === 'admin-wishes')        return respondCORS(getAdminWishes());
    if (action === 'pending-events')      return respondCORS(getPendingEvents());
    if (action === 'pending-event-edits') return respondCORS(getPendingEventEdits());
    if (action === 'admin-reviews')       return respondCORS(getAdminReviews());
    if (action === 'pending-eid')         return respondCORS(getPendingEid());
  }

  if (action === 'all') {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('all_v2');
    if (cached) {
      Logger.log('doGet: cache hit');
      return respondCORS(JSON.parse(cached));
    }
    var data = { places: getPlacesJSON(), tags: getTagsJSON(), events: getEventsJSON(), reviews: getReviewsJSON().reviews };
    try { cache.put('all_v2', JSON.stringify(data), 300); } catch (_) {} // 5-min cache
    return respondCORS(data);
  }

  if (action === 'places') return respondCORS(getPlacesJSON());
  if (action === 'tags')   return respondCORS(getTagsJSON());
  if (action === 'events') return respondCORS(getEventsJSON());
  if (action === 'eid')    return respondCORS(getEidPrayersJSON());
  if (action === 'wishes') return respondCORS(getWishesJSON());
  if (action === 'reviews') return respondCORS(getReviewsJSON());

  if (action === 'backup') {
    var url = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/export?format=xlsx';
    var resp = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      return respondCORS({ error: 'Export failed: HTTP ' + resp.getResponseCode() });
    }
    return respondCORS({ data: Utilities.base64Encode(resp.getBlob().getBytes()) });
  }

  return respondCORS({ status: 'alive' });
}

// Clears the Apps Script data cache (call after any Places/Events sheet change).
function invalidateCache() {
  var cache = CacheService.getScriptCache();
  cache.remove('all_v2');
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
    var city    = extractCityFromAddress(address);
    var lat     = parseFloat(rows[i][4]);
    var lng     = parseFloat(rows[i][5]);
    var tagsRaw  = (rows[i][6] || '').toString().trim();
    var notes    = (rows[i][7] || '').toString().trim();
    var boycott  = (rows[i][8] || '').toString().trim().toLowerCase() === 'yes';

    // Sponsor columns J–N (indices 9–13)
    var sponsorTier = (rows[i][9] || '').toString().trim().toLowerCase();  // basic | featured | spotlight
    var sponsorCTA  = (rows[i][10] || '').toString().trim();               // promo code
    var sponsorText = (rows[i][11] || '').toString().trim();               // promo text
    var sponsorStart = formatSheetDate((rows[i][12] || '').toString().trim(), rows[i][12]); // start date
    var sponsorEnd   = formatSheetDate((rows[i][13] || '').toString().trim(), rows[i][13]); // end date

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

    var place = { id: (id || '').toString().trim(), name: name, type: type, address: address, city: city, lat: lat, lng: lng, tags: tags, notes: notes };
    if (boycott) place.boycott = true;

    // Opening hours column O (index 14)
    var hoursRaw = (rows[i][14] || '').toString().trim();
    if (hoursRaw) {
      try { place.hours = JSON.parse(hoursRaw); } catch (_) {}
    }

    // Sponsor fields — boycott always suppresses sponsorship
    if (!boycott && sponsorTier && ['basic', 'featured', 'spotlight'].indexOf(sponsorTier) !== -1 && isSponsorActiveForDate(sponsorStart, sponsorEnd)) {
      place.sponsor = { tier: sponsorTier };
      if (sponsorCTA) place.sponsor.cta = sponsorCTA;
      if (sponsorText) place.sponsor.text = sponsorText;
      if (sponsorStart) place.sponsor.startDate = sponsorStart;
      if (sponsorEnd) place.sponsor.endDate = sponsorEnd;
    }
    places.push(place);
  }
  return places;
}

function extractCityFromAddress(address) {
  var raw = (address || '').toString().trim();
  if (!raw) return '';

  var parts = raw.split(',').map(function(part) {
    return part.trim();
  }).filter(Boolean);

  if (!parts.length) return '';

  var tail = parts[parts.length - 1];
  if (/^finland$/i.test(tail) && parts.length > 1) tail = parts[parts.length - 2];

  tail = tail.replace(/^\d{5}\s+/, '').trim();
  return tail;
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

// ── Read "EidPrayers" sheet → array of Eid prayer locations ──────────────────
// Sheet cols: A=id  B=location_name  C=address  D=lat  E=lng  F=organizer  G=jamaats  H=notes  I=date
// jamaats col: comma-separated times e.g. "07:00,08:30,10:00"
// date col: YYYY-MM-DD (the Eid day this location is active)
function getEidPrayersJSON() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('EidPrayers');
  if (!sheet) return [];

  // Use getDisplayValues to avoid Sheets Date auto-parse corruption on time/date columns
  var rows = sheet.getDataRange().getDisplayValues();
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var id        = (rows[i][0] || '').trim();
    var name      = (rows[i][1] || '').trim();
    var address   = (rows[i][2] || '').trim();
    var lat       = parseFloat(rows[i][3]);
    var lng       = parseFloat(rows[i][4]);
    var organizer = (rows[i][5] || '').trim();
    var jamaatsRaw = (rows[i][6] || '').trim();
    var notes     = (rows[i][7] || '').trim();
    var dateStr   = (rows[i][8] || '').trim();

    if (!name || isNaN(lat) || isNaN(lng)) continue;

    // Normalize date display to YYYY-MM-DD if Sheets shows a different format
    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      var d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        dateStr = d.getFullYear() + '-' +
          ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
          ('0' + d.getDate()).slice(-2);
      }
    }

    var jamaats = jamaatsRaw ? jamaatsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];

    result.push({
      id: id || String(i),
      name: name,
      address: address,
      lat: lat,
      lng: lng,
      organizer: organizer,
      jamaats: jamaats,
      notes: notes,
      date: dateStr
    });
  }
  return result;
}

// ── EidNew sheet management ─────────────────────────────────────────────────
// Sheet "EidNew" cols:
//   A=Timestamp B=Name(User) C=Address(User) D=MapsLink E=Organizer F=Jamaats G=Date H=Notes I=Score
//   J=Name(Google) K=Address(Google) L=Lat M=Lng N=PlaceID O=Website P=EnrichedAt Q=Approved

function ensureEidNewSheet(ss) {
  var sheet = ss.getSheetByName('EidNew');
  if (!sheet) {
    sheet = ss.insertSheet('EidNew');
    sheet.appendRow(['Timestamp', 'Name (User)', 'Address (User)', 'Maps Link', 'Organizer', 'Jamaats', 'Date', 'Notes', 'Score',
                     'Name (Google)', 'Address (Google)', 'Lat', 'Lng', 'PlaceID', 'Website', 'EnrichedAt', 'Approved']);
  }
  return sheet;
}

// Enrich pending EidNew rows — same pattern as enrichPendingRows but for EidNew sheet.
function enrichEidPendingRows() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('EidNew');
  if (!sheet) { Logger.log('Sheet "EidNew" not found.'); return; }

  var rows = sheet.getDataRange().getValues();
  var count = 0;
  var MAX_RUN = 10;

  for (var i = 1; i < rows.length; i++) {
    if (count >= MAX_RUN) break;
    var mapsUrl = (rows[i][3] || '').toString().trim();  // col D
    var enrichedAt = (rows[i][15] || '').toString().trim();  // col P
    if (!mapsUrl) continue;
    if (enrichedAt) continue;

    try {
      var resolved = resolveUrl(mapsUrl);
      var parsed = parseMapsUrl(resolved);

      var googleName = parsed.name || '';
      var googleAddress = parsed.address || '';
      var lat = parsed.lat !== null ? parsed.lat : '';
      var lng = parsed.lng !== null ? parsed.lng : '';
      var placeId = parsed.placeId || '';
      var website = '';

      if (placeId) {
        var details = getPlaceDetails(placeId);
        if (details.name) googleName = details.name;
        if (details.formatted_address) googleAddress = details.formatted_address;
        if (details.geometry && details.geometry.location) {
          lat = details.geometry.location.lat;
          lng = details.geometry.location.lng;
        }
        if (details.website) website = details.website;
      }

      if (!googleAddress && lat !== '' && lng !== '') {
        googleAddress = reverseGeocode(lat, lng);
      }

      if (lat === '' && lng === '' && googleName) {
        var geo = forwardGeocode(googleName + (googleAddress ? ', ' + googleAddress : ''));
        if (geo) { lat = geo.lat; lng = geo.lng; if (!googleAddress) googleAddress = geo.address; }
      }

      // Fallback geocode from user data
      if (lat === '' && lng === '' && !placeId) {
        var userName = (rows[i][1] || '').toString().trim();
        var userAddress = (rows[i][2] || '').toString().trim();
        if (userName || userAddress) {
          var geoFb = forwardGeocode([userName, userAddress].filter(Boolean).join(', '));
          if (geoFb) { lat = geoFb.lat; lng = geoFb.lng; if (!googleAddress) googleAddress = geoFb.address; if (!googleName) googleName = userName; }
        }
      }

      var hasData = lat !== '' || lng !== '' || googleAddress || googleName || placeId;
      if (!hasData) continue;

      if (lat !== '' && lng !== '' && !isInsideFinlandBounds(lat, lng)) {
        sheet.deleteRow(i + 1);
        i--;
        rows = sheet.getDataRange().getValues();
        count++;
        continue;
      }

      googleAddress = normaliseAddress(googleAddress);
      var ts = new Date().toLocaleString('en-FI', { timeZone: 'Europe/Helsinki' });
      // Cols J–P: Name(Google), Address(Google), Lat, Lng, PlaceID, Website, EnrichedAt
      sheet.getRange(i + 1, 10, 1, 7).setValues([[googleName, googleAddress, lat, lng, placeId, website, ts]]);
      count++;
      Utilities.sleep(300);
    } catch (err) {
      Logger.log('EidNew Row ' + (i + 1) + ' error: ' + err.message);
      sheet.getRange(i + 1, 16).setValue('Error: ' + err.message.substring(0, 80));
    }
  }
  Logger.log('enrichEidPendingRows: processed ' + count + ' rows.');
}

// Admin GET: pending Eid submissions
function getPendingEid() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('EidNew');
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  var pending = [];
  for (var i = 1; i < rows.length; i++) {
    var approved = (rows[i][16] || '').toString().trim().toLowerCase();  // col Q
    if (approved === 'yes' || approved === 'no') continue;

    pending.push({
      rowId: makeRowId((rows[i][0] || '').toString().trim(), (rows[i][1] || '').toString().trim()),
      timestamp: (rows[i][0] || '').toString().trim(),
      name: (rows[i][1] || '').toString().trim(),
      address: (rows[i][2] || '').toString().trim(),
      mapsLink: (rows[i][3] || '').toString().trim(),
      organizer: (rows[i][4] || '').toString().trim(),
      jamaats: (rows[i][5] || '').toString().trim(),
      date: (rows[i][6] || '').toString().trim(),
      notes: (rows[i][7] || '').toString().trim(),
      score: (rows[i][8] || '').toString().trim(),
      googleName: (rows[i][9] || '').toString().trim(),
      googleAddress: (rows[i][10] || '').toString().trim(),
      lat: rows[i][11],
      lng: rows[i][12],
      placeId: (rows[i][13] || '').toString().trim(),
      enrichedAt: (rows[i][15] || '').toString().trim()
    });
  }
  return pending;
}

// Find row in EidNew by rowId
function findRowByIdInEidNew(sheet, rowId) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var ts = (rows[i][0] || '').toString().trim();
    var name = (rows[i][1] || '').toString().trim();
    if (makeRowId(ts, name) === rowId) return i + 1;
  }
  return -1;
}

function adminApproveEid(ss, rowId) {
  var sheet = ss.getSheetByName('EidNew');
  if (!sheet) return { error: 'Sheet "EidNew" not found' };
  var row = findRowByIdInEidNew(sheet, rowId);
  if (row === -1) return { error: 'Row not found (may already be processed)' };
  sheet.getRange(row, 17).setValue('Yes');  // col Q = Approved
  copyEidNewToEidPrayers(sheet, row);
  invalidateCache();
  return { success: true };
}

function adminRejectEid(ss, rowId, reason) {
  var sheet = ss.getSheetByName('EidNew');
  if (!sheet) return { error: 'Sheet "EidNew" not found' };
  var row = findRowByIdInEidNew(sheet, rowId);
  if (row === -1) return { error: 'Row not found (may already be processed)' };
  sheet.getRange(row, 17).setValue('No');
  return { success: true };
}

// Copy approved EidNew row to EidPrayers sheet
function copyEidNewToEidPrayers(srcSheet, row) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var eidSheet = ss.getSheetByName('EidPrayers');
  if (!eidSheet) {
    eidSheet = ss.insertSheet('EidPrayers');
    eidSheet.appendRow(['id', 'name', 'address', 'lat', 'lng', 'organizer', 'jamaats', 'notes', 'date']);
  }

  var r = srcSheet.getRange(row, 1, 1, 19).getValues()[0];
  // EidNew: 0=Timestamp 1=Name(User) 2=Address(User) 3=MapsLink 4=Organizer 5=Jamaats 6=Date 7=Notes 8=Score
  //         9=Name(Google) 10=Address(Google) 11=Lat 12=Lng 13=PlaceID 14=Website 15=EnrichedAt 16=Approved

  var name = (r[9] || '').toString().trim() || (r[1] || '').toString().trim();
  var address = normaliseAddress((r[10] || '').toString().trim() || (r[2] || '').toString().trim());
  var lat = r[11];
  var lng = r[12];
  var organizer = (r[4] || '').toString().trim();
  // Read jamaats and date as display text to avoid Sheets Date auto-parse corruption
  var jamaats = srcSheet.getRange(row, 6).getDisplayValue().trim();
  var eidDate = srcSheet.getRange(row, 7).getDisplayValue().trim();
  var notes = (r[7] || '').toString().trim();

  if (!name || !lat || !lng) { Logger.log('EidNew row ' + row + ': missing name/lat/lng, skipping.'); return; }

  // Generate unique ID
  var existingRows = eidSheet.getDataRange().getValues();
  var existingIds = [];
  for (var i = 1; i < existingRows.length; i++) {
    existingIds.push((existingRows[i][0] || '').toString().trim());
  }
  var nextId = generatePlaceId(existingIds);

  // Convert date string to a proper Date object for Sheets
  var eidDateObj = eidDate ? new Date(eidDate + 'T00:00:00') : eidDate;

  eidSheet.appendRow([nextId, name, address, lat, lng, organizer, '', notes, eidDateObj]);
  var lastRow = eidSheet.getLastRow();
  // Write jamaats with text format FIRST to prevent Sheets auto-parsing "9:00" as a time
  eidSheet.getRange(lastRow, 7).setNumberFormat('@').setValue(jamaats);
  // Format date (I) as YYYY-MM-DD date
  eidSheet.getRange(lastRow, 9).setNumberFormat('yyyy-mm-dd');
  Logger.log('Approved Eid prayer place: "' + name + '" → EidPrayers id=' + nextId);
}

// Captures a submitted event's custom location (used when the event is not
// anchored to an existing directory place). Two sources, mutually exclusive:
//  - locationLat/locationLng: the client already resolved this via an OSM/
//    Digitransit search-result pick — use as-is, no server-side work needed.
//  - locationGmapsLink: a pasted Google Maps link, stored as-is and resolved
//    asynchronously by enrichPendingEventRows() (same pattern as place
//    enrichment), for locations not found in either the directory or OSM.
function _resolveEventLocation(data) {
  var result = { locationName: '', locationAddress: '', lat: '', lng: '', locationGmapsLink: '' };
  if (data.placeId) return result; // anchored to an existing place — no custom location to store
  result.locationName = (data.locationName || '').toString().trim();

  var directLat = parseFloat(data.locationLat);
  var directLng = parseFloat(data.locationLng);
  if (!isNaN(directLat) && !isNaN(directLng)) {
    result.lat = directLat;
    result.lng = directLng;
    result.locationAddress = (data.locationAddress || '').toString().trim();
    return result;
  }

  result.locationGmapsLink = (data.locationGmapsLink || '').toString().trim();
  return result;
}

// Fills location_name/location_address/lat/lng for any "Events" row that has a
// location_gmaps_link (col T) but isn't anchored to an existing place and hasn't
// been resolved yet (col P, lat, still empty). Mirrors enrichPendingRows() but only
// needs location fields — events don't need hours/rating/reviews/website.
function enrichPendingEventRows() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Events');
  if (!sheet) return;

  var rows    = sheet.getDataRange().getValues();
  var count   = 0;
  var MAX_RUN = 10;

  for (var i = 1; i < rows.length; i++) {
    if (count >= MAX_RUN) break;
    var placeId = (rows[i][1] || '').toString().trim();
    if (placeId) continue; // anchored to an existing place — nothing to resolve
    var gmapsLink = (rows[i][19] || '').toString().trim(); // col T
    if (!gmapsLink) continue;
    var existingLat = rows[i][15]; // col P
    if (existingLat !== '' && existingLat !== null && !isNaN(parseFloat(existingLat))) continue;

    try {
      var resolved = resolveUrl(gmapsLink);
      var parsed   = parseMapsUrl(resolved);
      var name     = (rows[i][13] || '').toString().trim() || parsed.name || '';
      var address  = parsed.address || '';
      var lat      = parsed.lat;
      var lng      = parsed.lng;

      if ((lat === null || lat === undefined) && parsed.placeId) {
        var details = getPlaceDetails(parsed.placeId);
        if (details.geometry && details.geometry.location) {
          lat = details.geometry.location.lat;
          lng = details.geometry.location.lng;
        }
        if (!address && details.formatted_address) address = details.formatted_address;
        if (!name && details.name) name = details.name;
      }
      if ((lat === null || lat === undefined) && name) {
        var geo = forwardGeocode(name + (address ? ', ' + address : ''));
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          if (!address) address = geo.address;
        }
      }
      if (!address && lat != null && lng != null) address = reverseGeocode(lat, lng);

      if (lat == null || lng == null) {
        Logger.log('enrichPendingEventRows: row ' + (i + 1) + ' resolved no coordinates, will retry next run');
        count++;
        continue;
      }

      sheet.getRange(i + 1, 14, 1, 4).setValues([[name, address, lat, lng]]); // N:Q
      count++;
      Utilities.sleep(300);
    } catch (err) {
      Logger.log('enrichPendingEventRows row ' + (i + 1) + ' error: ' + err.message);
      count++;
    }
  }
}

// ── Read "Events" sheet → array of events ────────────────────────────────────
// Sheet "Events" cols:
//   A=id  B=place_id  C=title  D=description  E=event_date  F=event_time
//   G=end_time  H=recurring  I=recurrence_pattern  J=url  K=approved  L=created_at
//   M=reject_reason  N=location_name  O=location_address  P=lat  Q=lng
//   R=organizer_name  S=organizer_place_id  T=location_gmaps_link
// place_id is optional: when blank, the event happened at a custom location
// (location_name/address/lat/lng, resolved from location_gmaps_link by
// enrichPendingEventRows()). organizer_name/organizer_place_id are independent
// of location — the organizer may or may not be an existing place.
function getEventsJSON() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Events');
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  var result = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = 1; i < rows.length; i++) {
    var id = (rows[i][0] || '').toString().trim();
    var placeId = (rows[i][1] || '').toString().trim();
    var title = (rows[i][2] || '').toString().trim();
    var description = (rows[i][3] || '').toString().trim();
    var eventDate = formatSheetDate((rows[i][4] || '').toString().trim(), rows[i][4]);
    var eventTime = formatSheetTime(rows[i][5]);
    var endTime = formatSheetTime(rows[i][6]);
    var recurring = (rows[i][7] || '').toString().trim().toLowerCase() === 'yes';
    var recurrencePattern = (rows[i][8] || '').toString().trim();
    var url = (rows[i][9] || '').toString().trim();
    var approved = (rows[i][10] || '').toString().trim().toLowerCase() === 'yes';
    var createdAt = (rows[i][11] || '').toString().trim();
    var locationName = (rows[i][13] || '').toString().trim();
    var locationAddress = (rows[i][14] || '').toString().trim();
    var lat = parseFloat(rows[i][15]);
    var lng = parseFloat(rows[i][16]);
    var organizerName = (rows[i][17] || '').toString().trim();
    var organizerPlaceId = (rows[i][18] || '').toString().trim();
    var locationGmapsLink = (rows[i][19] || '').toString().trim();

    if (!title || !approved) continue;
    if (!placeId && !locationName && isNaN(lat)) continue; // no usable location at all

    // Skip past non-recurring events
    if (!recurring && eventDate) {
      var evDate = new Date(eventDate);
      if (!isNaN(evDate.getTime()) && evDate < today) continue;
    }

    var evt = {
      id: id || String(i),
      title: title,
      recurring: recurring
    };
    if (placeId) evt.placeId = placeId;
    if (locationName) evt.locationName = locationName;
    if (locationAddress) evt.locationAddress = locationAddress;
    if (!isNaN(lat) && !isNaN(lng)) { evt.lat = lat; evt.lng = lng; }
    if (organizerName) evt.organizerName = organizerName;
    if (organizerPlaceId) evt.organizerPlaceId = organizerPlaceId;
    if (locationGmapsLink) evt.locationGmapsLink = locationGmapsLink;
    if (description) evt.description = description;
    if (eventDate) evt.date = eventDate;
    if (eventTime) evt.time = eventTime;
    if (endTime) evt.endTime = endTime;
    if (recurrencePattern) evt.recurrence = recurrencePattern;
    if (url) evt.url = url;

    result.push(evt);
  }
  return result;
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

function ensureContactSheet(ss) {
  var sheet = ss.getSheetByName('Contact');
  if (!sheet) {
    sheet = ss.insertSheet('Contact');
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONTACT_HEADERS.length).setValues([CONTACT_HEADERS]);
    return sheet;
  }

  var headerRange = sheet.getRange(1, 1, 1, CONTACT_HEADERS.length);
  var headers = headerRange.getValues()[0];
  var changed = false;
  for (var i = 0; i < CONTACT_HEADERS.length; i++) {
    var current = (headers[i] || '').toString().trim();
    if (!current || (i === 6 && current.toLowerCase() !== 'replied')) {
      headers[i] = CONTACT_HEADERS[i];
      changed = true;
    }
  }
  if (changed) headerRange.setValues([headers]);
  return sheet;
}

// ── Wishes sheet helpers ──────────────────────────────────────────────────────
// Sheet "Wishes" cols: A=id B=title C=description D=votes E=created F=votedDevices G=name H=email I=approved

var WISH_HEADERS = ['id', 'title', 'description', 'votes', 'created', 'votedDevices', 'name', 'email', 'approved', 'implemented'];

function ensureWishSheet(ss) {
  var sheet = ss.getSheetByName('Wishes');
  if (!sheet) {
    sheet = ss.insertSheet('Wishes');
    sheet.appendRow(WISH_HEADERS);
    return sheet;
  }
  // Upgrade existing sheets: ensure all header columns exist
  var headerRange = sheet.getRange(1, 1, 1, WISH_HEADERS.length);
  var headers = headerRange.getValues()[0];
  var changed = false;
  for (var i = 0; i < WISH_HEADERS.length; i++) {
    if (!headers[i] || headers[i].toString().trim() === '') {
      headers[i] = WISH_HEADERS[i];
      changed = true;
    }
  }
  if (changed) headerRange.setValues([headers]);
  return sheet;
}

// place_id is optional — an event can be anchored to an existing directory place
// (place_id set, location_name/address/lat/lng blank) OR a custom location such as
// a rented hall or outdoor spot (place_id blank, location_name/address/lat/lng set).
// organizer_name/organizer_place_id are independent of location: the organizer may
// or may not be a place that already exists in the directory.
var EVENT_HEADERS = ['id', 'place_id', 'title', 'description', 'event_date', 'event_time', 'end_time', 'recurring', 'recurrence_pattern', 'url', 'approved', 'created_at', 'reject_reason', 'location_name', 'location_address', 'lat', 'lng', 'organizer_name', 'organizer_place_id', 'location_gmaps_link'];
var EVENT_EDIT_HEADERS = ['Timestamp', 'EventID', 'PlaceID', 'Title', 'Description', 'EventDate', 'EventTime', 'EndTime', 'Recurring', 'RecurrencePattern', 'URL', 'Score', 'ChangesSummary', 'Approved', 'RejectReason', 'LocationName', 'LocationAddress', 'Lat', 'Lng', 'OrganizerName', 'OrganizerPlaceId', 'LocationGmapsLink'];

// Adds any header columns that are missing from an existing sheet (schema migration),
// preserving existing column positions and data.
function _upgradeSheetHeaders(sheet, expectedHeaders) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRange = sheet.getRange(1, 1, 1, Math.max(lastCol, expectedHeaders.length));
  var headers = headerRange.getValues()[0];
  var changed = false;
  for (var i = 0; i < expectedHeaders.length; i++) {
    if (!headers[i] || headers[i].toString().trim() === '') {
      headers[i] = expectedHeaders[i];
      changed = true;
    }
  }
  if (changed) headerRange.setValues([headers]);
}

function ensureEventSheet(ss) {
  var sheet = ss.getSheetByName('Events');
  if (!sheet) {
    sheet = ss.insertSheet('Events');
    sheet.appendRow(EVENT_HEADERS);
    // Force time columns (F=6, G=7) to plain text so Sheets won't coerce to Date
    sheet.getRange('F:G').setNumberFormat('@');
    return sheet;
  }
  _upgradeSheetHeaders(sheet, EVENT_HEADERS);
  return sheet;
}

function ensureEventEditSheet(ss) {
  var sheet = ss.getSheetByName('EventEdit');
  if (!sheet) {
    sheet = ss.insertSheet('EventEdit');
    sheet.appendRow(EVENT_EDIT_HEADERS);
    // Force time columns (G=7, H=8) to plain text so Sheets won't coerce to Date
    sheet.getRange('G:H').setNumberFormat('@');
    return sheet;
  }
  _upgradeSheetHeaders(sheet, EVENT_EDIT_HEADERS);
  return sheet;
}

// ── Admin event helpers ─────────────────────────────────────────────────────

function getPendingEvents() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Events');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var placesMap = buildPlacesNameMap(ss);
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var approved = (rows[i][10] || '').toString().trim().toLowerCase();
    if (approved === 'yes' || approved === 'no') continue;
    var id = (rows[i][0] || '').toString().trim();
    var placeId = (rows[i][1] || '').toString().trim();
    result.push({
      eventId: id,
      placeId: placeId,
      placeName: placesMap[placeId] || '',
      title: (rows[i][2] || '').toString().trim(),
      description: (rows[i][3] || '').toString().trim(),
      eventDate: formatSheetDate((rows[i][4] || '').toString().trim(), rows[i][4]),
      eventTime: formatSheetTime(rows[i][5]),
      endTime: formatSheetTime(rows[i][6]),
      recurring: (rows[i][7] || '').toString().trim().toLowerCase() === 'yes',
      recurrencePattern: (rows[i][8] || '').toString().trim(),
      url: (rows[i][9] || '').toString().trim(),
      createdAt: (rows[i][11] || '').toString().trim(),
      locationName: (rows[i][13] || '').toString().trim(),
      locationAddress: (rows[i][14] || '').toString().trim(),
      lat: rows[i][15] || '',
      lng: rows[i][16] || '',
      organizerName: (rows[i][17] || '').toString().trim(),
      organizerPlaceId: (rows[i][18] || '').toString().trim(),
      locationGmapsLink: (rows[i][19] || '').toString().trim()
    });
  }
  return result;
}

function getPendingEventEdits() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('EventEdit');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var placesMap = buildPlacesNameMap(ss);
  var eventsMap = buildEventsMap(ss);
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var approved = (rows[i][13] || '').toString().trim().toLowerCase();
    if (approved === 'yes' || approved === 'no') continue;
    var timestamp = (rows[i][0] || '').toString().trim();
    var eventId = (rows[i][1] || '').toString().trim();
    var placeId = (rows[i][2] || '').toString().trim();
    var current = eventsMap[eventId] || {};
    result.push({
      rowId: makeRowId(timestamp, eventId),
      timestamp: timestamp,
      eventId: eventId,
      placeId: placeId,
      placeName: placesMap[placeId] || placesMap[current.placeId] || '',
      title: (rows[i][3] || '').toString().trim(),
      description: (rows[i][4] || '').toString().trim(),
      eventDate: formatSheetDate((rows[i][5] || '').toString().trim(), rows[i][5]),
      eventTime: formatSheetTime(rows[i][6]),
      endTime: formatSheetTime(rows[i][7]),
      recurring: (rows[i][8] || '').toString().trim().toLowerCase() === 'yes',
      recurrencePattern: (rows[i][9] || '').toString().trim(),
      url: (rows[i][10] || '').toString().trim(),
      changesSummary: (rows[i][12] || '').toString().trim(),
      locationName: (rows[i][15] || '').toString().trim(),
      locationAddress: (rows[i][16] || '').toString().trim(),
      lat: rows[i][17] || '',
      lng: rows[i][18] || '',
      organizerName: (rows[i][19] || '').toString().trim(),
      organizerPlaceId: (rows[i][20] || '').toString().trim(),
      locationGmapsLink: (rows[i][21] || '').toString().trim(),
      current: current
    });
  }
  return result;
}

function buildPlacesNameMap(ss) {
  var map = {};
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return map;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var id = (rows[i][0] || '').toString().trim();
    var name = (rows[i][1] || '').toString().trim();
    if (id) map[id] = name;
  }
  return map;
}

function buildEventsMap(ss) {
  var map = {};
  var sheet = ss.getSheetByName('Events');
  if (!sheet) return map;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var id = (rows[i][0] || '').toString().trim();
    if (!id) continue;
    map[id] = {
      placeId: (rows[i][1] || '').toString().trim(),
      title: (rows[i][2] || '').toString().trim(),
      description: (rows[i][3] || '').toString().trim(),
      eventDate: formatSheetDate((rows[i][4] || '').toString().trim(), rows[i][4]),
      eventTime: formatSheetTime(rows[i][5]),
      endTime: formatSheetTime(rows[i][6]),
      recurring: (rows[i][7] || '').toString().trim().toLowerCase() === 'yes',
      recurrencePattern: (rows[i][8] || '').toString().trim(),
      url: (rows[i][9] || '').toString().trim(),
      locationName: (rows[i][13] || '').toString().trim(),
      locationAddress: (rows[i][14] || '').toString().trim(),
      lat: rows[i][15] || '',
      lng: rows[i][16] || '',
      organizerName: (rows[i][17] || '').toString().trim(),
      organizerPlaceId: (rows[i][18] || '').toString().trim(),
      locationGmapsLink: (rows[i][19] || '').toString().trim()
    };
  }
  return map;
}

function findEventRowById(sheet, eventId) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim() === eventId) return i + 1;
  }
  return -1;
}

function findEventEditRowById(sheet, rowId) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var ts = (rows[i][0] || '').toString().trim();
    var evId = (rows[i][1] || '').toString().trim();
    if (makeRowId(ts, evId) === rowId) return i + 1;
  }
  return -1;
}

function adminApproveEvent(ss, eventId) {
  var sheet = ss.getSheetByName('Events');
  if (!sheet) return { error: 'Sheet "Events" not found' };
  var row = findEventRowById(sheet, eventId);
  if (row === -1) return { error: 'Event not found (may already be processed)' };
  sheet.getRange(row, 11).setValue('yes');
  invalidateCache();
  return { success: true };
}

function adminRejectEvent(ss, eventId, reason) {
  var sheet = ss.getSheetByName('Events');
  if (!sheet) return { error: 'Sheet "Events" not found' };
  var row = findEventRowById(sheet, eventId);
  if (row === -1) return { error: 'Event not found (may already be processed)' };
  sheet.getRange(row, 11).setValue('no');
  if (reason) {
    sheet.getRange(row, 13).setValue(reason);
  }
  return { success: true };
}

function adminApproveEventEdit(ss, rowId) {
  var sheet = ss.getSheetByName('EventEdit');
  if (!sheet) return { error: 'Sheet "EventEdit" not found' };
  var row = findEventEditRowById(sheet, rowId);
  if (row === -1) return { error: 'Event edit not found (may already be processed)' };
  sheet.getRange(row, 14).setValue('yes');
  applyEventEditToEvents(sheet, row);
  enrichPendingEventRows();
  invalidateCache();
  return { success: true };
}

function adminRejectEventEdit(ss, rowId, reason) {
  var sheet = ss.getSheetByName('EventEdit');
  if (!sheet) return { error: 'Sheet "EventEdit" not found' };
  var row = findEventEditRowById(sheet, rowId);
  if (row === -1) return { error: 'Event edit not found (may already be processed)' };
  sheet.getRange(row, 14).setValue('no');
  if (reason) {
    sheet.getRange(row, 15).setValue(reason);
  }
  return { success: true };
}

function applyEventEditToEvents(editSheet, editRow) {
  var vals = editSheet.getRange(editRow, 1, 1, EVENT_EDIT_HEADERS.length).getValues()[0];
  var eventId = (vals[1] || '').toString().trim();
  if (!eventId) return;

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var evSheet = ss.getSheetByName('Events');
  if (!evSheet) return;

  var evRow = findEventRowById(evSheet, eventId);
  if (evRow === -1) return;

  // EventEdit cols: 0=TS 1=EventID 2=PlaceID 3=Title 4=Description 5=EventDate 6=EventTime 7=EndTime 8=Recurring 9=RecurrencePattern 10=URL
  // Events cols:    0=id 1=place_id 2=title   3=description 4=event_date 5=event_time 6=end_time 7=recurring 8=recurrence_pattern 9=url 10=approved 11=created_at
  var fieldMap = [[3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7], [9, 8], [10, 9]];
  for (var f = 0; f < fieldMap.length; f++) {
    var editCol = fieldMap[f][0];
    var evCol = fieldMap[f][1];
    var newVal = (vals[editCol] || '').toString().trim();
    if (newVal) evSheet.getRange(evRow, evCol + 1).setValue(newVal);
  }

  // Location + organizer are a single coherent choice (existing place OR custom
  // location) — always overwrite together (even when blank) so switching modes
  // doesn't leave stale place_id/location data behind.
  // EventEdit: 2=PlaceID 15=LocationName 16=LocationAddress 17=Lat 18=Lng 19=OrganizerName 20=OrganizerPlaceId 21=LocationGmapsLink
  // Events:    1=place_id 13=location_name 14=location_address 15=lat 16=lng 17=organizer_name 18=organizer_place_id 19=location_gmaps_link
  var locationFieldMap = [[2, 1], [15, 13], [16, 14], [17, 15], [18, 16], [19, 17], [20, 18], [21, 19]];
  for (var lf = 0; lf < locationFieldMap.length; lf++) {
    var lEditCol = locationFieldMap[lf][0];
    var lEvCol = locationFieldMap[lf][1];
    evSheet.getRange(evRow, lEvCol + 1).setValue(vals[lEditCol] || '');
  }
}

function getWishesJSON() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Wishes');
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  var wishes = [];
  for (var i = 1; i < rows.length; i++) {
    var id    = (rows[i][0] || '').toString().trim();
    var title = (rows[i][1] || '').toString().trim();
    var desc  = (rows[i][2] || '').toString().trim();
    var votes = parseInt(rows[i][3], 10) || 0;
    var created = (rows[i][4] || '').toString().trim();
    var approved = (rows[i][8] || '').toString().trim().toLowerCase();
    var implRaw  = (rows[i][9] || '').toString().trim().toLowerCase();
    if (!id || !title || approved !== 'yes') continue;
    // Normalise status: 'inprogress' | 'yes' | 'out of scope' | '' (active)
    var status = '';
    if (implRaw === 'yes') status = 'yes';
    else if (implRaw === 'inprogress') status = 'inprogress';
    else if (implRaw === 'out of scope') status = 'out of scope';
    wishes.push({ id: id, title: title, description: desc, votes: votes, created: created, status: status });
  }
  // Sort order: active(0) → inprogress(1) → implemented(2) → out of scope(3)
  var STATUS_ORDER = { '': 0, 'inprogress': 1, 'yes': 2, 'out of scope': 3 };
  wishes.sort(function(a, b) {
    var oa = STATUS_ORDER[a.status] || 0;
    var ob = STATUS_ORDER[b.status] || 0;
    if (oa !== ob) return oa - ob;
    return b.votes - a.votes;
  });
  return wishes;
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

function getAdminSecret() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
}

function verifyAdminKey(e) {
  var key = (e && e.parameter && e.parameter.adminKey) ? e.parameter.adminKey : '';
  var secret = getAdminSecret();
  return secret && key === secret;
}

// Generates a stable row ID from timestamp + name (first 8 chars of hex digest).
function makeRowId(timestamp, name) {
  var raw = (timestamp || '') + '|' + (name || '');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  var hex = '';
  for (var i = 0; i < 4; i++) {
    var b = digest[i] & 0xFF;
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

function makeContactRowId(timestamp, email, message) {
  return makeRowId(timestamp, (email || '') + '|' + (message || ''));
}

function getAdminStats() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var newSheet = ss.getSheetByName('New');
  var editSheet = ss.getSheetByName('Edit');
  var placesSheet = ss.getSheetByName('Places');
  var contactSheet = ss.getSheetByName('Contact');

  var pendingNew = 0, pendingEdits = 0, totalPlaces = 0, unrepliedContacts = 0;
  var byType = { mosque: 0, restaurant: 0, shop: 0, prayer_room: 0 };

  if (newSheet) {
    var nRows = newSheet.getDataRange().getValues();
    for (var i = 1; i < nRows.length; i++) {
      var approved = (nRows[i][15] || '').toString().trim().toLowerCase();
      if (approved !== 'yes' && approved !== 'no') pendingNew++;
    }
  }

  if (editSheet) {
    var eRows = editSheet.getDataRange().getValues();
    for (var i = 1; i < eRows.length; i++) {
      var approved = (eRows[i][10] || '').toString().trim().toLowerCase();
      if (approved !== 'yes' && approved !== 'no') pendingEdits++;
    }
  }

  if (placesSheet) {
    var pRows = placesSheet.getDataRange().getValues();
    totalPlaces = pRows.length - 1;
    for (var i = 1; i < pRows.length; i++) {
      var type = (pRows[i][2] || '').toString().trim().toLowerCase();
      if (byType.hasOwnProperty(type)) byType[type]++;
    }
  }

  if (contactSheet && contactSheet.getLastRow() > 1) {
    var cRows = contactSheet.getRange(1, 1, contactSheet.getLastRow(), Math.max(contactSheet.getLastColumn(), CONTACT_HEADERS.length)).getValues();
    for (var c = 1; c < cRows.length; c++) {
      var replied = (cRows[c][6] || '').toString().trim().toLowerCase();
      if (replied !== 'yes') unrepliedContacts++;
    }
  }

  var totalWishes = 0, pendingWishes = 0;
  var wishSheet = ss.getSheetByName('Wishes');
  if (wishSheet && wishSheet.getLastRow() > 1) {
    var wRows = wishSheet.getDataRange().getValues();
    totalWishes = wRows.length - 1;
    for (var w = 1; w < wRows.length; w++) {
      var wApproved = (wRows[w][8] || '').toString().trim().toLowerCase();
      if (wApproved !== 'yes' && wApproved !== 'no') pendingWishes++;
    }
  }

  var pendingEvents = 0, pendingEventEdits = 0;
  var eventSheet = ss.getSheetByName('Events');
  if (eventSheet && eventSheet.getLastRow() > 1) {
    var evRows = eventSheet.getDataRange().getValues();
    for (var ev = 1; ev < evRows.length; ev++) {
      var evApproved = (evRows[ev][10] || '').toString().trim().toLowerCase();
      if (evApproved !== 'yes' && evApproved !== 'no') pendingEvents++;
    }
  }
  var eventEditSheet = ss.getSheetByName('EventEdit');
  if (eventEditSheet && eventEditSheet.getLastRow() > 1) {
    var eeRows = eventEditSheet.getDataRange().getValues();
    for (var ee = 1; ee < eeRows.length; ee++) {
      var eeApproved = (eeRows[ee][13] || '').toString().trim().toLowerCase();
      if (eeApproved !== 'yes' && eeApproved !== 'no') pendingEventEdits++;
    }
  }

  return { pendingNew: pendingNew, pendingEdits: pendingEdits, totalPlaces: totalPlaces, unrepliedContacts: unrepliedContacts, byType: byType, totalWishes: totalWishes, pendingWishes: pendingWishes, pendingEvents: pendingEvents, pendingEventEdits: pendingEventEdits };
}

function getPendingNew() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('New');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var approved = (rows[i][15] || '').toString().trim().toLowerCase();
    if (approved === 'yes' || approved === 'no') continue;
    var timestamp = (rows[i][0] || '').toString().trim();
    var userName = (rows[i][1] || '').toString().trim();
    result.push({
      rowId: makeRowId(timestamp, userName),
      timestamp: timestamp,
      name: userName,
      type: (rows[i][2] || '').toString().trim(),
      address: (rows[i][3] || '').toString().trim(),
      tags: (rows[i][4] || '').toString().trim(),
      gmaps: (rows[i][5] || '').toString().trim(),
      notes: (rows[i][6] || '').toString().trim(),
      score: (rows[i][7] || '').toString().trim(),
      googleName: (rows[i][8] || '').toString().trim(),
      googleAddress: (rows[i][9] || '').toString().trim(),
      lat: rows[i][10] || '',
      lng: rows[i][11] || '',
      placeId: (rows[i][12] || '').toString().trim(),
      website: (rows[i][13] || '').toString().trim(),
      enrichedAt: (rows[i][14] || '').toString().trim(),
      openingHours: (rows[i][16] || '').toString().trim()
    });
  }
  return result;
}

function getPendingEdits() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var editSheet = ss.getSheetByName('Edit');
  if (!editSheet) return [];
  var eRows = editSheet.getDataRange().getValues();

  // Load current places for diff comparison
  var placesSheet = ss.getSheetByName('Places');
  var placesMap = {};
  if (placesSheet) {
    var pRows = placesSheet.getDataRange().getValues();
    for (var p = 1; p < pRows.length; p++) {
      var pid = (pRows[p][0] || '').toString().trim();
      if (pid) {
        placesMap[pid] = {
          name: (pRows[p][1] || '').toString().trim(),
          type: (pRows[p][2] || '').toString().trim(),
          address: (pRows[p][3] || '').toString().trim(),
          tags: (pRows[p][6] || '').toString().trim(),
          notes: (pRows[p][7] || '').toString().trim()
        };
      }
    }
  }

  var result = [];
  for (var i = 1; i < eRows.length; i++) {
    var approved = (eRows[i][10] || '').toString().trim().toLowerCase();
    if (approved === 'yes' || approved === 'no') continue;
    var timestamp = (eRows[i][0] || '').toString().trim();
    var placeId = (eRows[i][1] || '').toString().trim();
    result.push({
      rowId: makeRowId(timestamp, placeId),
      timestamp: timestamp,
      placeId: placeId,
      name: (eRows[i][2] || '').toString().trim(),
      type: (eRows[i][3] || '').toString().trim(),
      address: (eRows[i][4] || '').toString().trim(),
      tags: (eRows[i][5] || '').toString().trim(),
      gmaps: (eRows[i][6] || '').toString().trim(),
      notes: (eRows[i][7] || '').toString().trim(),
      score: (eRows[i][8] || '').toString().trim(),
      changesSummary: (eRows[i][9] || '').toString().trim(),
      current: placesMap[placeId] || null
    });
  }
  return result;
}

function getAdminContacts() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Contact');
  if (!sheet || sheet.getLastRow() < 2) return { unreplied: [], replied: [] };

  var rows = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), CONTACT_HEADERS.length)).getValues();
  var unreplied = [];
  var replied = [];

  for (var i = rows.length - 1; i >= 1; i--) {
    var timestamp = (rows[i][0] || '').toString().trim();
    var name = (rows[i][1] || '').toString().trim();
    var email = (rows[i][2] || '').toString().trim();
    var phone = (rows[i][3] || '').toString().trim();
    var message = (rows[i][4] || '').toString().trim();
    var score = (rows[i][5] || '').toString().trim();
    var repliedRaw = (rows[i][6] || '').toString().trim();
    if (!name && !email && !message) continue;

    var entry = {
      rowId: makeContactRowId(timestamp, email, message),
      timestamp: timestamp,
      name: name,
      email: email,
      phone: phone,
      message: message,
      score: score,
      replied: repliedRaw.toLowerCase() === 'yes',
      repliedStatus: repliedRaw || 'No'
    };

    if (entry.replied) {
      replied.push(entry);
    } else {
      unreplied.push(entry);
    }
  }

  return { unreplied: unreplied, replied: replied };
}

function getAdminWishes() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Wishes');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var rows = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var id    = (rows[i][0] || '').toString().trim();
    var title = (rows[i][1] || '').toString().trim();
    if (!id || !title) continue;
    result.push({
      wishId: id,
      title: title,
      description: (rows[i][2] || '').toString().trim(),
      votes: parseInt(rows[i][3], 10) || 0,
      created: (rows[i][4] || '').toString().trim(),
      name: (rows[i][6] || '').toString().trim(),
      email: (rows[i][7] || '').toString().trim(),
      approved: (rows[i][8] || '').toString().trim(),
      implemented: (rows[i][9] || '').toString().trim()
    });
  }
  // Sort by latest added (reverse row order = newest first)
  result.reverse();
  return result;
}

var VALID_WISH_IMPL = ['Yes', 'Inprogress', 'Out of Scope', ''];

function adminUpdateWishField(ss, wishId, col, value) {
  if (!wishId) return { error: 'Missing wishId' };
  var status = (value || '').toString().trim();
  // Col 9 (approved) = Yes/No, Col 10 (implemented) = Yes/Inprogress/Out of Scope/blank
  if (col === 10) {
    if (VALID_WISH_IMPL.indexOf(status) === -1) return { error: 'Invalid value' };
  } else {
    if (status !== 'Yes' && status !== 'No') return { error: 'Invalid value (must be Yes or No)' };
  }

  var sheet = ss.getSheetByName('Wishes');
  if (!sheet) return { error: 'Sheet "Wishes" not found' };

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim() === wishId) {
      sheet.getRange(i + 1, col).setValue(status);
      return { success: true };
    }
  }
  return { error: 'Wish not found' };
}

function getAdminPlaces() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var name = (rows[i][1] || '').toString().trim();
    if (!name) continue;
    result.push({
      id: (rows[i][0] || '').toString().trim(),
      name: name,
      type: (rows[i][2] || '').toString().trim().toLowerCase(),
      address: (rows[i][3] || '').toString().trim(),
      city: extractCityFromAddress((rows[i][3] || '').toString().trim()),
      lat: rows[i][4] || '',
      lng: rows[i][5] || '',
      tags: (rows[i][6] || '').toString().trim(),
      notes: (rows[i][7] || '').toString().trim(),
      boycott: (rows[i][8] || '').toString().trim().toLowerCase() === 'yes',
      sponsorTier: (rows[i][9] || '').toString().trim().toLowerCase(),
      sponsorPromo: (rows[i][10] || '').toString().trim(),
      sponsorPromoText: (rows[i][11] || '').toString().trim(),
      sponsorStartDate: formatSheetDate((rows[i][12] || '').toString().trim(), rows[i][12]),
      sponsorEndDate: formatSheetDate((rows[i][13] || '').toString().trim(), rows[i][13])
    });
  }
  return result;
}

function handleAdminPost(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  if (data.action === 'approve-new') {
    return adminApproveNew(ss, data.rowId);
  }
  if (data.action === 'reject-new') {
    return adminRejectNew(ss, data.rowId, data.reason || '');
  }
  if (data.action === 'approve-edit') {
    return adminApproveEdit(ss, data.rowId);
  }
  if (data.action === 'reject-edit') {
    return adminRejectEdit(ss, data.rowId, data.reason || '');
  }
  if (data.action === 'update-boycott') {
    return adminUpdateBoycott(ss, data.placeId, data.boycott);
  }
  if (data.action === 'update-sponsor') {
    return adminUpdateSponsor(ss, data);
  }
  if (data.action === 'update-contact-replied') {
    return adminUpdateContactReplied(ss, data.rowId, data.replied);
  }
  if (data.action === 'update-wish-approved') {
    return adminUpdateWishField(ss, data.wishId, 9, data.value);
  }
  if (data.action === 'update-wish-implemented') {
    return adminUpdateWishField(ss, data.wishId, 10, data.value);
  }
  if (data.action === 'approve-event') {
    return adminApproveEvent(ss, data.eventId);
  }
  if (data.action === 'reject-event') {
    return adminRejectEvent(ss, data.eventId, data.reason || '');
  }
  if (data.action === 'approve-event-edit') {
    return adminApproveEventEdit(ss, data.rowId);
  }
  if (data.action === 'reject-event-edit') {
    return adminRejectEventEdit(ss, data.rowId, data.reason || '');
  }
  if (data.action === 'approve-review') {
    return adminUpdateReviewStatus(ss, data.rowIndex, 'yes');
  }
  if (data.action === 'reject-review') {
    return adminUpdateReviewStatus(ss, data.rowIndex, 'no');
  }
  if (data.action === 'approve-eid') {
    return adminApproveEid(ss, data.rowId);
  }
  if (data.action === 'reject-eid') {
    return adminRejectEid(ss, data.rowId, data.reason || '');
  }
  return { error: 'Unknown admin action' };
}

function findRowByIdInNew(sheet, rowId) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var ts = (rows[i][0] || '').toString().trim();
    var name = (rows[i][1] || '').toString().trim();
    if (makeRowId(ts, name) === rowId) return i + 1;
  }
  return -1;
}

function findRowByIdInEdit(sheet, rowId) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var ts = (rows[i][0] || '').toString().trim();
    var placeId = (rows[i][1] || '').toString().trim();
    if (makeRowId(ts, placeId) === rowId) return i + 1;
  }
  return -1;
}

function findRowByIdInContact(sheet, rowId) {
  var rows = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), CONTACT_HEADERS.length)).getValues();
  for (var i = 1; i < rows.length; i++) {
    var ts = (rows[i][0] || '').toString().trim();
    var email = (rows[i][2] || '').toString().trim();
    var message = (rows[i][4] || '').toString().trim();
    if (makeContactRowId(ts, email, message) === rowId) return i + 1;
  }
  return -1;
}

function adminApproveNew(ss, rowId) {
  var sheet = ss.getSheetByName('New');
  if (!sheet) return { error: 'Sheet "New" not found' };
  var row = findRowByIdInNew(sheet, rowId);
  if (row === -1) return { error: 'Row not found (may already be processed)' };
  sheet.getRange(row, 16).setValue('Yes');
  copyNewRowToPlaces(sheet, row);
  return { success: true };
}

function adminRejectNew(ss, rowId, reason) {
  var sheet = ss.getSheetByName('New');
  if (!sheet) return { error: 'Sheet "New" not found' };
  var row = findRowByIdInNew(sheet, rowId);
  if (row === -1) return { error: 'Row not found (may already be processed)' };
  sheet.getRange(row, 16).setValue('No');
  if (reason) {
    sheet.getRange(row, 17).setValue(reason);
  }
  return { success: true };
}

function adminApproveEdit(ss, rowId) {
  var sheet = ss.getSheetByName('Edit');
  if (!sheet) return { error: 'Sheet "Edit" not found' };
  var row = findRowByIdInEdit(sheet, rowId);
  if (row === -1) return { error: 'Row not found (may already be processed)' };
  sheet.getRange(row, 11).setValue('Yes');
  applyEditToPlaces(sheet, row);
  return { success: true };
}

function adminRejectEdit(ss, rowId, reason) {
  var sheet = ss.getSheetByName('Edit');
  if (!sheet) return { error: 'Sheet "Edit" not found' };
  var row = findRowByIdInEdit(sheet, rowId);
  if (row === -1) return { error: 'Row not found (may already be processed)' };
  sheet.getRange(row, 11).setValue('No');
  if (reason) {
    sheet.getRange(row, 12).setValue(reason);
  }
  return { success: true };
}

function adminUpdateContactReplied(ss, rowId, replied) {
  if (!rowId) return { error: 'Missing rowId' };

  var status = (replied || '').toString().trim().toLowerCase();
  if (status !== 'yes' && status !== 'no') return { error: 'Invalid replied status' };

  var sheet = ensureContactSheet(ss);
  var row = findRowByIdInContact(sheet, rowId);
  if (row === -1) return { error: 'Contact entry not found' };

  sheet.getRange(row, 7).setValue(status === 'yes' ? 'Yes' : 'No');
  return { success: true };
}

// Formats a sheet cell date value to YYYY-MM-DD string.
// Handles both Date objects (from Sheets) and string values.
function formatSheetDate(strVal, rawCell) {
  if (rawCell instanceof Date) {
    var d = rawCell;
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }
  if (!strVal) return '';
  // Already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) return strVal;
  // Try parsing other date formats
  var d2 = new Date(strVal);
  if (!isNaN(d2.getTime())) {
    return d2.getFullYear() + '-' +
      ('0' + (d2.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d2.getDate()).slice(-2);
  }
  return strVal;
}

/**
 * Extract HH:MM from a Google Sheets time cell.
 * Sheets stores time-only values as Date objects with a bogus date (Dec 30 1899).
 * Calling .toString() on those gives the full ugly Date string — this extracts just the time.
 * Uses Utilities.formatDate to avoid historical timezone offset bugs with getUTCHours().
 */
function formatSheetTime(rawCell) {
  if (!rawCell) return '';
  if (rawCell instanceof Date) {
    return Utilities.formatDate(rawCell, 'Europe/Helsinki', 'HH:mm');
  }
  var s = rawCell.toString().trim();
  // Already HH:MM or HH:MM:SS?
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.substring(0, 5);
  return s;
}

function getTodayHelsinkiDateString() {
  return Utilities.formatDate(new Date(), 'Europe/Helsinki', 'yyyy-MM-dd');
}

function isSponsorActiveForDate(startDate, endDate, today) {
  if (!today) today = getTodayHelsinkiDateString();
  if (startDate && startDate > today) return false;
  if (endDate && endDate < today) return false;
  return true;
}

function adminUpdateSponsor(ss, data) {
  var placeId = data.placeId;
  if (!placeId) return { error: 'Missing placeId' };
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return { error: 'Sheet "Places" not found' };

  var validTiers = ['', 'basic', 'featured', 'spotlight'];
  var tier = (data.sponsorTier || '').toString().trim().toLowerCase();
  if (validTiers.indexOf(tier) === -1) return { error: 'Invalid sponsor tier' };

  var promo     = (data.sponsorPromo || '').toString().trim();
  var promoText = (data.sponsorPromoText || '').toString().trim();
  var startDate = (data.sponsorStartDate || '').toString().trim();
  var endDate   = (data.sponsorEndDate || '').toString().trim();

  // Validate date formats if provided
  var dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !dateRe.test(startDate)) return { error: 'Invalid start date format (use YYYY-MM-DD)' };
  if (endDate && !dateRe.test(endDate)) return { error: 'Invalid end date format (use YYYY-MM-DD)' };

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim() === placeId) {
      // Cols J–N (10–14): sponsor_tier, sponsor_promo, sponsor_promo_text, sponsor_start_date, sponsor_end_date
      sheet.getRange(i + 1, 10, 1, 5).setValues([[tier, promo, promoText, startDate, endDate]]);
      invalidateCache();
      return { success: true };
    }
  }
  return { error: 'Place not found: ' + placeId };
}

function adminUpdateBoycott(ss, placeId, boycott) {
  if (!placeId) return { error: 'Missing placeId' };
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return { error: 'Sheet "Places" not found' };
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim() === placeId) {
      sheet.getRange(i + 1, 9).setValue(boycott === 'Yes' || boycott === true ? 'Yes' : 'No');
      invalidateCache();
      return { success: true };
    }
  }
  return { error: 'Place not found: ' + placeId };
}

function respondCORS(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Forces re-enrichment of ALL rows in "New" that have a Maps link.
// Run manually from the editor when rows are stuck (e.g. col O cleared but not re-enriched).
function forceEnrichAll() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('New');
  if (!sheet) { Logger.log('Sheet "New" not found.'); return; }
  var rows = sheet.getDataRange().getValues();
  var cleared = 0;
  for (var i = 1; i < rows.length; i++) {
    var mapsUrl    = (rows[i][5] || '').toString().trim();
    var enrichedAt = (rows[i][14] || '').toString().trim();
    // Clear col O for rows that have a Maps link but bad/empty enrichment data
    var hasGoodData = rows[i][10] && rows[i][11]; // lat + lng populated
    if (mapsUrl && (!hasGoodData || !enrichedAt)) {
      sheet.getRange(i + 1, 15).clearContent();
      cleared++;
      Logger.log('Cleared row ' + (i + 1) + ' for re-enrichment');
    }
  }
  Logger.log('forceEnrichAll: cleared ' + cleared + ' rows. Running enrichment now...');
  enrichPendingRows();
}

// Debug helper: paste a Maps link below, then select this function in the
// editor's function dropdown and press Run. Shows exactly what resolveUrl/
// parseMapsUrl/getPlaceDetails produce for that link (View > Logs, or Ctrl+Enter
// after running). Running from the editor always uses the currently-saved
// script — it does NOT require a new web app deployment.
function testResolveMapsLink() {
  var testUrl = 'https://maps.app.goo.gl/ETCmEfoqqrBJHuU59?g_st=ic'; // ← change this to the link you're testing
  var resolved = resolveUrl(testUrl);
  Logger.log('resolved → ' + resolved);
  var parsed = parseMapsUrl(resolved);
  Logger.log('parsed → ' + JSON.stringify(parsed));
  if (parsed.placeId) {
    var details = getPlaceDetails(parsed.placeId);
    Logger.log('getPlaceDetails → ' + JSON.stringify(details));
  } else {
    Logger.log('No placeId extracted — falling back to forwardGeocode(name+address)');
    var geo = forwardGeocode([parsed.name, parsed.address].filter(Boolean).join(', '));
    Logger.log('forwardGeocode → ' + JSON.stringify(geo));
  }
}

// Run manually from the editor to add any new Events/EventEdit header columns
// immediately (location_name, organizer_place_id, location_gmaps_link, etc.),
// instead of waiting for the next real event submission to trigger it. Safe to
// re-run — only fills in missing headers, never touches existing data rows.
function upgradeEventSheetsNow() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureEventSheet(ss);
  ensureEventEditSheet(ss);
  Logger.log('Events/EventEdit headers upgraded (or already up to date).');
}

// Backfills opening hours for all Places rows that don't have them yet.
// For each place missing hours (col O), uses name + address to find the Google placeId
// via Find Place API, then fetches opening_hours via Place Details API.
// Run manually from the Apps Script editor. Safe to re-run — skips rows that already have hours.
// Batched at 30 places per run (2 API calls each). Re-run until log says "all done".
function backfillOpeningHours() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
  if (!apiKey) { Logger.log('ERROR: MAPS_API_KEY not set in Script Properties.'); return; }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var placesSheet = ss.getSheetByName('Places');
  if (!placesSheet) { Logger.log('"Places" sheet not found.'); return; }

  var rows = placesSheet.getDataRange().getValues();
  var processed = 0;
  var filled = 0;
  var noHours = 0;
  var notFound = 0;
  var MAX_PER_RUN = 30;

  Logger.log('backfillOpeningHours: scanning ' + (rows.length - 1) + ' Places rows...');

  for (var i = 1; i < rows.length; i++) {
    if (processed >= MAX_PER_RUN) {
      Logger.log('Hit MAX_PER_RUN (' + MAX_PER_RUN + '). Re-run to continue.');
      break;
    }

    var existingHours = (rows[i][14] || '').toString().trim(); // col O
    if (existingHours) continue; // already has hours

    var name    = (rows[i][1] || '').toString().trim(); // col B
    var address = (rows[i][3] || '').toString().trim(); // col D
    if (!name) continue;

    var query = name + (address ? ', ' + address : ', Finland');
    processed++;

    try {
      // Step 1: Find the placeId via Find Place From Text API
      var findUrl = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
        + '?input=' + encodeURIComponent(query)
        + '&inputtype=textquery'
        + '&fields=place_id,name'
        + '&key=' + apiKey;
      var findResp = JSON.parse(UrlFetchApp.fetch(findUrl, { muteHttpExceptions: true }).getContentText());

      if (findResp.status !== 'OK' || !findResp.candidates || !findResp.candidates.length) {
        Logger.log('  Row ' + (i + 1) + ' "' + name + '": not found on Google');
        notFound++;
        Utilities.sleep(200);
        continue;
      }

      var placeId = findResp.candidates[0].place_id;

      // Step 2: Get opening_hours via Place Details
      var details = getPlaceDetails(placeId);
      if (details.opening_hours) {
        var converted = convertGoogleHours(details.opening_hours);
        if (converted) {
          placesSheet.getRange(i + 1, 15).setValue(JSON.stringify(converted)); // col O
          filled++;
          Logger.log('  Row ' + (i + 1) + ' "' + name + '": ✓ hours written');
        } else {
          noHours++;
          Logger.log('  Row ' + (i + 1) + ' "' + name + '": conversion returned null');
        }
      } else {
        noHours++;
        Logger.log('  Row ' + (i + 1) + ' "' + name + '": no opening_hours from Google');
      }

      Utilities.sleep(300);
    } catch (err) {
      Logger.log('  Row ' + (i + 1) + ' "' + name + '": ERROR ' + err.message);
    }
  }

  var remaining = 0;
  for (var j = i; j < rows.length; j++) {
    if (!(rows[j][14] || '').toString().trim()) remaining++;
  }

  Logger.log('──────────────────────────────────');
  Logger.log('backfillOpeningHours summary:');
  Logger.log('  Processed:  ' + processed);
  Logger.log('  Filled:     ' + filled);
  Logger.log('  No hours:   ' + noHours + ' (place exists but Google has no hours)');
  Logger.log('  Not found:  ' + notFound + ' (could not match on Google)');
  Logger.log('  Remaining:  ' + remaining + ' (still empty after this run)');
  if (remaining === 0 && processed < MAX_PER_RUN) Logger.log('  ✓ All done!');
}

// Run from the editor to deduplicate existing "New" sheet rows.
// Checks: Maps link, fuzzy name, and proximity + type.
// Keeps the first occurrence, removes later duplicates.
function deduplicateNewSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('New');
  if (!sheet) { Logger.log('"New" sheet not found.'); return; }

  var rows  = sheet.getDataRange().getValues();
  var seen  = []; // array of { link, name, googleName, type, lat, lng }
  var toDelete = [];
  var THRESHOLD = 0.0005; // ~50 m

  for (var i = 1; i < rows.length; i++) {
    var link       = normaliseMapsLink((rows[i][5] || '').toString().trim());
    var userName   = (rows[i][1] || '').toString().trim();
    var type       = (rows[i][2] || '').toString().trim().toLowerCase();
    var googleName = (rows[i][8] || '').toString().trim();
    var lat        = parseFloat(rows[i][10]);
    var lng        = parseFloat(rows[i][11]);
    var hasCoords  = !isNaN(lat) && !isNaN(lng);

    var isDupe = false;
    for (var s = 0; s < seen.length; s++) {
      // Maps link match
      if (link && seen[s].link && link === seen[s].link) { isDupe = true; break; }
      // Fuzzy name match (user name vs user name, or vs Google name)
      if (namesMatch(userName, seen[s].name)) { isDupe = true; break; }
      if (seen[s].googleName && namesMatch(userName, seen[s].googleName)) { isDupe = true; break; }
      if (googleName && namesMatch(googleName, seen[s].name)) { isDupe = true; break; }
      // Proximity + same type
      if (hasCoords && !isNaN(seen[s].lat) && !isNaN(seen[s].lng)) {
        if (Math.abs(lat - seen[s].lat) < THRESHOLD && Math.abs(lng - seen[s].lng) < THRESHOLD) {
          if (type && seen[s].type && type === seen[s].type) { isDupe = true; break; }
        }
      }
    }

    if (isDupe) {
      toDelete.push(i + 1);
      Logger.log('Duplicate row ' + (i + 1) + ': "' + userName + '"');
    } else {
      seen.push({ link: link, name: userName, googleName: googleName, type: type, lat: lat, lng: lng });
    }
  }

  // Delete from bottom to top so indices stay valid
  for (var j = toDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(toDelete[j]);
  }
  Logger.log('deduplicateNewSheet: removed ' + toDelete.length + ' of ' + (rows.length - 1) + ' rows.');
}

// Generates a random 6-char alphanumeric place ID (e.g. "k4x9m2").
// Mix of lowercase letters and digits — non-sequential, not guessable.
function generatePlaceId(existingIds) {
  var CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var LEN = 6;
  var id;
  var attempts = 0;
  do {
    id = '';
    for (var c = 0; c < LEN; c++) {
      id += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    attempts++;
    if (attempts > 1000) throw new Error('Could not generate unique place ID after 1000 attempts');
  } while (existingIds.indexOf(id) !== -1);
  return id;
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
  // "New" sheet: col O (15) cleared (single cell or range delete) → re-enrich
  // Also triggers on edits to cols A–H (data change)
  if (sheetName === 'New' && row > 1) {
    var endCol = col + e.range.getNumColumns() - 1;
    var colOCleared = col <= 15 && endCol >= 15 && !val;
    var dataChanged  = col <= 8;
    if (colOCleared || dataChanged) {
      Logger.log('onSheetEdit: triggering enrichment (col=' + col + ' val="' + val + '")');
      enrichPendingRows();
    }
  }
  // "Edit" sheet: Approved is col K (11)
  if (sheetName === 'Edit' && col === 11 && val === 'yes') {
    applyEditToPlaces(sheet, row);
  }
  // "EidPrayers" sheet: auto-generate IDs for new rows
  if (sheetName === 'EidPrayers' && row > 1 && col > 1) {
    generateEidIds();
  }
  // "EidNew" sheet: Approved is col Q (17)
  if (sheetName === 'EidNew' && col === 17 && val === 'yes') {
    copyEidNewToEidPrayers(sheet, row);
    invalidateCache();
  }
  // "EidNew" sheet: col P (16) cleared → re-enrich
  if (sheetName === 'EidNew' && row > 1) {
    var eidEndCol = col + e.range.getNumColumns() - 1;
    var eidColPCleared = col <= 16 && eidEndCol >= 16 && !val;
    var eidDataChanged = col <= 9;
    if (eidColPCleared || eidDataChanged) {
      enrichEidPendingRows();
    }
  }
}

// Copies an approved "New" row into the "Places" sheet.
// Priority: Google-enriched name/address → fallback to user-submitted name/address.
function copyNewRowToPlaces(srcSheet, row) {
  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var places = ss.getSheetByName('Places');
  if (!places) { Logger.log('Sheet "Places" not found.'); return; }

  var r = srcSheet.getRange(row, 1, 1, 20).getValues()[0];
  // New cols: 0=Timestamp 1=Name(User) 2=Type 3=Address(User) 4=Tags 5=MapsLink 6=Notes 7=Score
  //           8=Name(Google) 9=Address(Google) 10=Lat 11=Lng 12=PlaceID 13=Website 14=EnrichedAt 15=Approved 16=OpeningHours
  //           17=googleReview(JSON) 18=googleRating(number) 19=googleRatingCount(number)

  var name    = (r[8] || '').toString().trim() || (r[1] || '').toString().trim();  // Google name → User name
  var type    = (r[2] || '').toString().trim().toLowerCase();
  var address = normaliseAddress((r[9] || '').toString().trim() || (r[3] || '').toString().trim());  // Google addr → User addr
  var lat     = r[10];
  var lng     = r[11];
  var tagsRaw = (r[4] || '').toString().trim();   // submitted as "tag1,tag2,..."
  var notes   = (r[6] || '').toString().trim();
  var openingHours = (r[16] || '').toString().trim(); // New!Q

  if (!name || !lat || !lng) { Logger.log('Row ' + row + ': missing name/lat/lng, skipping.'); return; }

  // Build tags JSON: { "tag_id": true/false }
  var tags = parseTagString(tagsRaw);

  // Generate random unique alphanumeric ID
  var existingRows = places.getDataRange().getValues();
  var existingIds = [];
  for (var i = 1; i < existingRows.length; i++) {
    existingIds.push((existingRows[i][0] || '').toString().trim());
  }
  var nextId = generatePlaceId(existingIds);

  places.appendRow([nextId, name, type, address, lat, lng, JSON.stringify(tags), notes]);
  if (openingHours) {
    // Places!O stores opening_hours JSON.
    places.getRange(places.getLastRow(), 15).setValue(openingHours);
  }
  // Use the generated Places ID (nextId) as the review placeId key.
  Logger.log('Approved new place review payload: googleReview=' + ((r[17] || '').toString().trim() ? 'yes' : 'no') + ', googleRating=' + (r[18] || '') + ', googleRatingCount=' + (r[19] || ''));
  upsertGoogleReviewForPlaceId(ss, nextId, (r[17] || '').toString().trim(), r[18], r[19]);
  invalidateCache();
  Logger.log('Approved new place: "' + name + '" → Places row id=' + nextId);
}

// Applies an approved "Edit" row to an existing place in "Places" sheet.
function applyEditToPlaces(srcSheet, row) {
  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var places = ss.getSheetByName('Places');
  if (!places) { Logger.log('Sheet "Places" not found.'); return; }

  var r = srcSheet.getRange(row, 1, 1, 12).getValues()[0];
  // Edit cols: 0=Timestamp 1=PlaceID 2=Name 3=Type 4=Address 5=Tags 6=MapsLink 7=Notes 8=Score 9=ChangesSummary 10=Approved 11=OpeningHours

  var editPlaceId = (r[1] || '').toString().trim();
  if (!editPlaceId) { Logger.log('Edit row ' + row + ': no PlaceID.'); return; }

  var pRows = places.getDataRange().getValues();
  var targetRow = -1;
  for (var i = 1; i < pRows.length; i++) {
    if ((pRows[i][0] || '').toString().trim() === editPlaceId) { targetRow = i + 1; break; }
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
  if (editAddr)    places.getRange(targetRow, 4).setValue(normaliseAddress(editAddr));
  if (editTagsRaw) {
    var tags = parseTagString(editTagsRaw);
    places.getRange(targetRow, 7).setValue(JSON.stringify(tags));
  }
  if (editNotes) places.getRange(targetRow, 8).setValue(editNotes);
  var editHoursRaw = (r[11] || '').toString().trim();
  if (editHoursRaw) places.getRange(targetRow, 15).setValue(editHoursRaw);
  invalidateCache();
  Logger.log('Applied edit to place id=' + editPlaceId + ' at row ' + targetRow);
}

// Fills cols I–T for any "New" row that has a Maps link (col F) but no Enriched At (col O).
function enrichPendingRows() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('New');
  if (!sheet) { Logger.log('Sheet "New" not found.'); return; }

  var rows    = sheet.getDataRange().getValues();
  var count   = 0;
  var MAX_RUN = 10;
  Logger.log('enrichPendingRows: scanning ' + (rows.length - 1) + ' rows...');

  for (var i = 1; i < rows.length; i++) {
    if (count >= MAX_RUN) break;
    var mapsUrl    = (rows[i][5] || '').toString().trim(); // col F
    var enrichedAt = (rows[i][14] || '').toString().trim(); // col O
    if (!mapsUrl) { Logger.log('  Row ' + (i+1) + ': no Maps URL, skipping'); continue; }
    if (enrichedAt) { Logger.log('  Row ' + (i+1) + ': already enriched (' + enrichedAt + '), skipping'); continue; }
    Logger.log('  Row ' + (i+1) + ': enriching → ' + mapsUrl);

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
      var enrichedHours = '';
      var enrichedGoogleReview = '';
      var enrichedGoogleRating = '';
      var enrichedGoogleRatingCount = '';
      if (placeId) {
        var details = getPlaceDetails(placeId);
        if (details.name)              googleName    = details.name;
        if (details.formatted_address) googleAddress = details.formatted_address;
        if (details.geometry && details.geometry.location) {
          lat = details.geometry.location.lat;
          lng = details.geometry.location.lng;
        }
        if (details.website) website = details.website;
        if (details.opening_hours) {
          var converted = convertGoogleHours(details.opening_hours);
          if (converted) enrichedHours = JSON.stringify(converted);
        }
        if (details.reviews && details.reviews.length) {
          var outReviews = [];
          for (var ri = 0; ri < details.reviews.length; ri++) {
            var gr = details.reviews[ri] || {};
            outReviews.push({
              rating: normalizeGoogleReviewRating_(gr.rating || gr.starRating || gr.score),
              text: extractGoogleReviewText_(gr),
              authorName: (gr.author_name || '').toString(),
              timestamp: gr.time ? new Date(Number(gr.time) * 1000).toISOString() : ''
            });
          }
          enrichedGoogleReview = JSON.stringify(outReviews);
        }
        if (details.rating != null && details.rating !== '') {
          enrichedGoogleRating = Number(details.rating || 0);
        }
        if (details.user_ratings_total != null && details.user_ratings_total !== '') {
          enrichedGoogleRatingCount = Number(details.user_ratings_total || 0);
        }
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

      // Last resort: geocode using user-submitted name/address from the sheet row
      // Handles ftid= URLs, app-share links, and any other unresolvable formats
      if (lat === '' && lng === '' && !placeId) {
        var userName    = (rows[i][1] || '').toString().trim();  // col B
        var userAddress = (rows[i][3] || '').toString().trim();  // col D
        if (userName || userAddress) {
          var qFallback = [userName, userAddress].filter(Boolean).join(', ');
          Logger.log('  Row ' + (i+1) + ': fallback geocoding via user data: "' + qFallback + '"');
          var geoFb = forwardGeocode(qFallback);
          if (geoFb) {
            lat = geoFb.lat;
            lng = geoFb.lng;
            if (!googleAddress) googleAddress = geoFb.address;
            if (!googleName)    googleName    = userName;
          }
        }
      }

      // Fallback: resolve placeId from text so Place Details can still provide
      // opening_hours + rating + reviews even when URL parsing missed place_id.
      if (!placeId) {
        var queryParts = [];
        if (googleName) queryParts.push(googleName);
        if (googleAddress) queryParts.push(googleAddress);
        if (!queryParts.length) {
          var uName = (rows[i][1] || '').toString().trim();
          var uAddr = (rows[i][3] || '').toString().trim();
          if (uName) queryParts.push(uName);
          if (uAddr) queryParts.push(uAddr);
        }
        var queryText = queryParts.join(', ');
        var found = findPlaceIdFromText(queryText, lat, lng);
        if (found) {
          placeId = found.placeId || placeId;
          if (!googleName && found.name) googleName = found.name;
        }
      }

      // If we discovered a placeId via fallback, fetch full details now.
      if (placeId && !enrichedHours && !enrichedGoogleReview && enrichedGoogleRating === '') {
        var detailsFallback = getPlaceDetails(placeId);
        if (detailsFallback.name) googleName = detailsFallback.name;
        if (detailsFallback.formatted_address) googleAddress = detailsFallback.formatted_address;
        if (detailsFallback.geometry && detailsFallback.geometry.location) {
          lat = detailsFallback.geometry.location.lat;
          lng = detailsFallback.geometry.location.lng;
        }
        if (detailsFallback.website && !website) website = detailsFallback.website;
        if (detailsFallback.opening_hours) {
          var convertedFallback = convertGoogleHours(detailsFallback.opening_hours);
          if (convertedFallback) enrichedHours = JSON.stringify(convertedFallback);
        }
        if (detailsFallback.reviews && detailsFallback.reviews.length) {
          var outReviewsFallback = [];
          for (var rfi = 0; rfi < detailsFallback.reviews.length; rfi++) {
            var gfr = detailsFallback.reviews[rfi] || {};
            outReviewsFallback.push({
              rating: normalizeGoogleReviewRating_(gfr.rating || gfr.starRating || gfr.score),
              text: extractGoogleReviewText_(gfr),
              authorName: (gfr.author_name || '').toString(),
              timestamp: gfr.time ? new Date(Number(gfr.time) * 1000).toISOString() : ''
            });
          }
          enrichedGoogleReview = JSON.stringify(outReviewsFallback);
        }
        if (detailsFallback.rating != null && detailsFallback.rating !== '') {
          enrichedGoogleRating = Number(detailsFallback.rating || 0);
        }
        if (detailsFallback.user_ratings_total != null && detailsFallback.user_ratings_total !== '') {
          enrichedGoogleRatingCount = Number(detailsFallback.user_ratings_total || 0);
        }
      }

      // Only mark enriched if we got at least one useful piece of data.
      // If all empty, skip so the 1-min trigger retries on the next run.
      var hasData = lat !== '' || lng !== '' || googleAddress || googleName || placeId;
      if (!hasData) {
        Logger.log('Row ' + (i + 1) + ': enrichment returned no data, will retry next run');
        continue;
      }

      // Reject locations outside Finland — delete from "New" (kept in "Draft" for archive)
      if (lat !== '' && lng !== '' && !isInsideFinlandBounds(lat, lng)) {
        Logger.log('Row ' + (i + 1) + ': outside Finland (' + lat + ',' + lng + '), removing from New');
        sheet.deleteRow(i + 1);
        // Adjust loop: row indices shift down after delete
        i--;
        rows = sheet.getDataRange().getValues();
        count++;
        continue;
      }

      googleAddress = normaliseAddress(googleAddress);
      var ts = new Date().toLocaleString('en-FI', { timeZone: 'Europe/Helsinki' });
      sheet.getRange(i + 1, 9, 1, 7).setValues([[googleName, googleAddress, lat, lng, placeId, website, ts]]);
      // Store enriched opening hours in col Q only when user did not provide hours.
      var existingHours = (rows[i][16] || '').toString().trim(); // col Q
      if (enrichedHours && !existingHours) sheet.getRange(i + 1, 17).setValue(enrichedHours);
      if (enrichedGoogleReview) sheet.getRange(i + 1, 18).setValue(enrichedGoogleReview); // col R
      if (enrichedGoogleRating !== '') sheet.getRange(i + 1, 19).setValue(enrichedGoogleRating); // col S
      if (enrichedGoogleRatingCount !== '') sheet.getRange(i + 1, 20).setValue(enrichedGoogleRatingCount); // col T
      count++;
      Utilities.sleep(300);

    } catch (err) {
      Logger.log('Row ' + (i + 1) + ' error: ' + err.message);
      sheet.getRange(i + 1, 15).setValue('Error: ' + err.message.substring(0, 80));
    }
  }
  Logger.log('enrichPendingRows: processed ' + count + ' rows.');
}


// ── Deduplication & ID migration ──────────────────────────────────────────────

// Run from the editor to remove duplicate places.
// Duplicates = same name (case-insensitive) AND coordinates within ~50 m.
// Keeps the earliest (topmost) row, deletes later duplicates.
function deduplicatePlacesSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Places');
  if (!sheet) { Logger.log('"Places" sheet not found.'); return; }

  var rows = sheet.getDataRange().getValues();
  var seen = [];       // array of { name, lat, lng }
  var toDelete = [];
  var THRESHOLD = 0.0005; // ~50 m

  for (var i = 1; i < rows.length; i++) {
    var name = (rows[i][1] || '').toString().trim().toLowerCase();
    var lat  = parseFloat(rows[i][4]);
    var lng  = parseFloat(rows[i][5]);
    if (!name || isNaN(lat) || isNaN(lng)) continue;

    var isDupe = false;
    for (var s = 0; s < seen.length; s++) {
      if (seen[s].name === name &&
          Math.abs(seen[s].lat - lat) < THRESHOLD &&
          Math.abs(seen[s].lng - lng) < THRESHOLD) {
        isDupe = true;
        break;
      }
    }

    if (isDupe) {
      toDelete.push(i + 1); // 1-indexed sheet row
      Logger.log('Duplicate row ' + (i + 1) + ': "' + name + '" at ' + lat + ',' + lng);
    } else {
      seen.push({ name: name, lat: lat, lng: lng });
    }
  }

  // Delete from bottom to top so indices stay valid
  for (var j = toDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(toDelete[j]);
  }

  invalidateCache();
  Logger.log('deduplicatePlacesSheet: removed ' + toDelete.length + ' of ' + (rows.length - 1) + ' rows.');
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

  // Try letting GAS follow all redirects automatically first (simplest path)
  try {
    var autoResp = UrlFetchApp.fetch(url, {
      followRedirects: true,
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
    });
    var finalUrl = autoResp.getHeaders()['X-Final-Url'] || '';
    if (!finalUrl) {
      // Try to extract Maps URL from the response body. Some redirect pages embed
      // the target URL as a JSON string inside a <script> blob rather than issuing
      // a real HTTP redirect (no X-Final-Url in that case), with unicode-escaped
      // characters inside it. The alternation lets those escape sequences through
      // as valid content while still stopping at a lone backslash (the closing
      // escaped quote of the JSON string) instead of swallowing or truncating on it.
      var bodyText = autoResp.getContentText();
      var bodyMatch = bodyText.match(/https?:\/\/(?:(?:www\.)?google\.com\/maps|maps\.google\.com)(?:[^"'\s<>\\]|\\u[0-9a-fA-F]{4})*/i);
      if (bodyMatch) {
        var extracted = bodyMatch[0];
        // Decode JS/JSON-style unicode escapes (backslash-u-0-0-3-d for '=',
        // backslash-u-0-0-2-6 for '&', etc.) that appear when the URL was
        // embedded inside a JSON string rather than a plain HTML attribute.
        extracted = extracted.replace(/\\u([0-9a-fA-F]{4})/g, function(_, hex) {
          return String.fromCharCode(parseInt(hex, 16));
        });
        // Body URLs are also sometimes percent-encoded (%3F=?, %26=&, %3D==)
        if (extracted.indexOf('%') !== -1) {
          try { extracted = decodeURIComponent(extracted); } catch(e) {}
        }
        Logger.log('resolveUrl: found in body → ' + extracted);
        return extracted;
      }
    }
    if (finalUrl && (finalUrl.indexOf('google.com/maps') !== -1 || finalUrl.indexOf('maps.google.com') !== -1)) {
      Logger.log('resolveUrl: auto-resolved → ' + finalUrl);
      return finalUrl;
    }
  } catch (autoErr) {
    Logger.log('resolveUrl auto-follow failed: ' + autoErr.message);
  }

  // Manual hop-by-hop fallback
  var current = url;
  for (var hop = 1; hop <= 8; hop++) {
    try {
      var resp = UrlFetchApp.fetch(current, {
        followRedirects: false,
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
      });
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
    var pathName = '';
    try   { pathName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')); }
    catch (e) { pathName = nameMatch[1].replace(/\+/g, ' '); }
    if (isUsableMapsPathName_(pathName)) result.name = pathName;
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

  // 6b. Mobile share-sheet redirect: ?ftid=0xHEX:0xHEX – second hex segment is the
  // CID in hex. Convert to decimal via BigInt (exact for 64-bit values) so it can
  // be used the same way as a decimal ?cid=. Without this, links shared from the
  // phone's Maps/Search app resolve to a bare name+address with no place_id, so
  // enrichment falls back to plain geocoding and misses hours/rating/reviews/website.
  if (!result.placeId) {
    var ftidMatch = url.match(/[?&]ftid=0x[0-9a-f]+(?::|%3A)0x([0-9a-f]+)/i);
    if (ftidMatch) {
      try {
        result.placeId = 'cid:' + BigInt('0x' + ftidMatch[1]).toString();
      } catch (e) {
        Logger.log('parseMapsUrl: ftid hex→decimal conversion failed: ' + e.message);
      }
    }
  }

  // 6c. Desktop/web share redirect data: !1s0xHEX:0xHEX uses the same second
  // hex CID as ftid=. Convert it before falling through to text geocoding.
  if (!result.placeId) {
    var hexCidData = url.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i);
    if (hexCidData) {
      try {
        result.placeId = 'cid:' + BigInt('0x' + hexCidData[1]).toString();
      } catch (e2) {
        Logger.log('parseMapsUrl: data hexâ†’decimal conversion failed: ' + e2.message);
      }
    }
  }

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
function isUsableMapsPathName_(value) {
  var text = (value || '').toString().trim();
  if (!text) return false;
  if (/^(?:data=|0x[0-9a-f]+(?::0x[0-9a-f]+)?|ChIJ)/i.test(text)) return false;
  if (/^[A-Za-z0-9_-]{32,}$/.test(text)) return false;
  return /[A-Za-z0-9\u00C0-\uFFFF]/.test(text);
}

function reverseGeocode(lat, lng) {
  try {
    var resp = Maps.newGeocoder().setLanguage('en').reverseGeocode(parseFloat(lat), parseFloat(lng));
    if (resp.status === 'OK' && resp.results.length > 0) return resp.results[0].formatted_address;
  } catch (err) { Logger.log('reverseGeocode error: ' + err.message); }
  return '';
}

// Returns true if coords fall within Finland's land bounding box.
function isInsideFinlandBounds(lat, lng) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);
  return lat >= 59.4 && lat <= 70.2 && lng >= 19.0 && lng <= 31.7;
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

// ── Cuisine subtag helpers ────────────────────────────────────────────────────

// Adds user-submitted cuisine tags to the Tags sheet so future users see them.
// newCuisines: array of { id: 'cuisine_xyz', label: 'Xyz' }
function addNewCuisineTags(ss, newCuisines) {
  var sheet = ss.getSheetByName('Tags');
  if (!sheet) return;

  // Build a set of existing tag_ids for restaurant_cuisine
  var rows = sheet.getDataRange().getValues();
  var existing = {};
  for (var i = 1; i < rows.length; i++) {
    var type  = (rows[i][0] || '').toString().trim().toLowerCase();
    var tagId = (rows[i][1] || '').toString().trim();
    if (type === 'restaurant_cuisine') existing[tagId] = true;
  }

  var added = 0;
  for (var j = 0; j < newCuisines.length; j++) {
    var c = newCuisines[j];
    var id    = (c.id || '').toString().trim();
    var label = (c.label || '').toString().trim();
    if (!id || !label) continue;
    // Sanitise: only allow alphanumeric + underscore in id
    if (!/^cuisine_[a-z0-9_]+$/.test(id)) continue;
    // Limit label length
    if (label.length > 40) label = label.substring(0, 40);
    if (existing[id]) continue;
    sheet.appendRow(['restaurant_cuisine', id, label]);
    existing[id] = true;
    added++;
  }
  if (added > 0) invalidateCache();
}

// Gets rich place data from the Places API (requires MAPS_API_KEY in Script Properties).
function getPlaceDetails(placeId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
  if (!apiKey || !placeId) return {};
  try {
    var url  = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + encodeURIComponent(placeId) + '&fields=name,formatted_address,geometry,website,opening_hours,rating,user_ratings_total,reviews&reviews_sort=newest&key=' + apiKey;
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());
    if (data.status === 'OK') return data.result;
    Logger.log('Places API status: ' + data.status);
  } catch (err) { Logger.log('getPlaceDetails error: ' + err.message); }
  return {};
}

function findPlaceIdFromText(query, lat, lng) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
  if (!apiKey || !query) return null;
  try {
    var url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
      + '?input=' + encodeURIComponent(query)
      + '&inputtype=textquery'
      + '&fields=place_id,name'
      + '&key=' + apiKey;
    var latNum = parseFloat(lat), lngNum = parseFloat(lng);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      url += '&locationbias=circle:200@' + latNum + ',' + lngNum;
    }
    var resp = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText() || '{}');
    if (resp.status !== 'OK' || !resp.candidates || !resp.candidates.length) return null;
    return { placeId: resp.candidates[0].place_id || '', name: resp.candidates[0].name || '' };
  } catch (err) {
    Logger.log('findPlaceIdFromText error: ' + err.message);
    return null;
  }
}

function upsertGoogleReviewForPlaceId(ss, placeId, googleReviewJson, googleRatingValue, googleRatingCountValue) {
  if (!placeId) return;
  var reviewSheet = ensureReviewsSheet(ss);
  var rows = reviewSheet.getDataRange().getValues();
  var targetRow = -1;
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim() === placeId) { targetRow = i + 1; break; }
  }
  var rating = Number(googleRatingValue || 0);
  var ratingCount = Number(googleRatingCountValue || 0);
  if (targetRow === -1) {
    reviewSheet.appendRow([placeId, '', '', '', new Date().toISOString(), 'yes', '', googleReviewJson || '', rating || '', ratingCount || '']);
  } else {
    // Always write H/I from New-sheet enrichment payload (source of truth).
    reviewSheet.getRange(targetRow, 8).setValue(googleReviewJson || '');
    reviewSheet.getRange(targetRow, 9).setValue(!isNaN(rating) ? rating : '');
    reviewSheet.getRange(targetRow, 10).setValue(!isNaN(ratingCount) ? ratingCount : '');
  }
}

// Converts Google Places API opening_hours.periods to our compact JSON format.
// Google format: periods[{ open: {day:0-6, time:"HHMM"}, close: {day:0-6, time:"HHMM"} }]
// Our format: { "mon": "10:00-22:00", "tue": "10:00-14:00,16:00-22:00", "sun": null }
// day mapping: Google 0=Sunday, 1=Monday..6=Saturday
function convertGoogleHours(openingHours) {
  if (!openingHours || !openingHours.periods || !openingHours.periods.length) return null;
  var dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var result = {};

  // 24/7 case: single period with open day=0 time=0000 and no close
  if (openingHours.periods.length === 1 && !openingHours.periods[0].close) {
    for (var d = 0; d < 7; d++) result[dayNames[d]] = '00:00-23:59';
    return result;
  }

  // Group periods by day
  var byDay = {};
  for (var d = 0; d < 7; d++) byDay[d] = [];
  for (var i = 0; i < openingHours.periods.length; i++) {
    var period = openingHours.periods[i];
    if (!period.open) continue;
    var openTime = period.open.time || '0000';
    var closeTime = (period.close && period.close.time) ? period.close.time : '2359';
    var formatted = openTime.substring(0,2) + ':' + openTime.substring(2) + '-' + closeTime.substring(0,2) + ':' + closeTime.substring(2);
    byDay[period.open.day].push(formatted);
  }

  for (var d = 0; d < 7; d++) {
    result[dayNames[d]] = byDay[d].length ? byDay[d].join(',') : null;
  }
  return result;
}

// ── Generate unique IDs for EidPrayers rows ─────────────────────────────────
// Runs automatically via onSheetEdit when the EidPrayers sheet is edited.
// Can also be run manually from the Apps Script editor.
// Scans the "EidPrayers" sheet. For any row that has data but an empty ID (col A),
// generates a unique 6-char alphanumeric ID that doesn't collide with Places IDs.
// Existing IDs are never modified.
function generateEidIds() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var eidSheet = ss.getSheetByName('EidPrayers');
  if (!eidSheet) { Logger.log('"EidPrayers" sheet not found.'); return; }

  // Collect all existing IDs from both Places and EidPrayers to prevent collisions
  var allIds = [];
  var placesSheet = ss.getSheetByName('Places');
  if (placesSheet) {
    var pRows = placesSheet.getDataRange().getValues();
    for (var p = 1; p < pRows.length; p++) {
      var pid = (pRows[p][0] || '').toString().trim();
      if (pid) allIds.push(pid);
    }
  }
  var eidRows = eidSheet.getDataRange().getValues();
  for (var e = 1; e < eidRows.length; e++) {
    var eid = (eidRows[e][0] || '').toString().trim();
    if (eid) allIds.push(eid);
  }

  // EidPrayers cols: A=id B=location_name C=address D=lat E=lng ...
  var generated = 0;
  for (var i = 1; i < eidRows.length; i++) {
    var existingId = (eidRows[i][0] || '').toString().trim();
    var name       = (eidRows[i][1] || '').toString().trim();
    var lat        = eidRows[i][3];
    var lng        = eidRows[i][4];

    // Skip if ID already exists or row is empty
    if (existingId) continue;
    if (!name && !lat && !lng) continue;

    var newId = generatePlaceId(allIds);
    allIds.push(newId);
    eidSheet.getRange(i + 1, 1).setValue(newId); // col A
    generated++;
    Logger.log('EidPrayers row ' + (i + 1) + ': assigned id=' + newId + ' ("' + name + '")');
  }
  Logger.log('generateEidIds: assigned ' + generated + ' new IDs. ' + (eidRows.length - 1 - generated) + ' rows already had IDs.');
}

// ══════════════════════════════════════════════════════════════════════════════
// ██ REVIEWS — Community rating & review system (email-verified)
// ══════════════════════════════════════════════════════════════════════════════
// Sheet "Reviews" cols: A=placeId B=rating C=text D=email E=timestamp F=status G=emailHash H=googleReview(JSON) I=googleRating(number) J=googleRatingCount(number)
// Sheet "Verifications" cols: A=emailHash B=email C=otp D=ipHash E=timestamp F=attempts

var REVIEWS_SHEET_NAME = 'Reviews';
var VERIFICATIONS_SHEET_NAME = 'Verifications';
var MAX_REVIEWS_PER_DAY = 5;
var OTP_EXPIRY_MS = 600000; // 10 minutes
var OTP_MAX_ATTEMPTS = 3;
var OTP_RATE_PER_EMAIL_HOUR = 3;
var OTP_RATE_PER_IP_HOUR = 10;
var TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
var VERIFY_FROM_EMAIL = 'noreply@karamahcollective.com';

/**
 * No-op cache invalidation for reviews.
 * getReviewsJSON reads fresh from sheet each call; CF edge cache
 * handles TTL-based expiry (s-maxage=300).
 */
function invalidateReviewsCache() {
  // Intentional no-op — no GAS-level cache for reviews
}

/**
 * Ensure the Reviews sheet exists with headers.
 */
function ensureReviewsSheet(ss) {
  var sheet = ss.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REVIEWS_SHEET_NAME);
    sheet.appendRow(['placeId', 'rating', 'text', 'email', 'timestamp', 'status', 'emailHash', 'googleReview', 'googleRating', 'googleRatingCount']);
    return sheet;
  }
  // Upgrade legacy headers to include googleReview/googleRating columns.
  var header = sheet.getRange(1, 1, 1, Math.max(10, sheet.getLastColumn())).getValues()[0];
  if ((header[7] || '').toString().trim().toLowerCase() !== 'googlereview') sheet.getRange(1, 8).setValue('googleReview');
  if ((header[8] || '').toString().trim().toLowerCase() !== 'googlerating') sheet.getRange(1, 9).setValue('googleRating');
  if ((header[9] || '').toString().trim().toLowerCase() !== 'googleratingcount') sheet.getRange(1, 10).setValue('googleRatingCount');
  return sheet;
}

// Manually refresh Google reviews/ratings into Reviews!H:I for all places.
// Run this periodically from Apps Script editor to avoid live API usage.
function refreshAllGoogleReviewsAndRatings() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reviews = ensureReviewsSheet(ss);
  var places = ss.getSheetByName('Places');
  if (!places) { Logger.log('"Places" sheet not found.'); return; }

  var placeRows = places.getDataRange().getValues();
  var reviewRows = reviews.getDataRange().getValues();
  var indexByPlaceId = {};
  for (var r = 1; r < reviewRows.length; r++) {
    var pid = (reviewRows[r][0] || '').toString().trim();
    if (pid && indexByPlaceId[pid] == null) indexByPlaceId[pid] = r + 1;
  }

  var updated = 0, skipped = 0, failed = 0;
  for (var i = 1; i < placeRows.length; i++) {
    var placeId = (placeRows[i][0] || '').toString().trim();
    if (!placeId) continue;

    var lat = parseFloat(placeRows[i][4]);
    var lng = parseFloat(placeRows[i][5]);
    var name = (placeRows[i][1] || '').toString().trim();
    var address = (placeRows[i][3] || '').toString().trim();
    var query = [name, address].filter(Boolean).join(', ');
    if (!query && (isNaN(lat) || isNaN(lng))) { skipped++; continue; }

    try {
      var found = findGooglePlaceForReviews(query, lat, lng);
      if (!found || !found.placeId) { skipped++; continue; }
      var details = getPlaceDetailsForReviews(found.placeId);
      if (!details) { failed++; continue; }

      var googleRating = Number(details.rating || 0);
      var googleRatingCount = Number(details.userRatingsTotal || 0);
      var googleReviewJson = JSON.stringify(details.reviews || []);
      var rowNum = indexByPlaceId[placeId];
      if (!rowNum) {
        reviews.appendRow([placeId, '', '', '', new Date().toISOString(), 'yes', '', googleReviewJson, googleRating || '', googleRatingCount || '']);
        rowNum = reviews.getLastRow();
        indexByPlaceId[placeId] = rowNum;
      } else {
        reviews.getRange(rowNum, 8).setValue(googleReviewJson);
        reviews.getRange(rowNum, 9).setValue(googleRating || '');
        reviews.getRange(rowNum, 10).setValue(googleRatingCount || '');
      }
      updated++;
      Utilities.sleep(200);
    } catch (err) {
      failed++;
      Logger.log('refreshAllGoogleReviewsAndRatings placeId=' + placeId + ' error: ' + err.message);
    }
  }
  Logger.log('refreshAllGoogleReviewsAndRatings done. updated=' + updated + ' skipped=' + skipped + ' failed=' + failed);
}

function findGooglePlaceForReviews(query, lat, lng) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
  if (!apiKey) throw new Error('MAPS_API_KEY missing in Script Properties');
  if (!query) return null;
  var url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
    + '?input=' + encodeURIComponent(query)
    + '&inputtype=textquery'
    + '&fields=place_id,name'
    + '&key=' + apiKey;
  if (!isNaN(lat) && !isNaN(lng)) {
    url += '&locationbias=circle:200@' + lat + ',' + lng;
  }
  var resp = JSON.parse(UrlFetchApp.fetch(url).getContentText() || '{}');
  if (resp.status !== 'OK' || !resp.candidates || !resp.candidates.length) return null;
  return { placeId: resp.candidates[0].place_id, name: resp.candidates[0].name || '' };
}

function getPlaceDetailsForReviews(placeId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MAPS_API_KEY');
  if (!apiKey || !placeId) return null;
  var url = 'https://maps.googleapis.com/maps/api/place/details/json'
    + '?place_id=' + encodeURIComponent(placeId)
    + '&fields=rating,user_ratings_total,reviews'
    + '&reviews_sort=newest'
    + '&key=' + apiKey;
  var data = JSON.parse(UrlFetchApp.fetch(url).getContentText() || '{}');
  if (data.status !== 'OK' || !data.result) return null;
  var reviews = [];
  var src = data.result.reviews || [];
  for (var i = 0; i < src.length; i++) {
    var rr = src[i] || {};
    reviews.push({
      rating: normalizeGoogleReviewRating_(rr.rating || rr.starRating || rr.score),
      text: extractGoogleReviewText_(rr),
      authorName: (rr.author_name || '').toString(),
      timestamp: rr.time ? new Date(Number(rr.time) * 1000).toISOString() : ''
    });
  }
  return {
    rating: Number(data.result.rating || 0),
    userRatingsTotal: Number(data.result.user_ratings_total || 0),
    reviews: reviews
  };
}

/**
 * Handle POST formType=review (send-otp, verify-otp, submit, check actions).
 */
function handleReviewPost(ss, data) {
  if (data.action === 'send-otp') {
    return handleSendOTP(ss, data);
  }
  if (data.action === 'verify-otp') {
    return handleVerifyOTP(ss, data);
  }

  var reviewSheet = ensureReviewsSheet(ss);

  if (data.action === 'check') {
    return handleReviewCheck(reviewSheet, data);
  }
  if (data.action === 'submit') {
    return handleReviewSubmit(ss, reviewSheet, data);
  }
  return { error: 'Unknown review action' };
}

/**
 * Check if user has already reviewed a place (requires verification token).
 */
function handleReviewCheck(reviewSheet, data) {
  if (!data.verifyToken) return { reviewed: false };

  var tokenResult = validateVerifyToken(data.verifyToken);
  if (!tokenResult.valid) return { reviewed: false };

  var rows = reviewSheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] !== data.placeId) continue;
    if (rows[i][5] === 'no') continue;
    if (rows[i][6] === tokenResult.emailHash) {
      return { reviewed: true, rating: Number(rows[i][1]) };
    }
  }
  return { reviewed: false };
}

/**
 * Submit a new review or update an existing one.
 * Requires a valid verification token (email OTP).
 */
function handleReviewSubmit(ss, reviewSheet, data) {
  // Validate placeId exists
  var placesSheet = ss.getSheetByName('Places');
  if (!placesSheet) return { error: 'invalid_place' };
  var placeRows = placesSheet.getDataRange().getValues();
  var placeExists = false;
  for (var p = 1; p < placeRows.length; p++) {
    if (placeRows[p][0] === data.placeId) { placeExists = true; break; }
  }
  if (!placeExists) return { error: 'invalid_place' };

  // Validate rating
  var rating = parseInt(data.rating, 10);
  if (!rating || rating < 1 || rating > 5) return { error: 'invalid_rating' };

  // Validate text length
  var text = (data.text || '').toString().trim();
  if (text && text.length < 20) return { error: 'text_too_short' };
  if (text.length > 500) text = text.substring(0, 500);

  // Require valid verification token
  if (!data.verifyToken) return { error: 'invalid_token' };
  var tokenResult = validateVerifyToken(data.verifyToken);
  if (!tokenResult.valid) return { error: 'invalid_token' };
  var emailHash = tokenResult.emailHash;
  var email = tokenResult.email || '';

  var rows = reviewSheet.getDataRange().getValues();
  var now = new Date().toISOString();

  // Dedup: match by emailHash (col I, index 8)
  var existingRowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.placeId && rows[i][5] !== 'no' && rows[i][6] === emailHash) {
      existingRowIndex = i;
      break;
    }
  }

  // Verified reviews always go live immediately
  var status = 'yes';

  if (existingRowIndex !== -1) {
    var rowNum = existingRowIndex + 1;
    reviewSheet.getRange(rowNum, 2).setValue(rating);  // B: rating
    reviewSheet.getRange(rowNum, 5).setValue(now);      // E: timestamp
    if (text) {
      reviewSheet.getRange(rowNum, 3).setValue(text);   // C: text
      reviewSheet.getRange(rowNum, 6).setValue(status); // F: status
    }
    reviewSheet.getRange(rowNum, 7).setValue(emailHash); // G: emailHash
    reviewSheet.getRange(rowNum, 4).setValue(email);      // D: email
    invalidateReviewsCache();
    return { status: 'updated' };
  }

  // New review
  reviewSheet.appendRow([
    data.placeId,
    rating,
    text,
    email,    // D: email (for abuse identification)
    now,
    status,
    emailHash
  ]);

  invalidateReviewsCache();
  return { status: status };
}

/**
 * Get all live reviews, grouped by placeId with aggregate stats.
 * Always reads fresh from the sheet (CF edge cache handles caching).
 */
function getReviewsJSON() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet) return { reviews: {} };

  var rows = sheet.getDataRange().getValues();
  var grouped = {};

  for (var i = 1; i < rows.length; i++) {
    var placeId = rows[i][0];
    var rating = Number(rows[i][1]);
    var text = (rows[i][2] || '').toString();
    var timestamp = (rows[i][4] || '').toString();
    var status = (rows[i][5] || '').toString().trim().toLowerCase();
    var googleReviewRaw = (rows[i][7] || '').toString().trim(); // H
    var googleRatingRaw = rows[i][8]; // I
    var googleRatingCountRaw = rows[i][9]; // J

    // Only include community reviews that are non-rejected and have a valid rating
    if (status !== 'no' && rating >= 1 && rating <= 5) {
      if (!grouped[placeId]) {
        grouped[placeId] = { total: 0, sum: 0, items: [], googleReviewRaw: '', googleRatingRaw: '', googleRatingCountRaw: '' };
      }
      grouped[placeId].total++;
      grouped[placeId].sum += rating;

      // Show text for approved reviews; hide for pending (legacy moderated)
      var displayText = (status === 'yes') ? text : '';
      grouped[placeId].items.push({
        rating: rating,
        text: displayText,
        timestamp: timestamp,
        source: 'community'
      });
    }

    if (placeId) {
      if (!grouped[placeId]) {
        grouped[placeId] = { total: 0, sum: 0, items: [], googleReviewRaw: '', googleRatingRaw: '', googleRatingCountRaw: '' };
      }
      if (googleReviewRaw) grouped[placeId].googleReviewRaw = googleReviewRaw;
      if (googleRatingRaw !== '' && googleRatingRaw != null) grouped[placeId].googleRatingRaw = googleRatingRaw;
      if (googleRatingCountRaw !== '' && googleRatingCountRaw != null) grouped[placeId].googleRatingCountRaw = googleRatingCountRaw;
    }
  }

  // Compute averages and sort items newest-first
  var result = {};
  for (var pid in grouped) {
    var g = grouped[pid];
    var googleItems = parseGoogleReviewsField(g.googleReviewRaw);
    var googleRating = Number(g.googleRatingRaw || 0);
    var googleRatingCount = Number(g.googleRatingCountRaw || 0);
    if (!googleRatingCount && googleItems.length) googleRatingCount = googleItems.length;
    if (!googleRatingCount && googleRating > 0) googleRatingCount = 1;

    if (googleItems.length) {
      for (var gi = 0; gi < googleItems.length; gi++) g.items.push(googleItems[gi]);
    }

    var totalCount = g.total + Math.max(0, googleRatingCount);
    var totalSum = g.sum;
    if (googleRating > 0 && googleRatingCount > 0) totalSum += (googleRating * googleRatingCount);

    g.items.sort(function(a, b) {
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
    result[pid] = {
      avg: totalCount > 0 ? Math.round((totalSum / totalCount) * 10) / 10 : 0,
      count: totalCount,
      sources: {
        community: {
          avg: g.total > 0 ? Math.round((g.sum / g.total) * 10) / 10 : 0,
          count: g.total
        },
        google: {
          avg: googleRating > 0 ? googleRating : 0,
          count: Math.max(0, googleRatingCount)
        }
      },
      items: g.items
    };
  }

  return { reviews: result };
}

/**
 * Get all reviews including pending/rejected (admin endpoint).
 */
function getAdminReviews() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  var reviews = [];
  for (var i = 1; i < rows.length; i++) {
    reviews.push({
      rowIndex: i + 1,
      placeId: rows[i][0],
      rating: Number(rows[i][1]),
      text: (rows[i][2] || '').toString(),
      email: (rows[i][3] || '').toString(),
      timestamp: (rows[i][4] || '').toString(),
      status: (rows[i][5] || '').toString(),
      emailHash: (rows[i][6] || '').toString().substring(0, 8) + '…'
    });
  }
  return reviews;
}

/**
 * Admin: update review status (approve → 'yes', reject → 'no').
 */
function adminUpdateReviewStatus(ss, rowIndex, newStatus) {
  var sheet = ss.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet) return { error: 'Reviews sheet not found' };

  var rowNum = parseInt(rowIndex, 10);
  if (!rowNum || rowNum < 2) return { error: 'Invalid row index' };

  var lastRow = sheet.getLastRow();
  if (rowNum > lastRow) return { error: 'Row not found' };

  sheet.getRange(rowNum, 6).setValue(newStatus); // F: status
  return { success: true };
}

// ─── Email Verification (OTP) ────────────────────────────────────────────────

/**
 * Get the HMAC signing secret from Script Properties.
 * @returns {string}
 */
function getVerifySecret() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('VERIFY_SECRET');
  if (secret) return secret;

  // Create a persistent secret lazily so OTP verification cannot mint tokens
  // that later fail validation on deployments missing manual setup.
  secret = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now();
  props.setProperty('VERIFY_SECRET', secret);
  return secret;
}

function extractGoogleReviewText_(review) {
  if (!review) return '';
  var candidates = [
    review.text,
    review.reviewText,
    review.originalText,
    review.translatedText,
    review.original_text,
    review.translated_text,
    review.comment
  ];
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      var nested = value.text || value.value || value.localizedText || '';
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
      if (nested && typeof nested === 'object' && typeof nested.text === 'string' && nested.text.trim()) return nested.text.trim();
    }
  }
  return '';
}

function normalizeGoogleReviewRating_(value) {
  if (typeof value === 'number') return Math.max(0, Math.min(5, value));
  var normalized = (value || '').toString().trim().toUpperCase();
  var named = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    STAR_RATING_ONE: 1,
    STAR_RATING_TWO: 2,
    STAR_RATING_THREE: 3,
    STAR_RATING_FOUR: 4,
    STAR_RATING_FIVE: 5
  };
  var numeric = Number(normalized);
  return Math.max(0, Math.min(5, named[normalized] || numeric || 0));
}

function parseGoogleReviewsField(raw) {
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    var out = [];
    for (var i = 0; i < parsed.length; i++) {
      var r = parsed[i] || {};
      var rating = normalizeGoogleReviewRating_(r.rating || r.starRating || r.score);
      if (rating < 1 || rating > 5) continue;
      out.push({
        rating: rating,
        text: extractGoogleReviewText_(r),
        timestamp: (r.timestamp || '').toString(),
        source: 'google',
        authorName: (r.authorName || r.author_name || '').toString()
      });
    }
    return out;
  } catch (_) {
    return [];
  }
}

/**
 * Ensure the Verifications sheet exists with headers.
 */
function ensureVerificationsSheet(ss) {
  var sheet = ss.getSheetByName(VERIFICATIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VERIFICATIONS_SHEET_NAME);
    sheet.appendRow(['emailHash', 'email', 'otp', 'ipHash', 'timestamp', 'attempts']);
  }
  return sheet;
}

/**
 * Compute SHA-256 hex hash of a string.
 * @param {string} input
 * @returns {string}
 */
function sha256Hex(input) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var b = digest[i] & 0xFF;
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

/**
 * Handle send-otp action: rate limit, generate OTP, send email.
 */
function handleSendOTP(ss, data) {
  var email = (data.email || '').toString().trim().toLowerCase();
  if (!email || !isValidEmail(email)) return { error: 'invalid_email' };

  var ipHash = (data.ipHash || '').toString().trim();
  var emailHash = sha256Hex(email);
  var sheet = ensureVerificationsSheet(ss);
  var now = Date.now();
  var hourAgo = now - 3600000;

  // Cleanup expired rows (older than 1 hour) and rate limit check
  var rows = sheet.getDataRange().getValues();
  var emailCount = 0;
  var ipCount = 0;
  var rowsToDelete = [];

  for (var i = 1; i < rows.length; i++) {
    var rowTs = new Date(rows[i][4]).getTime();
    if (isNaN(rowTs) || rowTs < hourAgo) {
      rowsToDelete.push(i + 1); // 1-indexed
      continue;
    }
    if (rows[i][0] === emailHash) emailCount++;
    if (ipHash && rows[i][3] === ipHash) ipCount++;
  }

  // Delete expired rows (reverse order to preserve indices)
  for (var d = rowsToDelete.length - 1; d >= 0; d--) {
    sheet.deleteRow(rowsToDelete[d]);
  }

  if (emailCount >= OTP_RATE_PER_EMAIL_HOUR) return { error: 'rate_limited_email' };
  if (ipHash && ipCount >= OTP_RATE_PER_IP_HOUR) return { error: 'rate_limited_ip' };

  // Generate 6-digit OTP
  var otp = String(Math.floor(100000 + Math.random() * 900000));

  // Store verification row
  sheet.appendRow([emailHash, email, otp, ipHash, new Date().toISOString(), 0]);

  try {
    var remaining = MailApp.getRemainingDailyQuota();
    if (remaining < 2) {
      return { error: 'quota_exhausted' };
    }

    var subject = 'Halal Finder \u2014 confirm your email';
    var plainBody = 'Hi!\n\nYour Halal Finder confirmation code is: ' + otp + '\n\nEnter this code in the app to verify your email. It expires in 10 minutes.\n\nIf you didn\'t request this, just ignore this message.\n\nThanks,\nHalal Finder team';
    var htmlBody = buildOTPEmailHTML(otp);

    GmailApp.sendEmail(email, subject, plainBody, {
      from: VERIFY_FROM_EMAIL,
      name: 'Halal Finder',
      htmlBody: htmlBody
    });
  } catch (err) {
    return { error: 'email_send_failed', debug: err.message || String(err) };
  }

  return { status: 'sent' };
}

/**
 * Build a branded HTML email body for the OTP.
 * Dark theme, center-aligned, individual digit boxes.
 * @param {string} otp
 * @returns {string}
 */
function buildOTPEmailHTML(otp) {
  var ICON_URL = 'https://maps.karamahcollective.com/data/icons/icon-192.png';
  var FAVICON_URL = 'https://maps.karamahcollective.com/data/icons/favicon.png';

  var digits = otp.split('');
  var digitBoxes = '';
  for (var i = 0; i < digits.length; i++) {
    digitBoxes += '<td style="width:42px;height:52px;background:#f4f4f5;border:1.5px solid #d4d4d8;border-radius:10px;text-align:center;vertical-align:middle;font-size:24px;font-weight:700;color:#18181b;font-family:\'Courier New\',\'SF Mono\',monospace;">' + digits[i] + '</td>';
    if (i < digits.length - 1) digitBoxes += '<td style="width:' + (i === 2 ? '10' : '6') + 'px;"></td>';
  }

  return '<!DOCTYPE html>'
    + '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>Halal Finder \u2014 Verification</title>'
    + '<!--[if mso]><style>td,th,div,p,a{font-family:\'Segoe UI\',Helvetica,Arial,sans-serif !important;}</style><![endif]-->'
    + '</head>'
    + '<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif;-webkit-font-smoothing:antialiased;">'
    + '<div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your verification code for Halal Finder &#8199;&#65279;&#847;</div>'

    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f5;">'
    + '<tr><td align="center" style="padding:40px 16px 32px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:420px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">'

    // Accent bar
    + '<tr><td style="height:2px;background:linear-gradient(90deg,transparent,#08705B,transparent);font-size:0;">&#160;</td></tr>'

    // Logo
    + '<tr><td style="padding:28px 28px 0;text-align:center;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>'
    + '<td style="vertical-align:middle;"><img src="' + ICON_URL + '" alt="" width="28" height="28" style="display:block;border-radius:7px;"></td>'
    + '<td style="width:10px;"></td>'
    + '<td style="vertical-align:middle;font-size:13px;font-weight:600;color:#18181b;letter-spacing:-0.2px;">Halal Finder</td>'
    + '</tr></table>'
    + '</td></tr>'

    // Content
    + '<tr><td style="padding:24px 28px 28px;text-align:center;">'
    + '<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#18181b;letter-spacing:-0.3px;">Verify your email</p>'
    + '<p style="margin:0 0 28px;font-size:13px;color:#71717a;line-height:1.55;">Enter this code to confirm your email and publish reviews.</p>'

    // Digits
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr>' + digitBoxes + '</tr></table>'

    // Expiry pill
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>'
    + '<td style="background:#f4f4f5;border:1px solid #e4e4e7;border-radius:20px;padding:5px 14px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="width:6px;height:6px;font-size:0;line-height:0;"><div style="width:6px;height:6px;border-radius:50%;background:#08705B;"></div></td>'
    + '<td style="width:7px;"></td>'
    + '<td style="font-size:11px;color:#71717a;">Expires in <span style="color:#52525b;font-weight:600;">10 min</span></td>'
    + '</tr></table>'
    + '</td>'
    + '</tr></table>'

    + '</td></tr>'

    // Divider
    + '<tr><td style="padding:0 28px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="height:1px;background:#e4e4e7;font-size:0;">&#160;</td></tr></table></td></tr>'

    // Dismiss
    + '<tr><td style="padding:16px 28px 12px;text-align:center;">'
    + '<p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">Didn\u2019t request this? Ignore this email. Never share this code.</p>'
    + '</td></tr>'

    // Divider
    + '<tr><td style="padding:0 28px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="height:1px;background:#e4e4e7;font-size:0;">&#160;</td></tr></table></td></tr>'

    // Brand
    + '<tr><td style="padding:14px 28px 16px;text-align:center;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>'
    + '<td style="vertical-align:middle;"><img src="' + FAVICON_URL + '" alt="" width="12" height="12" style="display:block;border-radius:2px;opacity:0.5;"></td>'
    + '<td style="width:6px;"></td>'
    + '<td style="vertical-align:middle;font-size:10px;color:#a1a1aa;"><a href="https://maps.karamahcollective.com" style="color:#71717a;text-decoration:none;">maps.karamahcollective.com</a></td>'
    + '</tr></table>'
    + '</td></tr>'

    + '</table></td></tr></table></body></html>';
}

/**
 * Validate email format (basic check).
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * Handle verify-otp action: validate OTP, return signed token.
 */
function handleVerifyOTP(ss, data) {
  var email = (data.email || '').toString().trim().toLowerCase();
  if (!email || !isValidEmail(email)) return { error: 'invalid_email' };

  var otp = (data.otp || '').toString().trim();
  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) return { error: 'invalid_otp' };

  var emailHash = sha256Hex(email);
  var sheet = ensureVerificationsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var now = Date.now();

  // Find the most recent valid verification row for this email
  var matchRow = -1;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] !== emailHash) continue;
    var rowTs = new Date(rows[i][4]).getTime();
    if (isNaN(rowTs) || (now - rowTs) > OTP_EXPIRY_MS) continue;
    matchRow = i;
  }

  if (matchRow === -1) return { error: 'otp_expired' };

  // Check max attempts
  var attempts = parseInt(rows[matchRow][5], 10) || 0;
  if (attempts >= OTP_MAX_ATTEMPTS) return { error: 'too_many_attempts' };

  // Verify OTP
  if (rows[matchRow][2].toString() !== otp) {
    // Increment attempts
    sheet.getRange(matchRow + 1, 6).setValue(attempts + 1);
    return { error: 'wrong_otp' };
  }

  // OTP valid — generate signed token (embeds email for abuse tracking)
  var token = generateVerifyToken(email, emailHash);
  var expiresAt = Date.now() + TOKEN_TTL_MS;

  // Delete the verification row (consumed)
  sheet.deleteRow(matchRow + 1);

  return { status: 'verified', token: token, expiresAt: expiresAt };
}

/**
 * Generate an HMAC-signed verification token.
 * Format: base64(payload).base64(signature)
 * Payload: email|emailHash|expiryTimestamp
 * @param {string} email
 * @param {string} emailHash
 * @returns {string}
 */
function generateVerifyToken(email, emailHash) {
  var secret = getVerifySecret();
  var expiry = Date.now() + TOKEN_TTL_MS;
  var payload = email + '|' + emailHash + '|' + expiry;
  var payloadB64 = Utilities.base64Encode(payload);

  var signature = Utilities.computeHmacSha256Signature(payload, secret);
  var sigB64 = Utilities.base64Encode(signature);

  return payloadB64 + '.' + sigB64;
}

/**
 * Validate an HMAC-signed verification token.
 * @param {string} token
 * @returns {{valid: boolean, email?: string, emailHash?: string}}
 */
function validateVerifyToken(token) {
  if (!token || typeof token !== 'string') return { valid: false };

  var parts = token.split('.');
  if (parts.length !== 2) return { valid: false };

  var payloadB64 = parts[0];
  var sigB64 = parts[1];

  var secret = getVerifySecret();
  if (!secret) return { valid: false };

  var payload;
  try {
    payload = Utilities.newBlob(Utilities.base64Decode(payloadB64)).getDataAsString();
  } catch (_) {
    return { valid: false };
  }

  // Recompute HMAC and compare
  var expectedSig = Utilities.computeHmacSha256Signature(payload, secret);
  var expectedB64 = Utilities.base64Encode(expectedSig);

  if (sigB64 !== expectedB64) return { valid: false };

  // Parse payload: email|emailHash|expiryTimestamp
  var lastPipe = payload.lastIndexOf('|');
  if (lastPipe === -1) return { valid: false };
  var expiry = parseInt(payload.substring(lastPipe + 1), 10);
  if (isNaN(expiry) || Date.now() > expiry) return { valid: false };

  var firstPipe = payload.indexOf('|');
  if (firstPipe === -1 || firstPipe === lastPipe) return { valid: false };
  var email = payload.substring(0, firstPipe);
  var emailHash = payload.substring(firstPipe + 1, lastPipe);

  return { valid: true, email: email, emailHash: emailHash };
}
