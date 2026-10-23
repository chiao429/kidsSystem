/**
 * kidsSystem Google Sheet 同步（獨立的 Apps Script 專案）
 *
 * Script Properties：
 *   ADMIN_BASE_URL  後台網址，例如 https://kids.example.org/admin 或 https://kids-admin.vercel.app
 *   SYNC_TOKEN      與 admin 環境變數 SYNC_TOKEN 相同
 *
 * 使用方式：貼上本檔 → 設定 Script Properties → 執行 setup() 一次並授權。
 * - tick()：每 TICK_MINUTES 分鐘觸發，請後台把資料庫變更推送到 Sheet，並為新活動補裝編輯觸發
 * - onSheetEdit(e)：Sheet 上有人修改可寫回的欄位時，送回後台寫入資料庫
 */

var TICK_MINUTES = 5;

function props_() {
  var p = PropertiesService.getScriptProperties();
  var base = (p.getProperty('ADMIN_BASE_URL') || '').replace(/\/+$/, '');
  var token = p.getProperty('SYNC_TOKEN') || '';
  if (!base || !token) throw new Error('請先設定 Script Properties：ADMIN_BASE_URL、SYNC_TOKEN');
  return { base: base, token: token };
}

function call_(method, path, body) {
  var p = props_();
  var res = UrlFetchApp.fetch(p.base + path, {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + p.token },
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) throw new Error(method + ' ' + path + ' → ' + code + ' ' + text.slice(0, 300));
  return JSON.parse(text);
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(TICK_MINUTES).create();
  installEditTriggers_(true);
  tick();
}

function tick() {
  installEditTriggers_(false);
  var result = call_('post', '/api/sync/push');
  console.log(JSON.stringify(result));
}

/** 對每份目標試算表安裝 onSheetEdit，並把不可寫回的欄位設為「僅警告」保護 */
function installEditTriggers_(force) {
  var info = call_('get', '/api/sync/targets');
  var ids = [info.master].concat(info.events.map(function (e) { return e.spreadsheetId; })).filter(String);
  var cache = PropertiesService.getScriptProperties();
  var installed = JSON.parse(cache.getProperty('INSTALLED') || '[]');
  var existing = ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'onSheetEdit'; })
    .map(function (t) { return t.getTriggerSourceId(); });

  ids.forEach(function (id) {
    if (existing.indexOf(id) < 0) ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(id).onEdit().create();
    if (force || installed.indexOf(id) < 0) {
      try {
        protect_(SpreadsheetApp.openById(id), info.tables);
      } catch (err) {
        console.warn('保護欄位失敗 ' + id + '：' + err);
      }
      if (installed.indexOf(id) < 0) installed.push(id);
    }
  });
  cache.setProperty('INSTALLED', JSON.stringify(installed));
}

function protect_(ss, tables) {
  tables.forEach(function (t) {
    var sheet = ss.getSheetByName(t.tab);
    if (!sheet || sheet.getLastColumn() === 0) return;
    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
      if (p.getDescription() === 'kidsSystem') p.remove();
    });
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    header.forEach(function (h, i) {
      if (t.editable.indexOf(h) >= 0) return;
      var p = sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).protect();
      p.setDescription('kidsSystem');
      p.setWarningOnly(true);
    });
  });
}

/** 已安裝的 onEdit 觸發：把可寫回欄位的修改送到後台 */
function onSheetEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  var tab = sheet.getName();
  var lastCol = sheet.getLastColumn();
  if (range.getRow() === 1 || lastCol === 0) return;
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var tables = JSON.parse(CacheService.getScriptCache().get('tables') || 'null');
  if (!tables) {
    tables = call_('get', '/api/sync/targets').tables;
    CacheService.getScriptCache().put('tables', JSON.stringify(tables), 600);
  }
  var def = tables.filter(function (t) { return t.tab === tab; })[0];
  if (!def) return;
  var idCol = header.indexOf(def.idColumn);
  if (idCol < 0) return;

  var single = range.getNumRows() === 1 && range.getNumColumns() === 1;
  var values = range.getValues();
  var edits = [];
  var cells = [];
  for (var r = 0; r < range.getNumRows(); r++) {
    var row = range.getRow() + r;
    var id = String(sheet.getRange(row, idCol + 1).getValue());
    if (!id) continue;
    for (var c = 0; c < range.getNumColumns(); c++) {
      var col = range.getColumn() + c;
      var h = header[col - 1];
      if (def.editable.indexOf(h) < 0) continue;
      edits.push({
        spreadsheetId: e.source.getId(),
        tab: tab,
        id: id,
        header: h,
        // 多格貼上時沒有 oldValue：送 null 讓後台以衝突處理，避免蓋掉系統中的新值
        oldValue: single ? (e.oldValue == null ? '' : String(e.oldValue)) : null,
        newValue: String(values[r][c]),
        editor: e.user && e.user.getEmail ? e.user.getEmail() : '',
      });
      cells.push(sheet.getRange(row, col));
    }
  }
  if (edits.length === 0) return;
  var res = call_('post', '/api/sync/edits', edits);
  res.results.forEach(function (x, i) {
    cells[i].setNote(x.status === 'applied' ? null : (x.status === 'conflict' ? '未寫入（衝突）：' : '未寫入：') + x.reason);
  });
}
