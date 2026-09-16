/**
 * Karamah Website · Google Sheets data service
 * Paste this entire file into the EXISTING spreadsheet-bound Apps Script project.
 * Script Properties: WEBSITE_ADMIN_KEY and WEBSITE_FORM_KEY (different random
 * secrets, at least 32 characters). Deploy as owner, access Anyone. Every private
 * operation authenticates its key; GET exposes only active people/public content.
 * Existing rows/columns remain intact. See ../../DEPLOYMENT.md for rollout order.
 */
var TEAM_SHEET = "people_directory";
var SUBSCRIBER_SHEET = "updates_opt_ins";
var CONTENT_SHEET = "website_content";
var AUDIT_SHEET = "website_audit";
var SERVICE_VERSION = "2026-09-16-team-crud-v2";
var CAPABILITIES = {
  teamCrud: true,
  teamDetails: true,
  websiteContent: true,
  uploadedTicketImages: true,
};
var TEAM_COLUMNS = [
  "Name",
  "Email",
  "Position",
  "Status",
  "Description",
  "Location",
  "Order",
  "ID",
  "Revision",
  "Updated At",
];
var SUBSCRIBER_COLUMNS = [
  "Name",
  "Email",
  "Phone",
  "reCAPTCHA Score",
  "Date",
  "Status",
  "ID",
  "Revision",
  "Updated At",
];

function doGet(e) {
  try {
    var worksheet = String((e && e.parameter && e.parameter.worksheet) || "");
    if (worksheet === TEAM_SHEET)
      return buildJsonResponse({ success: true, people: publicTeam() });
    if (worksheet === CONTENT_SHEET) return buildJsonResponse(readContent());
    return buildJsonResponse({
      success: true,
      message: "Karamah website data service is active.",
    });
  } catch (_) {
    return buildJsonResponse({
      success: false,
      message: "Website data unavailable",
      status: 502,
    });
  }
}

