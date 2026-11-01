/**
 * SESJ Field Quote backend: a Google Sheet + Apps Script web app.
 *
 * The sheet holds two tabs, created automatically on first use:
 *   Quotes  one row per quote/job (readable columns + a JSON column the app uses)
 *   Rates   your standard rates; edit a Value here and every phone picks it up
 *
 * Setup (once):
 *   1. Create a Google Sheet. Extensions > Apps Script. Paste this file over Code.gs.
 *   2. Project Settings (gear) > Script properties > Add: name PIN, value = your PIN.
 *   3. Deploy > New deployment > type "Web app".
 *      Execute as: Me.  Who has access: Anyone.  Deploy, then copy the web app URL.
 *   4. In the quote tool: Rates tab > Connection > paste the URL and your PIN.
 * After editing this script later: Deploy > Manage deployments > edit > New version.
 */

const QUOTE_HEADERS = [
  "Job #", "Status", "Created", "Updated", "Customer", "Phone", "Email", "Address", "City / ZIP",
  "Crew", "Work", "Standard total", "Agreed total", "Discounts", "Tax", "Total",
  "Business share", "Pay each", "Fees off the top", "Quote notes", "Job notes",
  "Competitor quote", "Lost reason", "Completed", "ID", "JSON"
];
const RATE_HEADERS = ["Key", "Value", "What it means"];
const MAX_RETURN = 500;

function doGet() {
  return json_({ ok: true, app: "SESJ Field Quote backend", hint: "POST only." });
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) {
    return json_({ ok: false, error: "bad_request", message: "Body was not JSON." });
  }
  try {
    const pin = PropertiesService.getScriptProperties().getProperty("PIN");
    if (!pin) return json_({ ok: false, error: "not_setup", message: "Add a script property named PIN in Apps Script > Project Settings." });
    if (String(req.pin || "") !== String(pin)) return json_({ ok: false, error: "bad_pin", message: "Wrong PIN." });
    switch (req.action) {
      case "bootstrap": return json_({ ok: true, rates: readRates_(), quotes: readQuotes_(), serverTime: Date.now() });
      case "saveQuote": return json_({ ok: true, quote: saveQuote_(req.quote) });
      case "saveRates": writeRates_(req.rates || {}, req.labels || {}); return json_({ ok: true, rates: readRates_() });
      default: return json_({ ok: false, error: "bad_action", message: "Unknown action." });
    }
  } catch (err) {
    return json_({ ok: false, error: "server", message: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- quotes ---------- */
function readQuotes_() {
  const sh = sheet_("Quotes", QUOTE_HEADERS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const jsonCol = QUOTE_HEADERS.indexOf("JSON") + 1;
  const jobCol = QUOTE_HEADERS.indexOf("Job #") + 1;
  const agreedCol = QUOTE_HEADERS.indexOf("Agreed total") + 1;
  const statusCol = QUOTE_HEADERS.indexOf("Status") + 1;
  const rows = sh.getRange(2, 1, n, QUOTE_HEADERS.length).getValues();
  const out = [];
  rows.forEach(function (r) {
    let q = null;
    try { q = JSON.parse(r[jsonCol - 1]); } catch (err) { return; }
    if (!q || !q.id) return;
    q.jobNo = String(r[jobCol - 1] || q.jobNo || "");
    // Status edited by hand in the sheet wins, so the sheet can drive the app.
    const st = String(r[statusCol - 1] || "").toLowerCase();
    if (["quoted", "won", "lost", "done"].indexOf(st) >= 0) q.status = st;
    out.push(q);
  });
  out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  return out.slice(0, MAX_RETURN);
}

function nextJobNo_(createdAt) {
  const year = new Date(createdAt || Date.now()).getFullYear();
  const props = PropertiesService.getScriptProperties();
  const key = "SEQ_" + year;
  const n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return "SJ-" + year + "-" + ("00" + n).slice(-Math.max(3, String(n).length));
}

function saveQuote_(q) {
  if (!q || typeof q !== "object" || !q.id) throw new Error("Quote is missing its id.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_("Quotes", QUOTE_HEADERS);
    const idCol = QUOTE_HEADERS.indexOf("ID") + 1;
    const n = sh.getLastRow() - 1;
    let rowIdx = -1, existingNo = "";
    if (n > 0) {
      const ids = sh.getRange(2, idCol, n, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(q.id)) { rowIdx = i + 2; break; }
      if (rowIdx > 0) existingNo = String(sh.getRange(rowIdx, 1).getValue() || "");
    }
    q.jobNo = existingNo || q.jobNo || nextJobNo_(q.createdAt);
    q.syncedAt = Date.now();
    const row = rowFor_(q);
    if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return q;
  } finally {
    lock.releaseLock();
  }
}

function rowFor_(q) {
  const c = q.customer || {}, s = q.snapshot || {};
  const work = (s.lines || []).filter(function (l) { return l && l.r && !l.r.blocked; })
    .map(function (l) { return l.r.desc; }).join(" | ");
  const d = function (ms) { return ms ? new Date(ms) : ""; };
  const disc = (s.chosen || []).map(function (x) { return x.label; }).join(", ");
  return [
    q.jobNo, q.status || "quoted", d(q.createdAt), d(q.updatedAt), c.name || "", c.phone || "", c.email || "",
    c.address || "", c.city || "", q.crew || "", work, s.standard != null ? s.standard : "", s.agreed ? s.total : "",
    disc ? disc + " (" + (s.disc || 0) + ")" : "", s.tax || 0, s.total || 0,
    s.bizAmt != null ? s.bizAmt : "", s.each != null ? s.each : "", s.pass || 0,
    q.notes || "", q.jobNotes || "", q.competitor != null ? q.competitor : "", q.lostReason || "",
    d(q.doneAt), q.id, JSON.stringify(q)
  ];
}

/* ---------- rates ---------- */
function readRates_() {
  const sh = sheet_("Rates", RATE_HEADERS);
  const n = sh.getLastRow() - 1;
  const out = {};
  if (n < 1) return out;
  sh.getRange(2, 1, n, 2).getValues().forEach(function (r) {
    const k = String(r[0] || "").trim(), v = Number(r[1]);
    if (k && isFinite(v)) out[k] = v;
  });
  return out;
}

function writeRates_(rates, labels) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_("Rates", RATE_HEADERS);
    const n = sh.getLastRow() - 1;
    const keys = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    Object.keys(rates).forEach(function (k) {
      const v = Number(rates[k]);
      if (!isFinite(v)) return;
      const i = keys.indexOf(k);
      if (i >= 0) sh.getRange(i + 2, 2).setValue(v);
      else { sh.appendRow([k, v, labels[k] || ""]); keys.push(k); }
    });
  } finally {
    lock.releaseLock();
  }
}