function doPost(e) {
  var lock;
  try {
    var raw = (e && e.postData && e.postData.contents) || "{}";
    if (raw.length > 70000) fail("Request too large", 400);
    var data = JSON.parse(raw);
    var action = data.action || "subscribe";
    var adminActions = [
      "admin-team",
      "admin-subscribers",
      "admin-content",
      "save-person",
      "delete-person",
      "unsubscribe",
      "delete-subscriber",
      "save-content",
    ];
    if (action !== "subscribe" && adminActions.indexOf(action) < 0)
      fail("Unknown action", 400);
    requireKey(
      data.key,
      action === "subscribe" ? "WEBSITE_FORM_KEY" : "WEBSITE_ADMIN_KEY",
    );
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000))
      fail("Another update is in progress. Try again.", 409);
    var result;
    if (action === "admin-team")
      result = withServiceMeta({
        success: true,
        people: privateRows(TEAM_SHEET, TEAM_COLUMNS),
      });
    else if (action === "admin-subscribers")
      result = {
        success: true,
        subscribers: privateRows(SUBSCRIBER_SHEET, SUBSCRIBER_COLUMNS),
      };
    else if (action === "admin-content") result = withServiceMeta(readContent());
    else if (action === "save-person") result = withServiceMeta(savePerson(data));
    else if (action === "delete-person")
      result = withServiceMeta(removeRecord(TEAM_SHEET, TEAM_COLUMNS, data));
    else if (action === "unsubscribe") result = unsubscribe(data);
    else if (action === "delete-subscriber")
      result = removeRecord(SUBSCRIBER_SHEET, SUBSCRIBER_COLUMNS, data);
    else if (action === "save-content") result = withServiceMeta(saveContent(data));
    else result = subscribe(data);
    if (adminActions.indexOf(action) >= 0 && action.indexOf("admin-") !== 0) {
      try {
        recordAudit(action, data.actor, result.id || data.id || "website");
      } catch (_) {
        result.auditWarning = true;
      }
    }
    return buildJsonResponse(result);
  } catch (error) {
    return buildJsonResponse({
      success: false,
      message: error.status ? error.message : "Unable to update website data.",
      status: error.status || 502,
    });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function requireKey(value, property) {
  var expected =
    PropertiesService.getScriptProperties().getProperty(property) || "";
  if (expected.length < 32)
    fail("Data service is not configured: " + property, 503);
  var actual = String(value || "");
  var different = expected.length ^ actual.length;
  for (var i = 0; i < expected.length; i++)
    different |= expected.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
  if (different) fail("Not authorized", 403);
}
function fail(message, status) {
  var error = new Error(message);
  error.status = status;
  throw error;
}
function withServiceMeta(payload) {
  payload.serviceVersion = SERVICE_VERSION;
  payload.capabilities = CAPABILITIES;
  return payload;
}
function clean(value) {
  return String(value == null ? "" : value).trim();
}
function key(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function scalar(value) {
  return value instanceof Date ? value.toISOString() : value;
}
function headerMap(headers) {
  var map = {};
  headers.forEach(function (header, index) {
    map[key(header)] = index;
  });
  return map;
}
function sheet(name, columns) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var tab = book.getSheetByName(name) || book.insertSheet(name);
  if (!tab.getLastRow()) tab.appendRow(columns);
  var headers = tab
    .getRange(1, 1, 1, Math.max(1, tab.getLastColumn()))
    .getValues()[0];
  var map = headerMap(headers);
  columns.forEach(function (column) {
    if (map[key(column)] === undefined) {
      headers.push(column);
      tab.getRange(1, headers.length).setValue(column);
      map[key(column)] = headers.length - 1;
    }
  });
  return { tab: tab, headers: headers, map: map };
}
function writeCell(record, row, column, value) {
  var cell = record.tab.getRange(row, record.map[key(column)] + 1);
  if (typeof value === "string") {
    cell.setNumberFormat("@");
    // User text is always literal, including CSV/Sheets formula prefixes.
    cell.setValue(/^[=+@\-\t\r\n]/.test(value) ? "'" + value : value);
  } else cell.setValue(value);
}
function writeFields(record, row, fields) {
  Object.keys(fields).forEach(function (column) {
    writeCell(record, row, column, fields[column]);
  });
}
function rowsOf(record) {
  if (record.tab.getLastRow() < 2) return [];
  return record.tab
    .getRange(2, 1, record.tab.getLastRow() - 1, record.headers.length)
    .getValues()
    .map(function (row, index) {
      var value = { _row: index + 2 };
      record.headers.forEach(function (header, i) {
        value[key(header)] = scalar(row[i]);
      });
      return value;
    })
    .filter(function (row) {
      return clean(row.name) || clean(row.email);
    });
}
function privateRows(name, columns) {
  var record = sheet(name, columns);
  var rows = rowsOf(record);
  rows.forEach(function (row) {
    if (!row.id) {
      row.id = Utilities.getUuid();
      writeCell(record, row._row, "ID", row.id);
    }
    if (!Number(row.revision)) {
      row.revision = 1;
      writeCell(record, row._row, "Revision", 1);
    }
    row.revision = Number(row.revision);
    row.status =
      clean(row.status).toLowerCase() ||
      (name === SUBSCRIBER_SHEET ? "subscribed" : "inactive");
    row.order = Number(row.order) || 0;
    delete row._row;
  });
  // Return only documented fields, even if another sheet column contains notes.
  var allowed =
    name === TEAM_SHEET
      ? [
          "id",
          "revision",
          "name",
          "email",
          "position",
          "status",
          "description",
          "location",
          "order",
          "updatedat",
        ]
      : [
          "id",
          "revision",
          "name",
          "email",
          "phone",
          "date",
          "status",
          "updatedat",
          "recaptchascore",
        ];
  return rows.map(function (row) {
    var result = {};
    allowed.forEach(function (field) {
      result[field] = row[field] == null ? "" : row[field];
    });
    return result;
  });
}
function findRecord(name, columns, data) {
  var record = sheet(name, columns);
  var row = rowsOf(record).filter(function (item) {
    return item.id === data.id;
  })[0];
  if (!row) fail("Record no longer exists. Reload the list.", 404);
  if (
    !Number.isInteger(data.revision) ||
    Number(row.revision) !== data.revision
  )
    fail("Someone else changed this record. Reload it before saving.", 409);
  return { record: record, row: row };
}
function publicTeam() {
  var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEAM_SHEET);
  if (!tab || tab.getLastRow() < 2) return [];
  var headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
  return rowsOf({ tab: tab, headers: headers })
    .filter(function (row) {
      return clean(row.status).toLowerCase() === "active";
    })
    .sort(function (a, b) {
      return (Number(a.order) || 0) - (Number(b.order) || 0);
    })
    .map(function (row) {
      return {
        name: clean(row.name),
        email: clean(row.email),
        position: clean(row.position),
        description: clean(row.description),
        location: clean(row.location),
        order: Number(row.order) || 0,
      };
    });
}
function savePerson(data) {
  var person = data.person || {};
  if (!clean(person.name)) fail("Name is required", 400);
  if (person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email))
    fail("Invalid email", 400);
  if (["active", "inactive"].indexOf(person.status) < 0)
    fail("Invalid team status", 400);
  if (
    !Number.isInteger(person.order) ||
    person.order < 0 ||
    person.order > 10000
  )
    fail("Invalid display order", 400);
  var limits = {
    name: 120,
    email: 254,
    position: 160,
    description: 1200,
    location: 160,
  };
  Object.keys(limits).forEach(function (field) {
    if (
      typeof person[field] !== "string" ||
      person[field].length > limits[field]
    )
      fail("Invalid " + field, 400);
  });
  var record, row, id, revision;
  if (data.id) {
    var found = findRecord(TEAM_SHEET, TEAM_COLUMNS, data);
    record = found.record;
    row = found.row._row;
    id = data.id;
    revision = data.revision + 1;
  } else {
    if (data.revision !== 0) fail("Invalid new record", 400);
    record = sheet(TEAM_SHEET, TEAM_COLUMNS);
    row = record.tab.getLastRow() + 1;
    id = Utilities.getUuid();
    revision = 1;
  }
  var updatedAt = new Date().toISOString();
  writeFields(record, row, {
    Name: clean(person.name),
    Email: clean(person.email).toLowerCase(),
    Position: clean(person.position),
    Status: person.status,
    Description: clean(person.description),
    Location: clean(person.location),
    Order: person.order,
    ID: id,
    Revision: revision,
    "Updated At": updatedAt,
  });
  return {
    success: true,
    id: id,
    revision: revision,
    person: {
      id: id,
      revision: revision,
      name: clean(person.name),
      email: clean(person.email).toLowerCase(),
      position: clean(person.position),
      status: person.status,
      description: clean(person.description),
      location: clean(person.location),
      order: person.order,
      updatedat: updatedAt,
    },
  };
}
function removeRecord(name, columns, data) {
  var found = findRecord(name, columns, data);
  found.record.tab.deleteRow(found.row._row);
  return { success: true, id: data.id };
}
function unsubscribe(data) {
  var found = findRecord(SUBSCRIBER_SHEET, SUBSCRIBER_COLUMNS, data);
  writeFields(found.record, found.row._row, {
    Status: "unsubscribed",
    Revision: data.revision + 1,
    "Updated At": new Date().toISOString(),
  });
  return { success: true, id: data.id };
}
function subscribe(data) {
  var name = clean(data.name),
    email = clean(data.email).toLowerCase();
  if (
    !name ||
    name.length > 120 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    fail("Invalid signup details", 400);
  if (data.updates !== "yes") fail("Explicit updates consent is required", 400);
  var record = sheet(SUBSCRIBER_SHEET, SUBSCRIBER_COLUMNS);
  var previous = rowsOf(record).filter(function (row) {
    return clean(row.email).toLowerCase() === email;
  })[0];
  var row = previous ? previous._row : record.tab.getLastRow() + 1;
  var id = (previous && previous.id) || Utilities.getUuid();
  writeFields(record, row, {
    Name: name,
    Email: email,
    Phone: clean(data.phone).slice(0, 40),
    "reCAPTCHA Score": clean(data.recaptchaScore).slice(0, 80),
    Date: new Date().toISOString(),
    Status: "subscribed",
    ID: id,
    Revision: (Number(previous && previous.revision) || 0) + 1,
    "Updated At": new Date().toISOString(),
  });
  return { success: true, message: "Opt-in saved" };
}
function readContent() {
  var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONTENT_SHEET);
  if (!tab || tab.getLastRow() < 2)
    return { success: true, content: {}, revision: 0, updatedAt: "" };
  var row = tab.getRange(2, 1, 1, 4).getValues()[0];
  return {
    success: true,
    content: JSON.parse(row[1] || "{}"),
    revision: Number(row[2]) || 0,
    updatedAt: scalar(row[3]) || "",
  };
}
function saveContent(data) {
  var current = readContent();
  if (!Number.isInteger(data.revision) || data.revision !== current.revision)
    fail("Website content changed. Reload before publishing.", 409);
  if (
    !data.content ||
    typeof data.content !== "object" ||
    Array.isArray(data.content) ||
    JSON.stringify(data.content).length > 50000
  )
    fail("Invalid website content", 400);
  var record = sheet(CONTENT_SHEET, ["Key", "Value", "Revision", "Updated At"]);
  var updatedAt = new Date().toISOString();
  writeFields(record, 2, {
    Key: "published",
    Value: JSON.stringify(data.content),
    Revision: current.revision + 1,
    "Updated At": updatedAt,
  });
  return {
    success: true,
    content: data.content,
    revision: current.revision + 1,
    updatedAt: updatedAt,
  };
}
function recordAudit(action, actor, id) {
  var record = sheet(AUDIT_SHEET, ["Date", "Actor", "Action", "Record ID"]);
  writeFields(record, record.tab.getLastRow() + 1, {
    Date: new Date().toISOString(),
    Actor: clean(actor && actor.email),
    Action: action,
    "Record ID": id,
  });
}
function buildJsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
