// EzBuilder canvas.
// The email is a normal document inside the iframe. Every color, font, and
// width is written on the element it belongs to. js/mail.js reads that
// document and builds the HTML that Salesforce and old Outlook receive.
// This file does not load a third-party library, a server, or a stylesheet from the network.
(function () {
  var STORE_KEY = 'ezbuilder-canvas';
  var MINE_KEY = 'ezbuilder-my-blocks';
  var ASSET_KEY = 'ezbuilder-assets';
  var assetMemory = [];
  var HIDDEN_ASSET_KEY = 'ezbuilder-assets-hidden';
  // Images removed from the library stay removed after a reload, even when the
  // email still uses them (the email itself is never changed by a removal).
  var hiddenAssets = (function () {
    try {
      var list = JSON.parse(localStorage.getItem('ezbuilder-assets-hidden') || '[]');
      var out = {};
      if (Array.isArray(list)) list.forEach(function (src) { if (typeof src === 'string') out[src] = true; });
      return out;
    } catch (err) { return {}; }
  })();
  var FONT = 'Arial, Helvetica, sans-serif';
  var FONTS = [FONT, 'Georgia, serif', '"Times New Roman", Times, serif', 'Verdana, Geneva, sans-serif', 'Tahoma, Geneva, sans-serif', '"Courier New", Courier, monospace'];
  var frame = document.getElementById('ez-frame');
  var doc = null;
  var extraCss = '';
  var bodyRules = defaultBody();
  var device = 'Desktop';
  var selectedEl = null;
  var picked = [];
  var undoStack = [];
  var redoStack = [];
  var listeners = {};
  var saveTimer = 0;
  var statusTimer = 0;
  var armed = false;
  var viewTab = 'blocks';
  var sectorOpen = {};
  var categoryOpen = {};
  var blockQuery = '';
  var boxesOn = false;
  var previewOn = false;
  var dragPayload = '';
  var layerState = new WeakMap();
  var linkedSides = {};

  var SEED = '<h1 data-ez="text" style="margin:0 0 8px;padding:28px 24px 0;font-family:' + FONT + ';font-size:28px;line-height:1.25;color:#2c2e35;">EzBuilder</h1>' +
    '<p data-ez="text" style="margin:0;padding:0 24px 28px;font-family:' + FONT + ';font-size:16px;line-height:1.5;color:#888686;">Click a block to add it to this 600px column. Double-click text to edit it. Paste HTML to bring in an existing email.</p>';

  var CANVAS_CSS = [
    'html{background:#eceef1;min-height:100%;}',
    'body{width:600px !important;max-width:100% !important;margin:0 auto !important;background:#fff;min-height:100%;',
    'font-family:' + FONT + ';color:#2c2e35;}',
    'body,td,th,p,div,a,li,h1,h2,h3,h4,h5,h6,span{overflow-wrap:anywhere;}',
    'img{max-width:100%;}',
    // A picture that has not loaded shows its alt text small and grey, never in the
    // block's big heading size. Editor only: this style is not in the email.
    'img{font:12px/1.3 Arial,Helvetica,sans-serif;color:#8a8f98;}',
    'table[data-nl="section"][data-nl-hug="1"]{max-width:100% !important;}',
    'table[data-nl="section"]:not([data-nl-hug="1"]){table-layout:fixed;}',
    'td.product-column{height:1px !important;}',
    'td.product-column > table{height:100% !important;}',
    'td.product-card{height:100% !important;}',
    'td[data-ez="cell"]:empty{min-height:36px;}',
    'table[data-ez="spacer"] td{background-image:repeating-linear-gradient(45deg, rgba(44,46,53,.07) 0 6px, transparent 6px 12px);}',
    'body:empty:before{content:"Drag a block here, click one in Blocks, or press Ctrl+K to insert.";display:block;margin:24px;padding:40px 24px;border:2px dashed #c4c7c5;border-radius:12px;text-align:center;color:#747775;font:15px/1.5 ' + FONT + ';}',
    'html.ez-boxes body *{outline:1px dotted rgba(170,170,170,.8);outline-offset:-1px;}',
    '.ez-selected{outline:2px solid __EZ_PRIMARY__;outline-offset:-2px;}',
    '.ez-hover{outline:1px solid __EZ_PRIMARY__;outline-offset:-1px;}',
    '.ez-drop{outline:1px dashed __EZ_PRIMARY__ !important;outline-offset:-2px;box-shadow:inset 0 0 0 9999px rgba(11,87,208,0.06);}',
    'html.ez-preview .ez-selected,html.ez-preview .ez-hover{outline:none !important;}',
    'html.ez-preview #ez-badge,html.ez-preview #ez-tools,html.ez-preview #ez-rte,html.ez-preview #ez-insert,html.ez-preview #ez-insert-label{display:none !important;}',
    'html.ez-preview.ez-boxes body *{outline:none !important;}',
    '#ez-insert,#ez-insert-label{position:fixed;z-index:10000;pointer-events:none;}',
    '#ez-insert{background:__EZ_PRIMARY__;border-radius:3px;box-shadow:0 0 0 2px rgba(255,255,255,.9),0 1px 6px rgba(11,87,208,.45);}',
    '#ez-insert-label{background:__EZ_PRIMARY__;color:__EZ_ON__;font:600 11px/1.2 Arial,Helvetica,sans-serif;padding:3px 7px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.2);}',
    '#ez-hovertag{position:fixed;z-index:9999;pointer-events:none;display:none;background:rgba(31,35,41,.86);color:#fff;font:600 10px/1 Arial,Helvetica,sans-serif;padding:3px 6px;border-radius:3px;white-space:nowrap;}',
    '.ez-handle{position:fixed;z-index:10004;display:none;box-sizing:border-box;background:#fff;border:2px solid __EZ_PRIMARY__;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.25);touch-action:none;}',
    '.ez-handle:hover,.ez-handle.is-active{background:__EZ_PRIMARY__;}',
    '.ez-h-img{width:12px;height:12px;cursor:nwse-resize;}',
    '.ez-h-y{width:28px;height:8px;border-radius:4px;cursor:ns-resize;}',
    '.ez-h-x{width:8px;height:28px;border-radius:4px;cursor:ew-resize;}',
    '.ez-h-col{width:8px;border-radius:4px;cursor:col-resize;background:rgba(255,255,255,.85);}',
    '#ez-size{position:fixed;z-index:10005;pointer-events:none;display:none;background:#1f2329;color:#fff;font:600 11px/1 Arial,Helvetica,sans-serif;padding:4px 7px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);}',
    'html.ez-resizing,html.ez-resizing *{user-select:none !important;}',
    'html.ez-preview .ez-handle,html.ez-preview #ez-hovertag,html.ez-preview #ez-size{display:none !important;}',
    '#ez-badge{position:fixed;z-index:10001;background:__EZ_PRIMARY__;color:__EZ_ON__;font:600 10px/1 Arial,Helvetica,sans-serif;padding:3px 6px;border-radius:3px;white-space:nowrap;cursor:pointer;}',
    '#ez-tools{position:fixed;z-index:10002;display:none;background:__EZ_PRIMARY__;border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.25);}',
    '#ez-tools button{width:28px;height:26px;border:0;background:transparent;color:__EZ_ON__;padding:0;cursor:pointer;}',
    '#ez-tools button svg{width:16px;height:16px;display:block;margin:0 auto;fill:currentColor;}',
    '#ez-tools button:hover{background:rgba(255,255,255,.16);}',
    '#ez-tools button[data-act="move"]{cursor:grab;}',
    '[contenteditable="true"]{outline:2px solid __EZ_PRIMARY__;cursor:text;}',
    'img[data-nl="inline-image"]{-webkit-user-drag:none;}',
    '#ez-rte{position:fixed;z-index:10003;display:none;gap:1px;background:#1f2329;border-radius:4px;padding:2px;box-shadow:0 2px 8px rgba(0,0,0,.3);}',
    '#ez-rte button{width:28px;height:26px;border:0;border-radius:3px;background:transparent;color:#fff;font:14px/1 Georgia,serif;padding:0;cursor:pointer;}',
    '#ez-rte button svg{width:16px;height:16px;display:block;margin:0 auto;fill:currentColor;}',
    '#ez-rte button:hover{background:rgba(255,255,255,.16);}',
    '#ez-rte button.is-on{background:__EZ_PRIMARY__;}',
    '[data-ez-hidden="1"]{display:none !important;}'
  ].join('');

  function defaultBody() {
    return { margin: '0', padding: '0', 'font-family': FONT };
  }

  function readStyle(style) {
    var map = {};
    var order = [];
    splitRaw(style).forEach(function (part) {
      var index = part.indexOf(':');
      if (index === -1) return;
      var key = part.slice(0, index).trim().toLowerCase();
      var value = part.slice(index + 1).trim();
      if (!key || !value) return;
      if (!map[key]) order.push(key);
      map[key] = value;
    });
    return { map: map, order: order };
  }

  function writeStyle(el, map, order) {
    var keys = (order || []).filter(function (key) { return map[key]; });
    Object.keys(map).forEach(function (key) {
      if (map[key] && keys.indexOf(key) === -1) keys.push(key);
    });
    var text = keys.map(function (key) { return key + ':' + map[key]; }).join(';');
    if (text) el.setAttribute('style', text);
    else el.removeAttribute('style');
  }

  function setDecl(el, name, value) {
    if (!el) return;
    var read = readStyle(el.getAttribute('style'));
    name = String(name || '').toLowerCase();
    if (value == null || value === '') delete read.map[name];
    else read.map[name] = value;
    writeStyle(el, read.map, read.order);
  }

  function decl(el, name) {
    return readStyle(el && el.getAttribute('style')).map[String(name || '').toLowerCase()] || '';
  }

  function round(n) { return Math.round(n * 100) / 100; }

  function cleanHref(value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return '';
    if (/[\s"'<>]/.test(v)) return null;
    if (/^(javascript|data):/i.test(v)) return null;
    if (/^\/\//.test(v)) return 'https:' + v;
    if (/^www\./i.test(v)) return 'https://' + v;
    if (/^(https?:|mailto:|tel:|cid:)/i.test(v)) return v;
    if (v.charAt(0) === '#') return v;
    if (/^%%[\s\S]*%%$/.test(v)) return v;
    if (/^\*\|[\s\S]*\|\*$/.test(v)) return v;
    return null;
  }

  function cleanSocialSrc(value) {
    var next = cleanHref(value);
    if (next == null) return null;
    if (!next) return '';
    if (!/^https?:\/\//i.test(next)) return null;
    return next;
  }

  // A custom social icon may be a web address or a cid: file. Data and script addresses are refused.
  function cleanSocialIconSrc(value) {
    var url = String(value == null ? '' : value).trim();
    if (!url) return '';
    if (/[\s"'<>]/.test(url) || /^(javascript|data):/i.test(url)) return null;
    if (/^(https?:|cid:)/i.test(url)) return url;
    if (/^\/\//.test(url)) return 'https:' + url;
    if (/^www\./i.test(url)) return 'https://' + url;
    return null;
  }

  function cleanSectionMinWidth(value) {
    var raw = String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '');
    if (!raw || raw === 'none' || raw === 'auto') return '';
    var match = raw.match(/^(\d+(?:\.\d+)?)(px|%)?$/);
    if (!match) return null;
    var n = parseFloat(match[1]);
    var unit = match[2] || 'px';
    if (!(n > 0)) return '';
    if (unit === '%') {
      if (n > 100) return null;
      return String(round(n)) + '%';
    }
    n = Math.round(n);
    if (n > 1200) return null;
    return n + 'px';
  }

  // A picture may be a web address or a PNG, JPEG, GIF, or WebP embedded from this computer.
  function cleanImageSrc(value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return '';
    if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(v)) {
      return v.replace(/^data:image\/jpg;/i, 'data:image/jpeg;');
    }
    return cleanHref(v);
  }

  function normalizeColor(value) {
    var raw = String(value || '').trim();
    var hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      return '#' + h.toLowerCase();
    }
    var rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!rgb) return '';
    function bite(n) { return ('0' + Math.max(0, Math.min(255, parseInt(n, 10))).toString(16)).slice(-2); }
    return '#' + bite(rgb[1]) + bite(rgb[2]) + bite(rgb[3]);
  }

  // What a color field passes on: a hex code (alpha dropped, Outlook has none),
  // rgb() as typed, a name or hsl() turned into hex, '' to clear, or null while
  // the text is not a color yet.
  var colorProbe = null;
  function colorValue(input) {
    var raw = String(input == null ? '' : input).trim();
    if (!raw) return '';
    var bare = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (bare) {
      var h = bare[1].toLowerCase();
      if (h.length === 4) h = h.slice(0, 3);
      if (h.length === 8) h = h.slice(0, 6);
      return '#' + h;
    }
    if (/^#/.test(raw)) return null;
    if (/^rgba?\(/i.test(raw)) {
      if (!normalizeColor(raw)) return null;
      var alpha = raw.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/i);
      return alpha && parseFloat(alpha[1]) === 0 ? '' : raw;
    }
    if (/^(transparent|none|inherit|initial|unset|revert|currentcolor)$/i.test(raw)) return '';
    if (!colorProbe) {
      colorProbe = document.createElement('span');
      colorProbe.style.display = 'none';
      document.body.appendChild(colorProbe);
    }
    colorProbe.style.color = '';
    colorProbe.style.color = raw;
    if (!colorProbe.style.color) return null;
    var out = normalizeColor(window.getComputedStyle(colorProbe).color);
    var a = window.getComputedStyle(colorProbe).color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/i);
    if (a && parseFloat(a[1]) === 0) return '';
    return out || null;
  }

  function escapeStyle(css) {
    return String(css || '').replace(/<\/style/gi, '<\\/style');
  }

  function cleanHtml(html) {
    var tpl = doc.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll('#ez-insert, #ez-insert-label, #ez-badge, #ez-tools').forEach(function (el) { el.remove(); });
    tpl.content.querySelectorAll('.ez-selected, .ez-hover, .ez-drop').forEach(function (el) {
      el.classList.remove('ez-selected', 'ez-hover', 'ez-drop');
      if (!el.getAttribute('class')) el.removeAttribute('class');
    });
    tpl.content.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); });
    tpl.content.querySelectorAll('[data-ez-moving]').forEach(function (el) { el.removeAttribute('data-ez-moving'); });
    tpl.content.querySelectorAll('[data-ez-fresh]').forEach(function (el) { el.removeAttribute('data-ez-fresh'); });
    tpl.content.querySelectorAll('img[data-ez-src]').forEach(function (img) {
      var real = img.getAttribute('data-ez-src');
      img.removeAttribute('data-ez-src');
      if (real) img.setAttribute('src', real);
      else img.removeAttribute('src');
    });
    tpl.content.querySelectorAll('img[src="##"]').forEach(function (img) { img.removeAttribute('src'); });
    // Hidden from the Layers eye is an editor view only. The email keeps the block.
    tpl.content.querySelectorAll('[data-ez-hidden]').forEach(function (el) { el.removeAttribute('data-ez-hidden'); });
    tpl.content.querySelectorAll('[draggable]').forEach(function (el) { el.removeAttribute('draggable'); });
    return tpl.innerHTML;
  }

  function capture() {
    return JSON.stringify({ html: cleanHtml(doc.body.innerHTML), css: extraCss, body: bodyRules });
  }

  function snapshot() {
    var now = capture();
    if (undoStack.length && undoStack[undoStack.length - 1] === now) return;
    undoStack.push(now);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
  }

  function restore(raw) {
    var data = JSON.parse(raw);
    extraCss = data.css || '';
    bodyRules = data.body || defaultBody();
    doc.body.innerHTML = data.html || '';
    applyBody();
    applyExtraCss();
    markTree(doc.body);
    select(null);
    changed();
  }

  function undo() {
    if (editing) endEdit();
    if (!undoStack.length) { status('Nothing to undo.'); return; }
    redoStack.push(capture());
    restore(undoStack.pop());
    armed = false;
    status('Undone');
  }

  function redo() {
    if (editing) endEdit();
    if (!redoStack.length) { status('Nothing to redo.'); return; }
    undoStack.push(capture());
    restore(redoStack.pop());
    armed = false;
    status('Redone');
  }

  function status(text, kind) {
    if (text && window.EzToast) window.EzToast(text, kind);
    var node = document.getElementById('ez-status');
    if (!node) return;
    node.textContent = text || '';
    clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(function () { node.textContent = ''; }, 3400);
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = 0; saveNow(); }, 300);
  }

  var saveFailed = false;
  function saveNow() {
    clearTimeout(saveTimer);
    if (!doc || !doc.body) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        html: cleanHtml(doc.body.innerHTML),
        css: extraCss,
        body: bodyRules
      }));
      if (saveFailed) status('Saving in this browser works again.', 'ok');
      saveFailed = false;
    } catch (err) {
      // Usually the browser's storage is full (large uploaded pictures). The email
      // stays on screen; say so once instead of failing silently.
      if (!saveFailed) status('This browser could not save the email (storage is full). Copy HTML to keep your work, or use web addresses for pictures.', 'error');
      saveFailed = true;
    }
  }
  window.addEventListener('pagehide', function () { if (saveTimer) saveNow(); });

  function changed() {
    colorCache = null;
    saveSoon();
    trigger('update');
    placeChrome();
  }

  function on(name, fn) {
    (listeners[name] || (listeners[name] = [])).push(fn);
  }

  function trigger(name) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(); } catch (err) {}
    });
  }

  function applyBody() {
    var parts = [];
    Object.keys(bodyRules).forEach(function (key) {
      if (bodyRules[key]) parts.push(key + ':' + bodyRules[key]);
    });
    doc.body.setAttribute('style', parts.join(';'));
  }

  function applyExtraCss() {
    var node = doc.getElementById('ez-extra');
    if (!node) return;
    node.textContent = extraCss || '';
  }

  function setBodyStyle(rules) {
    Object.keys(rules || {}).forEach(function (key) {
      if (rules[key] == null || rules[key] === '') delete bodyRules[key];
      else bodyRules[key] = rules[key];
    });
    applyBody();
    changed();
  }

  function canvasTone() {
    var tone = getComputedStyle(document.documentElement).getPropertyValue('--nl-canvas').trim();
    return tone || '#eceef1';
  }

  function canvasCssText() {
    var primary = '#0B57D0';
    var on = '#ffffff';
    try {
      var style = getComputedStyle(document.documentElement);
      primary = style.getPropertyValue('--nl-primary').trim() || primary;
      on = style.getPropertyValue('--nl-on-primary').trim() || on;
    } catch (err) {}
    return CANVAS_CSS
      .replace('html{background:#eceef1;', 'html{background:' + canvasTone() + ';')
      .replace(/__EZ_PRIMARY__/g, primary)
      .replace(/__EZ_ON__/g, on);
  }

  function paintTone() {
    if (!doc) return;
    var node = doc.getElementById('ez-canvas');
    if (!node) return;
    node.textContent = canvasCssText();
    if (boxesOn) doc.documentElement.classList.add('ez-boxes');
    if (previewOn) doc.documentElement.classList.add('ez-preview');
  }

  function firstRowCells(table) {
    var cells = [];
    if (!table || !table.rows || !table.rows.length) return cells;
    Array.prototype.forEach.call(table.rows[0].cells, function (cell) { cells.push(cell); });
    return cells;
  }

  function allCells(table) {
    var cells = [];
    if (!table || !table.rows) return cells;
    Array.prototype.forEach.call(table.rows, function (row) {
      Array.prototype.forEach.call(row.cells, function (cell) { cells.push(cell); });
    });
    return cells;
  }

  function buttonAnchor(cell) {
    var found = null;
    function look(node) {
      Array.prototype.forEach.call(node.children, function (child) {
        if (found || child.tagName === 'TABLE') return;
        if (child.tagName === 'A') found = child;
        else look(child);
      });
    }
    if (cell) look(cell);
    return found;
  }

  function isButtonTable(table) {
    if (!table || table.tagName !== 'TABLE') return false;
    if (table.getAttribute('data-nl')) return false;
    var marked = table.getAttribute('data-ez') === 'button';
    var width = String(decl(table, 'width') || table.getAttribute('width') || '').replace(/\s+/g, '');
    if (!marked && (width === '100%' || /%$/.test(width) || /max-width\s*:\s*100%/i.test(table.getAttribute('style') || ''))) return false;
    var cells = allCells(table);
    if (cells.length !== 1) return false;
    var cell = cells[0];
    if (cell.getAttribute('data-nl')) return false;
    if (/\b(divider|product-card|product-column|product-gap)\b/.test(cell.className || '')) return false;
    return !!buttonAnchor(cell);
  }

  // A button is a table, its one cell and the link inside. Each can be
  // selected on its own, and a corner, fill or outline written to only one of
  // them left the others showing behind it. They are edited as one button.
  function buttonOf(el) {
    if (!el || !el.tagName) return null;
    if (isButtonTable(el)) return el;
    if (el.tagName !== 'TD' && el.tagName !== 'TH' && el.tagName !== 'A') return null;
    var table = el.parentElement && el.parentElement.closest ? el.parentElement.closest('table') : null;
    if (!table || !isButtonTable(table)) return null;
    var cell = allCells(table)[0];
    return (el === cell || el === buttonAnchor(cell)) ? table : null;
  }

  function pctOf(cell) {
    var raw = String(decl(cell, 'width') || cell.getAttribute('width') || '').trim();
    var match = raw.match(/^(\d+(?:\.\d+)?)%$/);
    return match ? parseFloat(match[1]) : 0;
  }

  function percentColumns(row) {
    return Array.prototype.filter.call(row.cells, function (cell) {
      return cell.getAttribute('data-nl') !== 'hspacer' && pctOf(cell) > 0;
    });
  }

  function writePct(cell, n) {
    var next = round(n) + '%';
    setDecl(cell, 'width', next);
    if (/%$/.test(String(cell.getAttribute('width') || ''))) cell.setAttribute('width', next);
    if (cell.hasAttribute('data-nl-col')) cell.setAttribute('data-nl-col', next);
  }

  function rescale(cells, total) {
    var sum = cells.reduce(function (acc, cell) { return acc + pctOf(cell); }, 0);
    if (!sum || !(total > 0)) return;
    if (Math.abs(total - Math.round(total)) < 0.05) total = Math.round(total);
    var factor = total / sum;
    var used = 0;
    cells.forEach(function (cell, index) {
      var share = index === cells.length - 1 ? round(total - used) : round(pctOf(cell) * factor);
      used += share;
      writePct(cell, share);
    });
  }

  function readGap(gap) {
    var raw = String(decl(gap, 'width') || gap.getAttribute('width') || '').trim();
    var match = raw.match(/^(\d+(?:\.\d+)?)(px|%)?$/i);
    return {
      n: match ? parseFloat(match[1]) : 24,
      unit: match && match[2] === '%' ? '%' : 'px',
      bg: decl(gap, 'background-color') || gap.getAttribute('bgcolor') || ''
    };
  }

  function gapShare(gap, row) {
    var values = readGap(gap);
    if (values.unit === '%') return values.n;
    var width = row.getBoundingClientRect().width || 600;
    return values.n / width * 100;
  }

  function clampGap(n, unit, row) {
    var width = row.getBoundingClientRect().width || 600;
    var limit = unit === '%' ? 50 : Math.min(300, Math.round(width / 2));
    if (!(n > 0)) n = unit === '%' ? 4 : 24;
    return Math.max(1, Math.min(limit, unit === '%' ? round(n) : Math.round(n)));
  }

  function gapCell(n, unit, bg) {
    var td = doc.createElement('td');
    td.setAttribute('data-nl', 'hspacer');
    td.setAttribute('data-ez', 'hspacer');
    td.setAttribute('aria-hidden', 'true');
    td.setAttribute('width', unit === '%' ? n + '%' : String(n));
    var style = 'width:' + (unit === '%' ? n + '%' : n + 'px') + ';font-size:0;line-height:0;mso-line-height-rule:exactly;';
    if (bg) {
      style += 'background-color:' + bg + ';';
      td.setAttribute('bgcolor', bg);
    }
    td.setAttribute('style', style);
    td.innerHTML = '&nbsp;';
    return td;
  }

  function writeGap(gap, values) {
    gap.setAttribute('width', values.unit === '%' ? values.n + '%' : String(values.n));
    setDecl(gap, 'width', values.unit === '%' ? values.n + '%' : values.n + 'px');
    setDecl(gap, 'font-size', '0');
    setDecl(gap, 'line-height', '0');
    setDecl(gap, 'mso-line-height-rule', 'exactly');
    if (values.bg) {
      gap.setAttribute('bgcolor', values.bg);
      setDecl(gap, 'background-color', values.bg);
    } else {
      gap.removeAttribute('bgcolor');
      setDecl(gap, 'background-color', '');
    }
    if (!gap.textContent) gap.innerHTML = '&nbsp;';
  }

  function setGap(gap, next) {
    var row = gap.parentElement;
    var before = readGap(gap);
    var values = {
      n: clampGap(next.n, next.unit, row),
      unit: next.unit === '%' ? '%' : 'px',
      bg: next.bg || ''
    };
    if (values.unit !== before.unit) {
      var width = row.getBoundingClientRect().width || 600;
      values.n = values.unit === '%' ? round(before.n / width * 100) : Math.round(before.n * width / 100);
      values.n = clampGap(values.n, values.unit, row);
    }
    if (percentColumns(row).length) {
      var total = percentColumns(row).reduce(function (acc, cell) { return acc + pctOf(cell); }, 0) + gapShare(gap, row);
      writeGap(gap, values);
      rescale(percentColumns(row), total - gapShare(gap, row));
    } else writeGap(gap, values);
  }

  function giveGapBack(gap) {
    var row = gap.parentElement;
    if (!row) return;
    var cols = percentColumns(row);
    if (!cols.length) return;
    var total = cols.reduce(function (acc, cell) { return acc + pctOf(cell); }, 0) + gapShare(gap, row);
    rescale(cols, total);
  }

  function columnCell(hint) {
    var el = hint || selectedEl;
    if (!el || !el.closest) return null;
    var cell = (el.tagName === 'TD' || el.tagName === 'TH') ? el : el.closest('td, th');
    if (!cell || cell.getAttribute('data-nl') === 'hspacer') return null;
    if (cell.parentElement && cell.parentElement.tagName !== 'TR') return null;
    var table = cell.parentElement.parentElement;
    if (table && table.tagName === 'TBODY') table = table.parentElement;
    if (isButtonTable(table)) return columnCell(table.parentElement);
    return cell;
  }

  function insertGap(cell, before) {
    var row = cell.parentElement;
    var cols = percentColumns(row);
    var hasPercent = cols.length > 0;
    var width = row.getBoundingClientRect().width || 600;
    var unit = hasPercent ? '%' : 'px';
    var n = clampGap(hasPercent ? round(24 / width * 100) : 24, unit, row);
    var total = cols.reduce(function (acc, item) { return acc + pctOf(item); }, 0);
    var gap = gapCell(n, unit, '');
    if (before) row.insertBefore(gap, cell);
    else if (cell.nextSibling) row.insertBefore(gap, cell.nextSibling);
    else row.appendChild(gap);
    if (hasPercent) rescale(percentColumns(row), total - n);
    return gap;
  }

  function settleDrops() {
    Array.prototype.slice.call(doc.querySelectorAll('[data-nl="hspacer-drop"]')).forEach(function (table) {
      var cell = table.closest && table.closest('td, th');
      if (!cell) {
        table.remove();
        return;
      }
      insertGap(cell, false);
      table.remove();
    });
  }

  function outerBackgroundCell(table) {
    if (!table || table.getAttribute('data-nl') !== 'section' || firstRowCells(table).length < 2) return null;
    var cell = table.parentElement;
    while (cell && cell !== doc.body && cell.tagName !== 'TD' && cell.tagName !== 'TH') cell = cell.parentElement;
    if (!cell || (cell.tagName !== 'TD' && cell.tagName !== 'TH')) return null;
    var owner = cell.parentElement;
    while (owner && owner !== doc.body && owner.tagName !== 'TABLE') owner = owner.parentElement;
    if (!owner || owner.getAttribute('data-nl') !== 'section') return null;
    if (firstRowCells(owner).indexOf(cell) === -1) return null;
    return cell;
  }

  function clearBackgroundImage(el) {
    ['background-image', 'background-repeat', 'background-position', 'background-size'].forEach(function (name) {
      setDecl(el, name, '');
    });
    if (/\burl\(/i.test(decl(el, 'background'))) setDecl(el, 'background', '');
    el.removeAttribute('background');
  }

  function setBackgroundImage(el, url) {
    var href = cleanImageSrc(url);
    if (href == null) return false;
    var host = el;
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section') {
      var outer = outerBackgroundCell(el);
      if (outer) {
        var color = decl(el, 'background-color') || el.getAttribute('bgcolor') || '';
        clearBackgroundImage(el);
        if (color) {
          setDecl(el, 'background-color', '');
          el.removeAttribute('bgcolor');
          outer.setAttribute('bgcolor', color);
          setDecl(outer, 'background-color', color);
        }
        host = outer;
      }
    }
    if (!href) {
      clearBackgroundImage(host);
      return true;
    }
    host.setAttribute('background', href);
    setDecl(host, 'background-image', "url('" + href.replace(/'/g, '') + "')");
    if (!decl(host, 'background-repeat')) setDecl(host, 'background-repeat', 'no-repeat');
    if (!decl(host, 'background-position')) setDecl(host, 'background-position', 'center center');
    if (!decl(host, 'background-size')) setDecl(host, 'background-size', 'cover');
    var typing = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-ez-field') === 'bg-image';
    if (!typing) rememberAsset(href);
    return true;
  }

  function paintSolid(el, color) {
    var hex = color ? normalizeColor(color) || color : '';
    if (color && !normalizeColor(color) && !/^#[0-9a-f]{3,8}$/i.test(color)) return false;
    if (!hex) {
      el.removeAttribute('bgcolor');
      setDecl(el, 'background-color', '');
      return true;
    }
    el.setAttribute('bgcolor', hex);
    setDecl(el, 'background-color', hex);
    return true;
  }

  // A button color stays on the button's own cell and its link.
  // The column behind it is a different element and is left alone.
  function paintButtonColor(table, color) {
    var cell = allCells(table)[0];
    var link = cell && buttonAnchor(cell);
    if (!cell) return;
    var hex = color ? (normalizeColor(color) || '') : '';
    if (color && !hex) return;
    paintSolid(cell, hex);
    if (link) setDecl(link, 'background-color', hex);
  }

  function alignNarrow(el, align) {
    if (!el) return;
    if (el.tagName !== 'TABLE' && el.tagName !== 'IMG' && el.tagName !== 'DIV') return;
    if (el.getAttribute('data-nl') === 'section') return;
    var width = String(decl(el, 'width') || el.getAttribute('width') || '');
    if (width === '100%' || (/%$/.test(width) && parseFloat(width) >= 99)) return;
    var read = readStyle(el.getAttribute('style'));
    var parts = String(read.map.margin || '').trim().split(/\s+/).filter(Boolean);
    var top = read.map['margin-top'] || parts[0] || '0';
    var bottom = read.map['margin-bottom'] || (parts.length > 2 ? parts[2] : parts[0]) || '0';
    delete read.map.margin;
    read.map['margin-top'] = top;
    read.map['margin-bottom'] = bottom;
    read.map['margin-left'] = align === 'left' ? '0' : 'auto';
    read.map['margin-right'] = align === 'right' ? '0' : 'auto';
    // align="left" or "right" floats a table or picture so the next block wraps
    // beside it. The margins already place it, so stop the float.
    if ((el.tagName === 'TABLE' || el.tagName === 'IMG') && !read.map.float) read.map.float = 'none';
    writeStyle(el, read.map, read.order);
    if (el.tagName === 'TABLE' || el.tagName === 'IMG') el.setAttribute('align', align || 'left');
  }

  function alignContents(cell, align) {
    Array.prototype.forEach.call(cell.children, function (child) { alignNarrow(child, align); });
  }

  function setTextAlign(el, align) {
    setDecl(el, 'text-align', align || '');
    if (el.tagName === 'TD' || el.tagName === 'TH') {
      if (align) el.setAttribute('align', align);
      else el.removeAttribute('align');
      alignContents(el, align || 'left');
    }
  }

  function setBoxAlign(el, align) {
    alignNarrow(el, align || 'left');
    setDecl(el, 'text-align', align || '');
  }

  function setValign(el, value) {
    if (!el || !value) return;
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section') {
      firstRowCells(el).forEach(function (cell) { setValign(cell, value); });
      return;
    }
    el.setAttribute('valign', value);
    setDecl(el, 'vertical-align', value);
  }

  function socialTableOf(el) {
    if (!el) return null;
    if (el.getAttribute('data-nl') === 'social-icons') return el;
    if (el.closest) {
      var own = el.closest('[data-nl="social-icons"]');
      if (own) return own;
    }
    return el.querySelector ? el.querySelector('[data-nl="social-icons"]') : null;
  }

  function socialRowFrom(el) {
    if (!el) return null;
    if (el.getAttribute && el.getAttribute('data-nl') === 'social-group') return el;
    if (el.closest) {
      var row = el.closest('tr[data-nl="social-group"]');
      if (row) return row;
    }
    var table = socialTableOf(el);
    return table ? table.querySelector('tr[data-nl="social-group"]') : null;
  }

  function socialIcons(table) {
    var row = table && table.querySelector('tr[data-nl="social-group"]');
    if (!row) return [];
    return Array.prototype.filter.call(row.cells, function (cell) {
      return cell.getAttribute('data-nl') === 'social-element';
    });
  }

  function spaceSocial(table) {
    if (!table) return;
    var gap = parseInt(table.getAttribute('data-nl-gap'), 10);
    if (!(gap >= 0)) return;
    gap = Math.min(60, gap);
    var icons = socialIcons(table);
    var total = 0;
    icons.forEach(function (cell, index) {
      var left = index === 0 ? 0 : Math.floor(gap / 2);
      var right = index === icons.length - 1 ? 0 : Math.ceil(gap / 2);
      function px(n) { return n ? n + 'px' : '0'; }
      setDecl(cell, 'padding', px(0) + ' ' + px(right) + ' ' + px(0) + ' ' + px(left));
      var img = cell.querySelector('img');
      var size = img ? (parseInt(img.getAttribute('width'), 10) || 24) : 24;
      total += size + left + right;
    });
    if (!icons.length) return;
    table.setAttribute('width', String(total));
    setDecl(table, 'width', total + 'px');
  }

  function setSocialGap(table, value) {
    var gap = Math.max(0, Math.min(60, Math.round(parseFloat(value) || 0)));
    table.setAttribute('data-nl-gap', String(gap));
    spaceSocial(table);
  }

  function nodesFrom(html) {
    var source = String(html || '').trim();
    var tpl = doc.createElement('template');
    // A bare cell is only valid inside a row. Parse it in a table, then lift it out.
    if (/^<td\b/i.test(source)) {
      tpl.innerHTML = '<table><tr>' + source + '</tr></table>';
      var cell = tpl.content.querySelector('td');
      return cell ? [cell] : [];
    }
    tpl.innerHTML = source;
    return Array.prototype.filter.call(tpl.content.childNodes, function (node) { return node.nodeType === 1; });
  }

  function htmlFor(id) {
    if (String(id).indexOf('mine:') === 0) {
      var key = id.slice(5);
      var found = readMine().filter(function (block) { return block.id === key; })[0];
      return found ? found.html : '';
    }
    return window.EzBlocks.html(id);
  }

  function upperHalf(el, point) {
    if (!el || !point) return false;
    var rect = el.getBoundingClientRect();
    return point.y < rect.top + rect.height / 2;
  }

  function leftHalf(el, point) {
    if (!el || !point) return false;
    var rect = el.getBoundingClientRect();
    return point.x < rect.left + rect.width / 2;
  }

  // The block that holds el: the element that sits straight in a column or the body.
  function blockRoot(el) {
    var cursor = el;
    while (cursor && cursor.parentElement && cursor.parentElement !== doc.body) {
      var parent = cursor.parentElement;
      if ((parent.tagName === 'TD' || parent.tagName === 'TH') && !parent.getAttribute('data-nl') && !isButtonTable(parent.closest('table'))) return cursor;
      cursor = parent;
    }
    return cursor;
  }

  // Cells that hold one part of a built block. Nothing else drops inside them.
  function sealedCell(cell) {
    if (!cell || (cell.tagName !== 'TD' && cell.tagName !== 'TH')) return false;
    var mark = cell.getAttribute('data-nl') || '';
    if (mark === 'hspacer' || mark === 'social-element' || mark === 'social-wrap') return true;
    if (cell.closest('[data-nl="social-icons"], [data-nl="social-plate"]')) return true;
    var table = cell.closest('table');
    if (table && (isButtonTable(table) || table.getAttribute('data-ez') === 'spacer' || table.getAttribute('data-ez') === 'divider')) return true;
    return false;
  }

  function spotBeside(el, point) {
    return { parent: el.parentElement || doc.body, before: upperHalf(el, point) ? el : el.nextSibling };
  }

  function destination(hint, point) {
    if (forcedSpot) return forcedSpot;
    var el = hint || selectedEl;
    if (!el || el === doc.body || el === doc.documentElement) return { parent: doc.body, before: null };
    // Social icons, spacer gaps, button cells, divider and spacer lines take no blocks.
    // The block goes before or after the whole block they belong to.
    var sealed = el.closest && el.closest('td, th');
    while (sealed && sealedCell(sealed)) {
      var root = blockRoot(sealed);
      if (root && root !== sealed && root.parentElement) return spotBeside(root, point);
      sealed = sealed.parentElement && sealed.parentElement.closest('td, th');
    }
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section' && firstRowCells(el).length === 1) {
      return { parent: firstRowCells(el)[0], before: null };
    }
    if ((el.tagName === 'TD' || el.tagName === 'TH') && !sealedCell(el)) {
      return { parent: el, before: null };
    }
    if (el.tagName === 'A' && el.getAttribute('data-ez') === 'link-block') return { parent: el, before: null };
    var button = el.closest && el.closest('table');
    if (button && isButtonTable(button) && (el === button || button.contains(el))) {
      return spotBeside(button, point);
    }
    if (el.tagName === 'TR' || el.tagName === 'TBODY' || el.tagName === 'THEAD' || el.tagName === 'TFOOT') {
      var owner = el.closest('table');
      return owner ? spotBeside(owner, point) : { parent: doc.body, before: null };
    }
    // Inside a text the block goes beside the text, never into its words.
    var text = textBoxOf(el);
    if (text && text !== el && text.contains(el)) el = text;
    if (el.parentElement && el !== doc.body) {
      var parent = el.parentElement;
      if (parent.tagName === 'TR' || parent.tagName === 'TBODY' || parent.tagName === 'TABLE') {
        var table = el.closest('table');
        return table && table !== el ? spotBeside(table, point) : spotBeside(el, point);
      }
      return spotBeside(el, point);
    }
    return { parent: doc.body, before: null };
  }

  function takePlaceholder(parent, incoming) {
    if (!parent || !parent.getAttribute || parent.getAttribute('data-ez') !== 'cell') return;
    var kids = Array.prototype.filter.call(parent.children, function (node) { return node.nodeType === 1; });
    if (kids.length === 1 && kids[0].getAttribute('data-ez-placeholder') === '1' && kids[0] !== incoming) kids[0].remove();
  }

  function putNodes(nodes, spot) {
    var ref = spot.before;
    nodes.forEach(function (node) {
      if (ref && ref.parentNode === spot.parent) spot.parent.insertBefore(node, ref);
      else spot.parent.appendChild(node);
    });
  }

  function add(id, hint, point) {
    if (id === 'email-hspacer') {
      var cell = columnCell(hint);
      if (!cell) {
        status('A horizontal spacer sits beside a column.');
        return null;
      }
      snapshot();
      var gap = insertGap(cell, leftHalf(cell, point));
      select(gap);
      changed();
      return gap;
    }
    if (id === 'email-social-element') return addSocial(hint || selectedEl, 'facebook');
    var html = htmlFor(id);
    if (!html) return null;
    var nodes = nodesFrom(html);
    if (!nodes.length) return null;
    var spot = destination(hint, point);
    if (nodes[0].tagName === 'TD') {
      status('That block has to go inside a row.');
      return null;
    }
    snapshot();
    takePlaceholder(spot.parent);
    putNodes(nodes, spot);
    var root = nodes[0];
    var social = socialTableOf(root);
    if (social) spaceSocial(social);
    markTree(doc.body);
    select(root);
    changed();
    // The Image block opens the image library at once.
    if (id === 'image' && root.tagName === 'IMG' && !add.quiet) pickImageFor(root);
    return root;
  }

  function addSocial(hint, network) {
    var row = socialRowFrom(hint);
    if (!row) {
      status('A social icon only drops into a Group Social row.');
      return null;
    }
    var node = nodesFrom(window.EzBlocks.cell(network || 'facebook'))[0];
    if (!node) return null;
    snapshot();
    row.appendChild(node);
    spaceSocial(row.closest('[data-nl="social-icons"]'));
    select(node);
    changed();
    return node;
  }

  function removeNode(el) {
    if (!el || el === doc.body) return;
    if (el.getAttribute('data-nl') === 'hspacer') {
      giveGapBack(el);
      el.remove();
      return;
    }
    if (el.getAttribute('data-ez') === 'cell' && el.closest('table[data-nl="section"]')) {
      el.innerHTML = '';
      return;
    }
    if (el.getAttribute('data-nl') === 'social-element') {
      var table = el.closest('[data-nl="social-icons"]');
      el.remove();
      spaceSocial(table);
      return;
    }
    el.remove();
  }

  function removeSelected() {
    var nodes = outermost(picked.filter(Boolean));
    if (!nodes.length) return;
    snapshot();
    nodes.forEach(removeNode);
    select(null);
    changed();
  }

  function isHud(node) {
    if (!node || !node.closest) return false;
    return !!node.closest('#ez-insert, #ez-insert-label, #ez-badge, #ez-tools, #ez-rte, #ez-hovertag, .ez-handle, #ez-size');
  }

  var TEXT_TAGS = /^(P|H[1-6]|LI|BLOCKQUOTE)$/;
  var INLINE_TAGS = /^(A|B|I|U|S|EM|STRONG|SPAN|FONT|BR|SMALL|SUB|SUP|BIG|MARK|STRIKE|CODE|IMG|LABEL|ABBR|TIME|WBR|DEL|INS|Q|CITE)$/;

  // A box whose content is only words and inline tags is one Text. Clicking a
  // word selects that box, not the cell around it.
  function isTextBox(el) {
    if (!el || el.nodeType !== 1 || el === doc.body) return false;
    if (el.tagName === 'TD' || el.tagName === 'TH' || el.tagName === 'TABLE' || el.tagName === 'TR' || el.tagName === 'TBODY') return false;
    if (el.tagName === 'IMG' || el.tagName === 'BR') return false;
    if (isHud(el)) return false;
    var words = false;
    for (var node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3) {
        if (node.nodeValue.replace(/\u00a0/g, ' ').trim()) words = true;
        continue;
      }
      if (node.nodeType !== 1) continue;
      if (!INLINE_TAGS.test(node.tagName)) return false;
      if (node.tagName === 'IMG') {
        if (node.getAttribute('data-nl') !== 'inline-image') return false;
        continue;
      }
      if (node.querySelector && node.querySelector('table, div, p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote')) return false;
      if (node.querySelector && Array.prototype.some.call(node.querySelectorAll('img'), function (img) { return img.getAttribute('data-nl') !== 'inline-image'; })) return false;
      if ((node.textContent || '').replace(/\u00a0/g, ' ').trim()) words = true;
    }
    if (TEXT_TAGS.test(el.tagName)) return true;
    return words;
  }

  function textBoxOf(node) {
    var found = null;
    var cursor = node;
    while (cursor && cursor.nodeType === 1 && cursor !== doc.body) {
      if (cursor.tagName === 'TD' || cursor.tagName === 'TH' || cursor.tagName === 'TABLE') break;
      if (cursor.getAttribute('data-ez') === 'link-block' && cursor !== node) break;
      if (isTextBox(cursor)) found = cursor;
      else if (found) break;
      cursor = cursor.parentElement;
    }
    return found;
  }

  function hitTarget(node) {
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentElement;
    if (!node || node === doc.body || node === doc.documentElement || isHud(node)) return null;
    var socialCell = node.closest && node.closest('[data-nl="social-element"]');
    if (socialCell) return socialCell;
    if (node.tagName === 'IMG' && node.getAttribute('data-nl') !== 'inline-image') {
      var wrap = node.closest('table');
      if (!(wrap && isButtonTable(wrap))) return node;
    }
    var cursor = node;
    while (cursor && cursor !== doc.body) {
      if (cursor.tagName === 'TABLE' && isButtonTable(cursor)) return cursor;
      cursor = cursor.parentElement;
    }
    if (node.tagName === 'IMG' && node.getAttribute('data-nl') === 'inline-image') return node;
    var marked = node.closest && node.closest('[data-ez]');
    var text = textBoxOf(node);
    if (text && (!marked || marked === text || marked.contains(text))) return text;
    var cell = node.closest && node.closest('td, th');
    if (marked) {
      var kind = marked.getAttribute('data-ez');
      // A column inside a block is its own element.
      if (cell && cell !== marked && marked.contains(cell) && kind !== 'divider' && kind !== 'spacer') return cell;
      return marked;
    }
    if (node.tagName === 'A' || node.tagName === 'DIV' || node.tagName === 'UL' || node.tagName === 'OL' || node.tagName === 'TABLE' || node.tagName === 'CENTER') {
      if (!cell || cell.contains(node)) return node;
    }
    return cell || node;
  }

  function sectionName(table) {
    var cells = firstRowCells(table);
    if (cells.length === 1) return '1 Section';
    if (cells.length === 3) return '1/3 Section';
    if (cells.length === 2) return pctOf(cells[0]) > 0 && pctOf(cells[0]) < 40 ? '3/7 Section' : '1/2 Section';
    return 'Section';
  }

  function hostsNestedSplit(cell) {
    var inner = cell.querySelector && cell.querySelector('table[data-nl="section"]');
    if (!inner || firstRowCells(inner).length < 2) return false;
    var owner = cell.parentElement;
    while (owner && owner.tagName !== 'TABLE') owner = owner.parentElement;
    return !!(owner && owner.getAttribute('data-nl') === 'section');
  }

  function crumbLabel(el) {
    if (!el) return 'Email';
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section') return sectionName(el);
    if (isButtonTable(el)) return 'Button';
    if (el.getAttribute('data-nl') === 'icon-text') return 'Icon + text';
    if (el.getAttribute('data-nl') === 'icon') return 'Icon';
    if (el.getAttribute('data-nl') === 'hspacer') return 'Horizontal spacer';
    if (el.getAttribute('data-nl') === 'social-element') return 'Social icon';
    if (el.getAttribute('data-nl') === 'social-icons') return 'Group Social';
    if (el.getAttribute('data-ez') === 'divider') return 'Divider';
    if (el.getAttribute('data-ez') === 'spacer') return 'Spacer';
    if (el.tagName === 'IMG') return el.getAttribute('data-nl') === 'inline-image' ? 'Inline image' : 'Image';
    if (el.tagName === 'BLOCKQUOTE') return 'Quote';
    if (el.getAttribute('data-ez') === 'link-block') return 'Link block';
    if (/^H[1-6]$/.test(el.tagName)) return 'Heading';
    if (el.tagName === 'P' || el.getAttribute('data-ez') === 'text') return 'Text';
    if (el.tagName === 'A') return 'Link';
    if (el.tagName === 'TD' || el.tagName === 'TH') return hostsNestedSplit(el) ? 'Section background' : 'Column';
    if (socialTableOf(el) && el.contains && el.contains(socialTableOf(el))) return 'Group Social';
    if (el.tagName === 'TABLE') return 'Block';
    return '';
  }

  function select(el, extra) {
    if (editing && el !== editing && !(el && editing.contains(el))) endEdit();
    picked.forEach(function (node) {
      if (!node) return;
      node.classList.remove('ez-selected');
      node.removeAttribute('draggable');
    });
    if (doc && doc.body) doc.body.classList.remove('ez-selected');
    picked = (extra || (el ? [el] : [])).filter(function (node) { return node && node !== doc.body && node !== doc.documentElement; });
    selectedEl = el && picked.indexOf(el) !== -1 ? el : (picked[picked.length - 1] || null);
    picked.forEach(function (node) {
      node.classList.add('ez-selected');
      if (node.getAttribute('data-nl') !== 'inline-image') node.setAttribute('draggable', 'true');
    });
    if (!selectedEl && doc && doc.body) doc.body.classList.add('ez-selected');
    if (selectedEl && viewTab !== 'layers') viewTab = 'edit';
    revealLayers(selectedEl);
    paintCrumbs();
    paintSettings();
    placeChrome();
  }

  function cloneSelected() {
    if (!selectedEl || !selectedEl.parentElement) return;
    snapshot();
    var copy = selectedEl.cloneNode(true);
    copy.classList.remove('ez-selected', 'ez-hover', 'ez-drop');
    copy.removeAttribute('draggable');
    copy.removeAttribute('data-ez-moving');
    if (selectedEl.nextSibling) selectedEl.parentElement.insertBefore(copy, selectedEl.nextSibling);
    else selectedEl.parentElement.appendChild(copy);
    if (copy.getAttribute('data-nl') === 'social-element') spaceSocial(socialTableOf(copy));
    select(copy);
    changed();
  }

  function selectParent() {
    if (!selectedEl) return;
    var parent = selectedEl.parentElement;
    while (parent && /^(TBODY|THEAD|TFOOT)$/.test(parent.tagName)) parent = parent.parentElement;
    if (!parent || parent === doc.body || parent === doc.documentElement) select(null);
    else select(parent);
  }

  function togglePick(el) {
    if (!el) return;
    var next = picked.slice();
    var index = next.indexOf(el);
    if (index === -1) next.push(el);
    else next.splice(index, 1);
    select(next[next.length - 1] || null, next);
  }

  function paintCrumbs() {
    var bar = document.getElementById('ez-crumbs');
    if (!bar) return;
    bar.innerHTML = '';
    function add(label, target) {
      if (bar.childNodes.length) {
        var sep = document.createElement('span');
        sep.className = 'ez-crumb-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '›';
        bar.appendChild(sep);
      }
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ez-crumb' + (target === selectedEl ? ' is-on' : '');
      button.textContent = label;
      button.addEventListener('click', function () { select(target); });
      button.addEventListener('mouseenter', function () { if (target) target.classList.add('ez-hover'); });
      button.addEventListener('mouseleave', function () { if (target && picked.indexOf(target) === -1) target.classList.remove('ez-hover'); });
      bar.appendChild(button);
    }
    add('Email', null);
    var chain = [];
    var node = selectedEl;
    while (node && node !== doc.body) {
      chain.unshift(node);
      node = node.parentElement;
    }
    chain.forEach(function (el) {
      var label = crumbLabel(el);
      if (label) add(label, el);
    });
  }

  function arm(input) {
    input.addEventListener('focus', function () {
      if (!armed) { snapshot(); armed = true; }
    });
    input.addEventListener('change', function () { armed = false; });
  }

  function watch(input, apply) {
    arm(input);
    input.addEventListener('input', function () { apply(input.value); changed(); });
    input.addEventListener('change', function () { apply(input.value); changed(); });
  }

  function fieldShell(label) {
    var wrap = document.createElement('div');
    wrap.className = 'ez-field';
    var span = document.createElement('span');
    span.className = 'ez-field-title';
    span.textContent = label;
    wrap.appendChild(span);
    return wrap;
  }

  function controlBox(extra) {
    var box = document.createElement('div');
    box.className = 'ez-control' + (extra ? ' ' + extra : '');
    return box;
  }

  function textField(label, value, name, apply, opts) {
    opts = opts || {};
    var wrap = fieldShell(label);
    if (opts.wide) wrap.classList.add('ez-wide');
    var box = controlBox(opts.asset ? 'ez-file' : '');
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ez-input';
    input.value = value || '';
    input.placeholder = opts.placeholder || '';
    input.setAttribute('data-ez-field', name);
    if (opts.commit) {
      // Applied on Enter or when the field loses focus, not on every key.
      arm(input);
      input.addEventListener('change', function () { apply(input.value); changed(); });
    } else watch(input, apply);
    box.appendChild(input);
    if (opts.asset) box.appendChild(assetButton(input, !!opts.httpOnly));
    wrap.appendChild(box);
    return wrap;
  }

  function numberField(label, value, name, apply, min, max, unit) {
    var wrap = fieldShell(label);
    var box = controlBox(unit ? 'ez-unit ez-unit-lock' : '');
    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'ez-input';
    input.value = value == null ? '' : String(value);
    if (min != null) input.min = String(min);
    if (max != null) input.max = String(max);
    input.setAttribute('data-ez-field', name);
    watch(input, apply);
    box.appendChild(input);
    if (unit) {
      var fixed = document.createElement('span');
      fixed.className = 'ez-unit-fixed';
      fixed.textContent = unit;
      box.appendChild(fixed);
    }
    wrap.appendChild(box);
    return wrap;
  }

  function selectField(label, value, name, options, apply) {
    var wrap = fieldShell(label);
    var box = controlBox('ez-select');
    var input = document.createElement('select');
    input.className = 'ez-input';
    input.setAttribute('data-ez-field', name);
    options.forEach(function (option) {
      var node = document.createElement('option');
      node.value = option[0];
      node.textContent = option[1];
      input.appendChild(node);
    });
    input.value = value || options[0][0];
    watch(input, apply);
    box.appendChild(input);
    wrap.appendChild(box);
    return wrap;
  }

  function colorField(label, value, name, apply) {
    var wrap = fieldShell(label);
    wrap.classList.add('ez-wide');
    var box = controlBox('ez-color-field');
    var text = document.createElement('input');
    text.type = 'text';
    text.className = 'ez-input';
    text.value = value || '';
    // A fill can be left empty, which is transparent; typing "transparent" clears it too.
    var fill = /^(background|social-bg|gap-bg|page-color)$/.test(name);
    text.placeholder = fill ? 'transparent' : '#000000';
    text.spellcheck = false;
    text.autocomplete = 'off';
    text.setAttribute('data-ez-field', name);
    var color = document.createElement('input');
    color.type = 'color';
    color.value = normalizeColor(value) || '#ffffff';
    color.title = label;
    // Hex codes can be typed without "#": ffffff, fff, e11d48, 11223380. A
    // complete 6 or 8 digit code gets its "#" as you type (the caret stays put);
    // 3 and 4 digit codes get it on Enter, Tab or leaving the field, because
    // "fff" may still be on its way to "ffffff". Names, rgb() and hsl() work too.
    function push(raw) {
      var value = colorValue(raw);
      if (value === null) return false;
      var hex = normalizeColor(value);
      if (hex) color.value = hex;
      apply(value);
      changed();
      return true;
    }
    arm(text);
    text.addEventListener('input', function (event) {
      var raw = text.value;
      var bare = raw.trim().match(/^#?([0-9a-f]+)$/i);
      if (bare && raw.trim().charAt(0) !== '#') {
        var digits = bare[1];
        var pasted = event && event.inputType === 'insertFromPaste';
        if (digits.length === 6 || digits.length === 8 || (pasted && (digits.length === 3 || digits.length === 4))) {
          var caret = text.selectionStart;
          var lead = raw.length - raw.replace(/^\s+/, '').length;
          text.value = '#' + digits.toLowerCase();
          if (caret != null && document.activeElement === text) {
            var at = Math.max(1, Math.min(text.value.length, caret - lead + 1));
            try { text.setSelectionRange(at, at); } catch (err) {}
          }
          push(text.value);
        }
        return;
      }
      // "#ff" or "#fffff" are still being typed; only apply complete codes.
      if (/^#[0-9a-f]*$/i.test(raw.trim()) && !/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw.trim())) return;
      push(raw);
    });
    text.addEventListener('change', function () {
      var raw = text.value.trim();
      if (/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) raw = '#' + raw.toLowerCase();
      if (raw !== text.value) text.value = raw;
      push(raw);
    });
    text.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        var raw = text.value.trim();
        if (/^([0-9a-f]{3}|[0-9a-f]{4})$/i.test(raw)) {
          text.value = '#' + raw.toLowerCase();
          push(text.value);
        }
      }
    });
    watch(color, function (raw) {
      text.value = raw;
      apply(raw);
    });
    box.appendChild(text);
    box.appendChild(color);
    wrap.appendChild(box);
    // Colors already used in this email, one click away.
    var used = documentColors();
    if (used.length || fill) {
      var row = document.createElement('div');
      row.className = 'ez-swatches';
      if (fill) {
        var none = document.createElement('button');
        none.type = 'button';
        none.className = 'ez-swatch ez-swatch-none';
        none.title = 'Transparent';
        none.setAttribute('aria-label', 'No fill (transparent)');
        none.addEventListener('mousedown', function () { if (!armed) { snapshot(); armed = true; } });
        none.addEventListener('click', function () {
          armed = false;
          text.value = 'transparent';
          apply('');
          changed();
        });
        row.appendChild(none);
      }
      used.forEach(function (hex) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ez-swatch';
        chip.title = hex;
        chip.setAttribute('aria-label', 'Use ' + hex);
        chip.style.background = hex;
        chip.addEventListener('mousedown', function () { if (!armed) { snapshot(); armed = true; } });
        chip.addEventListener('click', function () {
          armed = false;
          text.value = hex;
          color.value = hex;
          apply(hex);
          changed();
        });
        row.appendChild(chip);
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  var colorCache = null;
  function documentColors() {
    if (colorCache) return colorCache;
    var count = {};
    if (doc && doc.body) {
      var html = doc.body.innerHTML;
      var re = /(?:color|bgcolor)\s*[:=]\s*"?\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi;
      var m;
      var guard = 0;
      while ((m = re.exec(html)) && guard++ < 4000) {
        var hex = normalizeColor(m[1]);
        if (hex) count[hex] = (count[hex] || 0) + 1;
      }
    }
    colorCache = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 12);
    return colorCache;
  }

  function hrefField(label, value, name, write) {
    return textField(label, value, name, function (raw) {
      var next = cleanHref(raw);
      var input = document.querySelector('[data-ez-field="' + name + '"]');
      if (next == null) {
        if (input) input.value = value || '';
        status('That address was not saved.');
        return;
      }
      write(next);
      value = next;
      if (input && input.value !== next) input.value = next;
    }, { placeholder: 'https://' });
  }

  var SIZE_UNITS = ['px', '%', 'em', 'rem', 'vh', 'vw'];

  function splitSize(value, units, unitlessOk) {
    var raw = String(value == null ? '' : value).trim();
    var list = units && units.length ? units : ['px'];
    if (!raw) return { num: '', unit: unitlessOk ? '' : list[0], keyword: false, empty: true };
    var match = raw.match(/^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i);
    if (!match) return { num: raw, unit: '', keyword: true, empty: false };
    var unit = (match[2] || '').toLowerCase();
    if (unit) {
      if (list.indexOf(unit) === -1) return { num: raw, unit: '', keyword: true, empty: false };
      return { num: match[1], unit: unit, keyword: false, empty: false };
    }
    if (unitlessOk) return { num: match[1], unit: '', keyword: false, empty: false };
    return { num: match[1], unit: list[0], keyword: false, empty: false };
  }

  function unitControl(value, name, apply, units, unitlessOk, hooks) {
    hooks = hooks || {};
    units = units && units.length ? units : SIZE_UNITS;
    var parsed = splitSize(value, units, unitlessOk);
    var box = controlBox('ez-unit');
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ez-input';
    input.placeholder = 'auto';
    input.value = parsed.keyword ? String(value || '').trim() : parsed.num;
    if (name) input.setAttribute('data-ez-field', name);
    var select = document.createElement('select');
    select.className = 'ez-input';
    select.title = 'Unit';
    if (hooks.unitName) select.setAttribute('data-ez-field', hooks.unitName);
    units.forEach(function (unit) {
      var option = document.createElement('option');
      option.value = unit;
      option.textContent = unit;
      select.appendChild(option);
    });
    var dash = document.createElement('option');
    dash.value = '';
    dash.textContent = '-';
    select.appendChild(dash);
    select.value = parsed.keyword || parsed.empty ? (unitlessOk ? '' : (parsed.unit || units[0])) : parsed.unit;
    if (select.value == null) select.value = '';

    function joined() {
      var raw = input.value.trim();
      if (!raw) return '';
      var typed = splitSize(raw, units, unitlessOk);
      if (typed.keyword) return raw;
      var unit = select.value || (unitlessOk ? '' : (typed.unit || units[0]));
      return typed.num + unit;
    }

    function syncTyped() {
      var raw = input.value.trim();
      if (!raw) return;
      var typed = splitSize(raw, units, unitlessOk);
      if (typed.keyword) {
        select.value = '';
        return;
      }
      if (/[a-z%]/i.test(raw)) {
        select.value = typed.unit;
        input.value = typed.num;
        return;
      }
      if (!select.value && !unitlessOk) select.value = units[0];
    }

    watch(input, function () {
      syncTyped();
      apply(joined(), false);
    });
    select.addEventListener('mousedown', function () {
      if (!armed) { snapshot(); armed = true; }
    });
    function onUnit() {
      armed = false;
      apply(joined(), true);
      changed();
    }
    select.addEventListener('input', onUnit);
    select.addEventListener('change', onUnit);
    box.appendChild(input);
    box.appendChild(select);
    return box;
  }

  function unitField(label, value, name, apply, units, unitlessOk, hooks) {
    var wrap = fieldShell(label);
    wrap.appendChild(unitControl(value, name, apply, units, unitlessOk, hooks));
    return wrap;
  }

  function assetName(src) {
    var value = String(src || '');
    if (/^data:image\//i.test(value)) return 'Embedded image';
    try { value = decodeURIComponent(value.split('?')[0].split('#')[0]); } catch (err) {}
    var parts = value.split('/');
    return (parts[parts.length - 1] || value).slice(0, 60);
  }

  function readAssets() {
    try {
      var list = JSON.parse(localStorage.getItem(ASSET_KEY) || '[]');
      if (!Array.isArray(list)) return assetMemory.slice();
      return list.filter(function (item) { return item && typeof item.src === 'string' && item.src; });
    } catch (err) {
      return assetMemory.slice();
    }
  }

  function writeAssets(list) {
    assetMemory = list.slice(0, 60);
    try { localStorage.setItem(ASSET_KEY, JSON.stringify(assetMemory)); } catch (err) {}
  }

  function writeHidden() {
    try { localStorage.setItem(HIDDEN_ASSET_KEY, JSON.stringify(Object.keys(hiddenAssets).slice(-300))); } catch (err) {}
  }

  function rememberAsset(src, name) {
    var next = cleanImageSrc(src);
    if (next == null || !next) return;
    if (hiddenAssets[next]) { delete hiddenAssets[next]; writeHidden(); }
    var list = readAssets().filter(function (item) { return item.src !== next; });
    list.unshift({ src: next, name: name || assetName(next) });
    writeAssets(list);
  }

  function forgetAsset(src) {
    hiddenAssets[src] = true;
    writeHidden();
    writeAssets(readAssets().filter(function (asset) { return asset.src !== src; }));
  }

  function canvasSrcs() {
    var out = [];
    if (!doc) return out;
    doc.querySelectorAll('img[src], [background]').forEach(function (el) {
      var src = realSrc(el) || el.getAttribute('background') || '';
      var next = cleanImageSrc(src);
      if (next) out.push(next);
    });
    return out;
  }

  function assetList() {
    var seen = {};
    var out = [];
    var used = {};
    canvasSrcs().forEach(function (src) { used[src] = true; });
    readAssets().concat(Object.keys(used).map(function (src) { return { src: src, name: assetName(src) }; })).forEach(function (item) {
      if (!item || !item.src || seen[item.src] || hiddenAssets[item.src]) return;
      seen[item.src] = true;
      out.push({ src: item.src, name: item.name || assetName(item.src), used: !!used[item.src] });
    });
    return out;
  }

  var TRASH_ICON = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';
  var EYE_ICON = 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';

  function openAssets(opts) {
    opts = opts || {};
    var root = document.createElement('div');
    root.className = 'ez-am';
    var form = document.createElement('form');
    form.className = 'ez-am-add';
    var box = controlBox('ez-am-url');
    var input = document.createElement('input');
    input.type = 'url';
    input.className = 'ez-input';
    input.placeholder = 'Paste an image address, e.g. https://example.com/image.png';
    input.setAttribute('aria-label', 'Image address');
    input.spellcheck = false;
    input.autocomplete = 'off';
    box.appendChild(input);
    var add = document.createElement('button');
    add.type = 'submit';
    add.className = 'nl-btn';
    add.textContent = 'Add image';
    form.appendChild(box);
    form.appendChild(add);
    root.appendChild(form);
    var bar = document.createElement('div');
    bar.className = 'ez-am-bar';
    var count = document.createElement('span');
    count.className = 'ez-am-count';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'ez-am-search';
    search.placeholder = 'Filter images';
    search.setAttribute('aria-label', 'Filter images');
    bar.appendChild(count);
    bar.appendChild(search);
    root.appendChild(bar);
    var grid = document.createElement('div');
    grid.className = 'ez-am-grid';
    grid.setAttribute('role', 'list');
    root.appendChild(grid);
    var hint = document.createElement('p');
    hint.className = 'ez-note ez-am-empty';
    root.appendChild(hint);
    // Large preview inside the dialog: the picture at full fit, its size,
    // address, and the two actions.
    var view = document.createElement('div');
    view.className = 'ez-am-view';
    view.hidden = true;
    root.appendChild(view);
    if (!opts.httpOnly) {
      var drop = document.createElement('div');
      drop.className = 'ez-am-drop';
      drop.appendChild(document.createTextNode('Drop a PNG, JPEG, GIF, or WebP here, or click to upload. A web address is safer in the inbox.'));
      var file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/png,image/jpeg,image/gif,image/webp';
      file.multiple = true;
      drop.appendChild(file);
      root.appendChild(drop);
      var takeFiles = function (files) {
        Array.prototype.forEach.call(files || [], function (item) {
          if (!item || !/^image\/(png|jpeg|gif|webp)$/i.test(item.type)) {
            status('Use a PNG, JPEG, GIF, or WebP file.', 'error');
            return;
          }
          if (item.size > 1200000) {
            status('That file is too large to keep in the browser.', 'error');
            return;
          }
          var reader = new FileReader();
          reader.onload = function () {
            rememberAsset(String(reader.result || ''), item.name);
            paint();
          };
          reader.readAsDataURL(item);
        });
      };
      file.addEventListener('change', function () { takeFiles(file.files); file.value = ''; });
      drop.addEventListener('dragover', function (event) {
        event.preventDefault();
        drop.classList.add('is-over');
      });
      drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
      drop.addEventListener('drop', function (event) {
        event.preventDefault();
        drop.classList.remove('is-over');
        takeFiles(event.dataTransfer && event.dataTransfer.files);
      });
    }
    function choose(src) {
      if (opts.onSelect) opts.onSelect(src);
      editor.Modal.close();
    }
    function remove(item) {
      forgetAsset(item.src);
      view.hidden = true;
      paint();
      status(item.used ? 'Removed from the library. The email still uses it.' : 'Removed from the library.', 'ok');
    }
    function showView(item, dims) {
      view.innerHTML = '';
      var stage = document.createElement('div');
      stage.className = 'ez-am-stage';
      var big = document.createElement('img');
      big.alt = item.name;
      big.src = item.src;
      stage.appendChild(big);
      var meta = document.createElement('div');
      meta.className = 'ez-am-meta';
      var title = document.createElement('strong');
      title.textContent = item.name;
      var size = document.createElement('span');
      size.className = 'ez-am-dim';
      size.textContent = dims || '';
      big.addEventListener('load', function () { size.textContent = big.naturalWidth + ' × ' + big.naturalHeight + ' px'; });
      big.addEventListener('error', function () { stage.classList.add('is-broken'); size.textContent = 'Could not load this image.'; });
      var url = document.createElement('input');
      url.className = 'ez-am-src';
      url.readOnly = true;
      url.value = /^data:/i.test(item.src) ? 'Uploaded file (stored in this browser)' : item.src;
      url.setAttribute('aria-label', 'Image address');
      var actions = document.createElement('div');
      actions.className = 'ez-am-actions';
      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'nl-btn secondary ez-am-back';
      back.textContent = 'Back';
      back.addEventListener('click', function () { view.hidden = true; });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'nl-btn secondary ez-am-view-del';
      del.textContent = 'Delete';
      del.addEventListener('click', function () { remove(item); });
      var use = document.createElement('button');
      use.type = 'button';
      use.className = 'nl-btn ez-am-use';
      use.textContent = 'Use this image';
      use.addEventListener('click', function () { choose(item.src); });
      actions.appendChild(back);
      actions.appendChild(del);
      actions.appendChild(use);
      meta.appendChild(title);
      meta.appendChild(size);
      meta.appendChild(url);
      meta.appendChild(actions);
      view.appendChild(stage);
      view.appendChild(meta);
      view.hidden = false;
      use.focus();
    }
    function paint() {
      grid.innerHTML = '';
      var all = assetList();
      var q = search.value.trim().toLowerCase();
      var list = q ? all.filter(function (item) { return (item.name + ' ' + item.src).toLowerCase().indexOf(q) !== -1; }) : all;
      count.textContent = all.length === 1 ? '1 image' : all.length + ' images';
      bar.hidden = !all.length;
      search.hidden = all.length < 7 && !q;
      hint.textContent = all.length ? (list.length ? '' : 'No image matches “' + search.value.trim() + '”.') : (opts.httpOnly ? 'No images yet. Add a web address.' : 'No images yet. Add an address or drop a file.');
      hint.hidden = !!list.length;
      list.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'ez-am-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('data-src', item.src);
        var pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'ez-am-pick';
        pick.title = 'Use ' + item.name;
        var thumb = document.createElement('span');
        thumb.className = 'ez-am-thumb';
        var img = document.createElement('img');
        img.className = 'ez-am-img';
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        var name = document.createElement('span');
        name.className = 'ez-am-name';
        name.textContent = item.name;
        var dim = document.createElement('span');
        dim.className = 'ez-am-dim';
        dim.textContent = 'Loading…';
        img.addEventListener('load', function () {
          thumb.classList.add('is-loaded');
          dim.textContent = img.naturalWidth + ' × ' + img.naturalHeight;
        });
        img.addEventListener('error', function () {
          thumb.classList.add('is-broken');
          dim.textContent = 'Could not load';
        });
        img.src = item.src;
        thumb.appendChild(img);
        if (item.used) {
          var badge = document.createElement('span');
          badge.className = 'ez-am-used';
          badge.textContent = 'In email';
          thumb.appendChild(badge);
        }
        pick.appendChild(thumb);
        pick.appendChild(name);
        pick.appendChild(dim);
        pick.addEventListener('click', function () { choose(item.src); });
        var tools = document.createElement('span');
        tools.className = 'ez-am-tools';
        var zoom = document.createElement('button');
        zoom.type = 'button';
        zoom.className = 'ez-am-zoom';
        zoom.title = 'Preview';
        zoom.setAttribute('aria-label', 'Preview ' + item.name);
        zoom.innerHTML = iconSvg(EYE_ICON);
        zoom.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          showView(item, dim.textContent);
        });
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'ez-am-del';
        del.title = 'Delete from the library';
        del.setAttribute('aria-label', 'Delete ' + item.name + ' from the library');
        del.innerHTML = iconSvg(TRASH_ICON);
        del.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          remove(item);
        });
        tools.appendChild(zoom);
        tools.appendChild(del);
        card.appendChild(pick);
        card.appendChild(tools);
        grid.appendChild(card);
      });
    }
    search.addEventListener('input', paint);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var next = opts.httpOnly ? cleanSocialSrc(input.value) : cleanImageSrc(input.value);
      if (next == null || !next) {
        status('That address was not saved.', 'error');
        return;
      }
      rememberAsset(next);
      input.value = '';
      search.value = '';
      paint();
    });
    root.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !view.hidden) {
        event.preventDefault();
        event.stopPropagation();
        view.hidden = true;
      }
    });
    paint();
    editor.Modal.open({ title: 'Select Image', content: root });
    setTimeout(function () { try { input.focus(); } catch (err) {} }, 30);
  }

  function realSrc(img) {
    if (!img) return '';
    if (img.hasAttribute && img.hasAttribute('data-ez-src')) return img.getAttribute('data-ez-src') || '';
    return img.getAttribute('src') || '';
  }

  function pickImageFor(img) {
    if (!img) return;
    var icon = img.getAttribute('data-nl') === 'icon';
    openAssets({
      httpOnly: icon,
      onSelect: function (src) {
        var next = icon ? cleanSocialSrc(src) : cleanImageSrc(src);
        if (!next) {
          status('That address was not saved.');
          return;
        }
        snapshot();
        img.setAttribute('src', next);
        if (img.getAttribute('data-nl') === 'inline-image') fitInline(img);
        select(img);
        changed();
      }
    });
  }

  function assetButton(input, httpOnly) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ez-asset-btn';
    button.title = 'Select image';
    button.innerHTML = iconSvg('M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z');
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openAssets({
        httpOnly: httpOnly,
        onSelect: function (src) {
          input.value = src;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
    return button;
  }

  function note(text) {
    var p = document.createElement('p');
    p.className = 'ez-note';
    p.style.cssText = 'margin:0 0 10px;color:var(--nl-on-surface-variant);font-size:12px;line-height:1.4;';
    p.textContent = text;
    return p;
  }

  function iconSvg(path, box) {
    return '<svg viewBox="' + (box || '0 0 24 24') + '" aria-hidden="true"><path fill="currentColor" d="' + path + '"/></svg>';
  }

  function radioField(label, value, name, options, apply) {
    var wrap = fieldShell(label);
    wrap.classList.add('ez-wide');
    var row = document.createElement('div');
    row.className = 'ez-radios';
    row.setAttribute('data-ez-field', name);
    options.forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.title = option[1];
      button.innerHTML = option[2] || option[1];
      if (option[0] === value) button.classList.add('is-on');
      button.addEventListener('mousedown', function () {
        if (!armed) { snapshot(); armed = true; }
      });
      button.addEventListener('click', function () {
        armed = false;
        Array.prototype.forEach.call(row.children, function (kid) { kid.classList.remove('is-on'); });
        button.classList.add('is-on');
        apply(option[0]);
        changed();
      });
      row.appendChild(button);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function removeButton() {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ez-danger';
    button.textContent = 'Remove';
    button.addEventListener('click', removeSelected);
    return button;
  }

  function paintButton(body, table) {
    var cell = allCells(table)[0];
    var link = buttonAnchor(cell);
    body.appendChild(textField('Label', link ? link.textContent : '', 'label', function (value) {
      if (link) link.textContent = value;
    }));
    body.appendChild(hrefField('Link', link ? (link.getAttribute('href') || '') : '', 'href', function (value) {
      if (!link) return;
      if (value) link.setAttribute('href', value);
      else link.removeAttribute('href');
    }));
    if (link) {
      body.appendChild(selectField('Target', link.getAttribute('target') || '', 'target', [['', 'This window'], ['_blank', 'New window']], function (value) {
        if (value) link.setAttribute('target', value);
        else link.removeAttribute('target');
      }));
    }
  }

  function setImageLink(img, href) {
    var parent = img.parentElement;
    var wrapped = parent && parent.tagName === 'A' ? parent : null;
    if (!href) {
      if (wrapped && wrapped.childNodes.length === 1) wrapped.replaceWith(img);
      return;
    }
    if (!wrapped) {
      wrapped = doc.createElement('a');
      wrapped.setAttribute('style', 'text-decoration:none;');
      img.replaceWith(wrapped);
      wrapped.appendChild(img);
    }
    wrapped.setAttribute('href', href);
    if (!wrapped.getAttribute('target')) wrapped.setAttribute('target', '_blank');
    if (!wrapped.getAttribute('data-nl')) wrapped.setAttribute('data-nl', 'image-link');
  }

  function imageLink(img) {
    var parent = img.parentElement;
    return parent && parent.tagName === 'A' ? (parent.getAttribute('href') || '') : '';
  }

  function paintImage(body, img) {
    var icon = img.getAttribute('data-nl') === 'icon';
    var inline = img.getAttribute('data-nl') === 'inline-image';
    var cleaner = icon ? cleanSocialSrc : cleanImageSrc;
    body.appendChild(textField('Image address', realSrc(img) || '', 'src', function (value) {
      var next = cleaner(value);
      var input = document.querySelector('[data-ez-field="src"]');
      if (next == null) {
        if (input) input.value = realSrc(img) || '';
        status('That address was not saved.');
        return;
      }
      if (next) img.setAttribute('src', next);
      else img.removeAttribute('src');
      if (input && next != null) input.value = next;
      if (next && !icon && input && document.activeElement !== input) rememberAsset(next);
    }, icon
      ? { asset: true, httpOnly: true, wide: true }
      : { asset: true, wide: true, placeholder: 'https://' }));
    body.appendChild(textField('Alt', img.getAttribute('alt') || '', 'alt', function (value) {
      img.setAttribute('alt', value);
    }));
    var max = icon ? 200 : 600;
    var min = icon ? 8 : 1;
    body.appendChild(numberField('Width', parseInt(img.getAttribute('width'), 10) || '', 'width', function (value) {
      var n = parseInt(value, 10);
      if (!(n >= min && n <= max)) return;
      if (inline) {
        // Width and height keep the picture's proportions, as in the original.
        var oldW = parseInt(img.getAttribute('width'), 10) || n;
        var oldH = parseInt(img.getAttribute('height'), 10) || oldW;
        var nextH = Math.max(1, Math.min(600, Math.round(n * oldH / oldW)));
        img.setAttribute('height', String(nextH));
        setDecl(img, 'height', nextH + 'px');
        var hInput = document.querySelector('[data-ez-field="img-height"]');
        if (hInput && document.activeElement !== hInput) hInput.value = String(nextH);
      }
      img.setAttribute('width', String(n));
      setDecl(img, 'width', n + 'px');
      if (icon) {
        img.setAttribute('height', String(n));
        setDecl(img, 'height', n + 'px');
        setDecl(img, 'min-width', n + 'px');
      } else if (!inline) {
        img.removeAttribute('height');
        setDecl(img, 'height', 'auto');
      }
      var cell = icon ? img.closest('[data-nl="icon-cell"]') : null;
      if (cell) {
        cell.setAttribute('width', String(n));
        setDecl(cell, 'width', n + 'px');
      }
    }, min, max, 'px'));
    if (inline) {
      body.appendChild(numberField('Height', parseInt(img.getAttribute('height'), 10) || 32, 'img-height', function (value) {
        var n = parseInt(value, 10);
        if (!(n >= 1 && n <= 600)) return;
        var oldH2 = parseInt(img.getAttribute('height'), 10) || n;
        var oldW2 = parseInt(img.getAttribute('width'), 10) || oldH2;
        var nextW = Math.max(1, Math.min(600, Math.round(n * oldW2 / oldH2)));
        img.setAttribute('width', String(nextW));
        setDecl(img, 'width', nextW + 'px');
        var wInput = document.querySelector('[data-ez-field="width"]');
        if (wInput && document.activeElement !== wInput) wInput.value = String(nextW);
        img.setAttribute('height', String(n));
        setDecl(img, 'height', n + 'px');
      }, 1, 600, 'px'));
      var align = (decl(img, 'vertical-align') || 'middle').toLowerCase();
      if (align === 'center') align = 'middle';
      if (['top', 'middle', 'bottom', 'baseline'].indexOf(align) === -1) align = 'middle';
      body.appendChild(selectField('Vertical align', align, 'img-valign', [['middle', 'Middle'], ['top', 'Top'], ['bottom', 'Bottom'], ['baseline', 'Baseline']], function (value) {
        setDecl(img, 'vertical-align', value);
      }));
      body.appendChild(hrefField('Link', imageLink(img), 'href', function (value) { setImageLink(img, value); }));
    }
    if (icon) {
      var cell = img.closest('[data-nl="icon-cell"]');
      var row = cell && cell.parentElement;
      body.appendChild(selectField('Vertical align', (cell && cell.getAttribute('valign')) || 'middle', 'valign', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], function (value) {
        if (cell) setValign(cell, value);
        var copy = row && row.querySelector('[data-nl="icon-copy"]');
        if (copy) setValign(copy, value);
      }));
      var side = row && row.firstElementChild === cell ? 'left' : 'right';
      body.appendChild(selectField('Icon position', side, 'side', [['left', 'Left'], ['right', 'Right']], function (value) {
        if (!row || !cell) return;
        var copy = row.querySelector('[data-nl="icon-copy"]');
        if (!copy) return;
        if (value === 'right') row.appendChild(cell);
        else row.insertBefore(cell, copy);
      }));
    }
    if (!inline) {
      body.appendChild(hrefField('Link', imageLink(img), 'href', function (value) { setImageLink(img, value); }));
    }
  }

  function sectionOwner(el) {
    if (!el) return null;
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section') return el;
    if (el.tagName !== 'TD' && el.tagName !== 'TH') return null;
    var table = el.parentElement;
    while (table && table.tagName !== 'TABLE') table = table.parentElement;
    if (!table || table.getAttribute('data-nl') !== 'section') return null;
    if (firstRowCells(table).indexOf(el) === -1) return null;
    return table;
  }

  function sectionMinField(table) {
    return unitField('Min width', decl(table, 'min-width') || '', 'section-min', function (value) {
      var clean = cleanSectionMinWidth(value);
      if (clean == null) {
        var input = document.querySelector('[data-ez-field="section-min"]');
        var current = decl(table, 'min-width') || '';
        if (input) input.value = splitSize(current, ['px', '%'], false).num;
        status('Min width is a pixel size up to 1200, or a percent up to 100.');
        return;
      }
      setDecl(table, 'min-width', clean);
    }, ['px', '%'], false);
  }

  function paintSection(body, table) {
    var hug = table.getAttribute('data-nl-hug') === '1' ? 'hug' : (String(decl(table, 'width') || '').indexOf('px') !== -1 ? 'fixed' : 'fill');
    body.appendChild(selectField('Width', hug, 'section-width', [['fill', 'Fill the column'], ['hug', 'Hug the text'], ['fixed', 'Fixed pixels']], function (value) {
      if (value === 'hug') {
        table.setAttribute('data-nl-hug', '1');
        table.removeAttribute('width');
        setDecl(table, 'width', 'auto');
      } else if (value === 'fixed') {
        table.removeAttribute('data-nl-hug');
        var px = parseInt(decl(table, 'width'), 10) || 280;
        table.setAttribute('width', String(px));
        setDecl(table, 'width', px + 'px');
      } else {
        table.removeAttribute('data-nl-hug');
        table.setAttribute('width', '100%');
        setDecl(table, 'width', '100%');
        setDecl(table, 'max-width', '100%');
      }
      paintSettings();
    }));
    body.appendChild(sectionMinField(table));
    body.appendChild(valignField(table));
    if (hug === 'fixed') {
      body.appendChild(numberField('Pixels', parseInt(decl(table, 'width'), 10) || 280, 'width', function (value) {
        var n = parseInt(value, 10);
        if (!(n > 0)) return;
        table.setAttribute('width', String(n));
        setDecl(table, 'width', n + 'px');
      }, 40, 600, 'px'));
    }
  }

  function readValign(el) {
    var target = el;
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section') target = firstRowCells(el).filter(function (cell) { return cell.getAttribute('data-nl') !== 'hspacer'; })[0] || el;
    var value = String(decl(target, 'vertical-align') || target.getAttribute('valign') || 'top').toLowerCase();
    if (value === 'center') value = 'middle';
    return ['top', 'middle', 'bottom'].indexOf(value) === -1 ? 'top' : value;
  }

  // Sections set every column; a column sets itself. Old Outlook reads valign.
  function valignField(el) {
    return selectField('Vertical align', readValign(el), 'valign', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], function (value) {
      setValign(el, value);
    });
  }

  function attrField(label, el, name) {
    return textField(label, el.getAttribute(name) || '', 'attr-' + name, function (value) {
      var clean = String(value || '').trim();
      if (name === 'id') clean = clean.replace(/\s+/g, '-');
      if (clean) el.setAttribute(name, clean);
      else el.removeAttribute(name);
    });
  }

  function paintCell(body, cell) {
    var width = decl(cell, 'width') || cell.getAttribute('width') || '';
    if (width) body.appendChild(unitField('Column width', width, 'width', function (value) {
      setDecl(cell, 'width', value);
      if (cell.hasAttribute('width')) cell.setAttribute('width', value);
    }, ['px', '%', 'em', 'rem'], false));
    var section = sectionOwner(cell);
    if (section) body.appendChild(sectionMinField(section));
    body.appendChild(valignField(cell));
    var social = socialTableOf(cell);
    if (social && cell.contains(social)) {
      body.appendChild(numberField('Icon spacing', social.getAttribute('data-nl-gap') || '8', 'social-gap', function (value) {
        setSocialGap(social, value);
      }, 0, 60, 'px'));
    }
  }

  function paintGap(body, gap) {
    var values = readGap(gap);
    body.appendChild(unitField('Width', values.n + values.unit, 'gap-width', function (value, fromUnit) {
      var parsed = splitSize(value, ['px', '%'], false);
      var now = readGap(gap);
      var unit = parsed.keyword ? now.unit : (parsed.unit || now.unit || 'px');
      var n = parseFloat(parsed.num);
      if (!(n >= 0)) return;
      var unitChanged = unit !== now.unit;
      setGap(gap, { n: fromUnit ? now.n : n, unit: unit, bg: now.bg });
      if (fromUnit || unitChanged) paintSettings();
    }, ['px', '%'], false, { unitName: 'gap-unit' }));
    body.appendChild(colorField('Background', values.bg || '', 'gap-bg', function (value) {
      var now = readGap(gap);
      var hex = value ? (normalizeColor(value) || '') : '';
      if (value && !hex) return;
      setGap(gap, { n: now.n, unit: now.unit, bg: hex });
    }));
  }

  function paintSocialGroup(body, el) {
    var table = socialTableOf(el);
    if (!table) return;
    body.appendChild(numberField('Icon spacing', table.getAttribute('data-nl-gap') || '8', 'social-gap', function (value) {
      setSocialGap(table, value);
    }, 0, 60, 'px'));
    var names = window.EzBlocks.networkOrder || Object.keys(window.EzBlocks.networks || {});
    body.appendChild(selectField('Add icon', names[0] || 'facebook', 'network', names.map(function (name) {
      var network = window.EzBlocks.networks[name] || { label: name };
      return [name, network.label];
    }), function () {}));
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'nl-btn';
    addBtn.textContent = 'Add icon';
    addBtn.addEventListener('click', function () {
      var select = document.querySelector('[data-ez-field="network"]');
      addSocial(table, select ? select.value : 'facebook');
    });
    body.appendChild(addBtn);
  }

  function applySocialNetwork(cell, name) {
    var networks = window.EzBlocks.networks || {};
    var network = networks[name];
    if (!network) return;
    cell.setAttribute('data-network', name);
    if (name === 'custom') return;
    var img = cell.querySelector('img');
    if (img) {
      img.setAttribute('src', window.EzBlocks.iconSrc(name));
      img.setAttribute('alt', network.label);
    }
    var plate = cell.querySelector('table');
    [plate, plate && plate.querySelector('td')].forEach(function (node) {
      if (!node) return;
      node.setAttribute('bgcolor', network.color);
      setDecl(node, 'background-color', network.color);
    });
  }

  function paintSocialIcon(body, cell) {
    var link = cell.querySelector('a');
    var img = cell.querySelector('img');
    var order = (window.EzBlocks.networkOrder || Object.keys(window.EzBlocks.networks || {})).filter(function (name) {
      return name !== 'custom';
    });
    var options = [['custom', 'Custom']].concat(order.map(function (name) {
      var network = window.EzBlocks.networks[name] || { label: name };
      return [name, network.label];
    }));
    var current = cell.getAttribute('data-network') || 'facebook';
    if (!options.some(function (option) { return option[0] === current; })) current = 'facebook';
    body.appendChild(selectField('Network', current, 'social-network', options, function (value) {
      applySocialNetwork(cell, value);
      paintSettings();
    }));
    if ((cell.getAttribute('data-network') || 'facebook') === 'custom') {
      body.appendChild(textField('Icon URL', img ? (realSrc(img) || '') : '', 'social-src', function (value) {
        var next = cleanSocialIconSrc(value);
        var input = document.querySelector('[data-ez-field="social-src"]');
        if (next == null) {
          if (input) input.value = img ? (realSrc(img) || '') : '';
          status('That address was not saved.');
          return;
        }
        if (img) {
          if (next) img.setAttribute('src', next);
          else img.removeAttribute('src');
          if (next && !img.getAttribute('alt')) img.setAttribute('alt', 'Icon');
        }
        if (input) input.value = next;
      }, { asset: true, httpOnly: true, wide: true, placeholder: 'https://example.com/icon.png' }));
    }
    body.appendChild(hrefField('Link', link ? (link.getAttribute('href') || '') : '', 'href', function (value) {
      if (link) {
        if (value) link.setAttribute('href', value);
        else link.removeAttribute('href');
      }
    }));
    body.appendChild(numberField('Icon size', img ? (parseInt(img.getAttribute('width'), 10) || 24) : 24, 'width', function (value) {
      var n = parseInt(value, 10);
      if (!(n >= 12 && n <= 128) || !img) return;
      var radius = Math.round(n / 2) + 'px';
      img.setAttribute('width', String(n));
      img.setAttribute('height', String(n));
      setDecl(img, 'width', n + 'px');
      setDecl(img, 'height', n + 'px');
      setDecl(img, 'border-radius', radius);
      var plate = cell.querySelector('table');
      if (plate) {
        plate.setAttribute('width', String(n));
        setDecl(plate, 'width', n + 'px');
        setDecl(plate, 'border-radius', radius);
        var plateCell = plate.querySelector('td');
        if (plateCell) {
          plateCell.setAttribute('width', String(n));
          plateCell.setAttribute('height', String(n));
          setDecl(plateCell, 'width', n + 'px');
          setDecl(plateCell, 'height', n + 'px');
          setDecl(plateCell, 'border-radius', radius);
        }
      }
      spaceSocial(socialTableOf(cell));
    }, 12, 128, 'px'));
    body.appendChild(colorField('Background', readFill(cell), 'social-bg', function (value) {
      paintPlate(cell, value);
    }));
    var group = socialTableOf(cell);
    if (group) {
      body.appendChild(numberField('Icon spacing', group.getAttribute('data-nl-gap') || '8', 'social-gap', function (value) {
        setSocialGap(group, value);
      }, 0, 60, 'px'));
    }
  }

  function applySpacerHeight(table, value) {
    var cell = table && table.querySelector('td');
    var n = parseInt(value, 10);
    if (!(n >= 1 && n <= 400) || !cell) return;
    var row = cell.parentElement;
    if (row) row.setAttribute('height', String(n));
    cell.setAttribute('height', String(n));
    setDecl(cell, 'height', n + 'px');
    setDecl(cell, 'line-height', n + 'px');
    setDecl(cell, 'font-size', n + 'px');
    setDecl(cell, 'mso-line-height-alt', n + 'px');
    setDecl(cell, 'mso-line-height-rule', 'exactly');
  }

  function paintSpacer(body, table) {
    var cell = table.querySelector('td');
    var height = cell ? (parseInt(cell.getAttribute('height'), 10) || 32) : 32;
    body.appendChild(numberField('Spacer height', height, 'height', function (value) {
      applySpacerHeight(table, value);
    }, 1, 400, 'px'));
  }

  // Two divider shapes: this editor's line (a border on the cell) and the original
  // EzBuilder's bar (a filled cell). Both get color and thickness.
  function dividerLine(table) {
    var cell = table.querySelector('td');
    if (!cell) return null;
    var border = decl(cell, 'border-top');
    if (border) {
      var parts = borderParts(border);
      return { cell: cell, kind: 'border', width: parseInt(parts.width, 10) || 1, style: parts.style || 'solid', color: normalizeColor(parts.color) || parts.color || '#e3e5e8' };
    }
    var fill = decl(cell, 'background-color') || cell.getAttribute('bgcolor') || '#e3e5e8';
    return { cell: cell, kind: 'fill', width: parseInt(decl(cell, 'height') || cell.getAttribute('height'), 10) || 1, style: 'solid', color: normalizeColor(fill) || fill };
  }

  function writeDivider(table, line) {
    var cell = line.cell;
    if (line.kind === 'border') {
      setDecl(cell, 'border-top', line.width + 'px ' + line.style + ' ' + line.color);
      return;
    }
    var hex = normalizeColor(line.color) || line.color;
    cell.setAttribute('bgcolor', hex);
    setDecl(cell, 'background-color', hex);
    cell.setAttribute('height', String(line.width));
    setDecl(cell, 'height', line.width + 'px');
    setDecl(cell, 'line-height', line.width + 'px');
    setDecl(cell, 'font-size', '1px');
  }

  function paintDivider(body, table) {
    var line = dividerLine(table);
    if (!line) return;
    body.appendChild(colorField('Line color', line.color, 'divider-color', function (value) {
      var hex = normalizeColor(value);
      if (!hex) return;
      line.color = hex;
      writeDivider(table, line);
    }));
    body.appendChild(numberField('Thickness', line.width, 'divider-width', function (value) {
      var n = parseInt(value, 10);
      if (!(n >= 1 && n <= 20)) return;
      line.width = n;
      writeDivider(table, line);
    }, 1, 20, 'px'));
    if (line.kind === 'border') {
      body.appendChild(selectField('Line style', line.style, 'divider-style', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], function (value) {
        line.style = value;
        writeDivider(table, line);
      }));
    }
  }

  function boxPlace(table) {
    var align = (table.getAttribute('align') || '').toLowerCase();
    if (align === 'left' || align === 'center' || align === 'right') return align;
    var left = decl(table, 'margin-left');
    var right = decl(table, 'margin-right');
    if (left === 'auto' && right === 'auto') return 'center';
    if (left === 'auto') return 'right';
    return 'left';
  }

  function paintIconText(body, table) {
    body.appendChild(selectField('Block alignment', boxPlace(table), 'block-align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], function (value) {
      setBoxAlign(table, value);
    }));
    body.appendChild(unitField('Block width', decl(table, 'width') || '100%', 'block-width', function (value) {
      var trimmed = String(value || '').trim();
      if (!trimmed || trimmed === 'full' || trimmed === 'auto' || trimmed === '100%') {
        setDecl(table, 'width', '100%');
        setDecl(table, 'max-width', '');
        table.setAttribute('width', '100%');
        return;
      }
      var match = trimmed.match(/^(\d+(?:\.\d+)?)(px|%|em|rem)?$/i);
      if (!match || !(parseFloat(match[1]) > 0)) return;
      var unit = (match[2] || 'px').toLowerCase();
      if (unit === '%' && parseFloat(match[1]) >= 100) {
        setDecl(table, 'width', '100%');
        setDecl(table, 'max-width', '');
        table.setAttribute('width', '100%');
        return;
      }
      setDecl(table, 'width', match[1] + unit);
      setDecl(table, 'max-width', '100%');
      if (unit === 'px') table.setAttribute('width', String(Math.round(parseFloat(match[1]))));
      else if (unit === '%') table.setAttribute('width', match[1] + '%');
      else table.setAttribute('width', String(Math.max(1, Math.round(parseFloat(match[1]) * 16))));
    }, ['px', '%', 'em', 'rem'], false));
    body.appendChild(note('Select the icon or the sentence for their own settings. Color, type, and corners are in Edit.'));
  }

  function paintText(body, el) {
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'icon-text') {
      paintIconText(body, el);
      return;
    }
    var social = socialTableOf(el);
    if (social && el.contains(social)) {
      paintSocialGroup(body, el);
      return;
    }
    if (el.tagName === 'A') {
      body.appendChild(textField('Title', el.getAttribute('title') || '', 'title', function (value) {
        if (value) el.setAttribute('title', value);
        else el.removeAttribute('title');
      }));
      body.appendChild(hrefField('Link', el.getAttribute('href') || '', 'href', function (value) {
        if (value) el.setAttribute('href', value);
        else el.removeAttribute('href');
      }));
      body.appendChild(selectField('Target', el.getAttribute('target') || '', 'target', [['', 'This window'], ['_blank', 'New window'], ['_self', 'Same frame']], function (value) {
        if (value) el.setAttribute('target', value);
        else el.removeAttribute('target');
      }));
    }
    if (!(isTextBox(el) || TEXT_TAGS.test(el.tagName) || el.getAttribute('data-ez') === 'text')) return;
    body.appendChild(note('Double-click the text and use the picture button to put an image at the cursor, or add one at the end here.'));
    body.appendChild(textField('Inline image address', '', 'inline-src', function (value) {
      var next = cleanImageSrc(value);
      var input = document.querySelector('[data-ez-field="inline-src"]');
      if (next == null || !next) {
        if (next == null) status('That address was not saved.');
        if (input) input.value = '';
        return;
      }
      if (input && document.activeElement !== input) rememberAsset(next);
      var image = doc.createElement('img');
      image.setAttribute('data-nl', 'inline-image');
      image.setAttribute('data-ez', 'image');
      image.setAttribute('src', next);
      image.setAttribute('width', '32');
      image.setAttribute('height', '32');
      image.setAttribute('alt', '');
      image.setAttribute('border', '0');
      image.setAttribute('style', 'display:inline-block;width:32px;height:32px;vertical-align:middle;border:0;outline:none;text-decoration:none;');
      el.appendChild(image);
      if (input) input.value = '';
      fitInline(image);
      select(image);
    }, { asset: true, wide: true, commit: true }));
  }

  function showTab(name) {
    if (name !== 'edit' && name !== 'config' && name !== 'layers' && name !== 'blocks') name = 'blocks';
    viewTab = name;
    ['edit', 'config', 'layers', 'blocks'].forEach(function (tab) {
      var panel = document.getElementById('ez-panel-' + tab);
      var button = document.getElementById('ez-tab-' + tab);
      if (panel) panel.hidden = tab !== name;
      if (button) {
        button.classList.toggle('is-on', tab === name);
        button.setAttribute('aria-selected', tab === name ? 'true' : 'false');
      }
    });
  }

  function typeHost(el) {
    if (isButtonTable(el)) return buttonAnchor(allCells(el)[0]) || el;
    return el;
  }

  function boxSides(el, prop) {
    var read = readStyle(el && el.getAttribute('style'));
    var parts = String(read.map[prop] || '').trim().split(/\s+/).filter(Boolean);
    function pick(side, index) {
      if (read.map[prop + '-' + side]) return read.map[prop + '-' + side];
      if (!parts.length) return '';
      if (parts.length === 1) return parts[0];
      if (parts.length === 2) return parts[index % 2 === 0 ? 0 : 1];
      if (parts.length === 3) return index === 0 ? parts[0] : index === 2 ? parts[2] : parts[1];
      return parts[index] || '';
    }
    return { top: pick('top', 0), right: pick('right', 1), bottom: pick('bottom', 2), left: pick('left', 3) };
  }

  function writeSides(el, prop, sides) {
    if (!el) return;
    var read = readStyle(el.getAttribute('style'));
    ['top', 'right', 'bottom', 'left'].forEach(function (side) { delete read.map[prop + '-' + side]; });
    var values = ['top', 'right', 'bottom', 'left'].map(function (side) { return String(sides[side] || '').trim(); });
    if (!values.some(Boolean)) delete read.map[prop];
    else read.map[prop] = values.map(function (value) { return value || '0'; }).join(' ');
    writeStyle(el, read.map, read.order);
  }

  function sidesField(label, prop, sides, write) {
    var wrap = document.createElement('div');
    wrap.className = 'ez-field ez-wide';
    var span = document.createElement('span');
    span.className = 'ez-field-title';
    span.textContent = label;
    wrap.appendChild(span);
    // The link button sets all four sides at once, like design tools do. It starts
    // on when the four sides already match.
    var vals = ['top', 'right', 'bottom', 'left'].map(function (side) { return String(sides[side] || ''); });
    var linked = !!linkedSides[prop] || (vals[0] !== '' && vals.every(function (v) { return v === vals[0]; }) && linkedSides[prop] !== false);
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'ez-link-sides' + (linked ? ' is-on' : '');
    link.setAttribute('data-ez-link', prop);
    link.setAttribute('aria-pressed', linked ? 'true' : 'false');
    link.title = 'Same value on all four sides';
    link.innerHTML = iconSvg('M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z');
    link.addEventListener('click', function () {
      linked = !linked;
      linkedSides[prop] = linked;
      link.classList.toggle('is-on', linked);
      link.setAttribute('aria-pressed', linked ? 'true' : 'false');
    });
    span.appendChild(link);
    var grid = document.createElement('div');
    grid.className = 'ez-sides';
    var units = ['px', '%', 'em', 'rem'];
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      var cell = document.createElement('div');
      cell.className = 'ez-side';
      var name = document.createElement('span');
      name.className = 'ez-side-label';
      name.textContent = side.charAt(0).toUpperCase() + side.slice(1);
      cell.appendChild(name);
      cell.appendChild(unitControl(sides[side] || '', prop + '-' + side, function (value) {
        if (linked) {
          ['top', 'right', 'bottom', 'left'].forEach(function (other) {
            sides[other] = value;
            if (other === side) return;
            var input = grid.querySelector('[data-ez-field="' + prop + '-' + other + '"]');
            if (input && document.activeElement !== input) input.value = String(value).replace(/[a-z%]+$/i, '');
          });
        } else sides[side] = value;
        write(sides);
      }, units, true));
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function readAlign(el) {
    if (isButtonTable(el) || el.tagName === 'IMG' || el.tagName === 'TABLE') return (el.getAttribute('align') || decl(el, 'text-align') || (isButtonTable(el) ? 'center' : 'left')).toLowerCase();
    if (el.tagName === 'TD' || el.tagName === 'TH') return (el.getAttribute('align') || decl(el, 'text-align') || 'left').toLowerCase();
    return (decl(el, 'text-align') || 'left').toLowerCase();
  }

  // Align on a heading or paragraph stays on that element.
  // A cell align also shifts the narrow tables and images directly inside it.
  function writeAlign(el, value) {
    if (el.tagName === 'TD' || el.tagName === 'TH') {
      setTextAlign(el, value);
      return;
    }
    if (el.tagName === 'IMG') {
      alignNarrow(el, value);
      return;
    }
    if (isButtonTable(el) || el.getAttribute('data-nl') === 'icon-text') {
      setBoxAlign(el, value);
      return;
    }
    if (el.tagName === 'TABLE') {
      setDecl(el, 'text-align', value || '');
      alignNarrow(el, value || 'left');
      return;
    }
    setDecl(el, 'text-align', value || '');
  }

  function paintPlate(cell, color) {
    var hex = color ? (normalizeColor(color) || '') : '';
    if (color && !hex) return;
    cell.querySelectorAll('table, td').forEach(function (node) {
      if (node === cell) return;
      if (!hex) {
        node.removeAttribute('bgcolor');
        setDecl(node, 'background-color', '');
      } else {
        node.setAttribute('bgcolor', hex);
        setDecl(node, 'background-color', hex);
      }
    });
  }

  function fillHost(el) {
    if (el.getAttribute('data-ez') === 'spacer' || el.getAttribute('data-ez') === 'divider') return el.querySelector('td') || el;
    return el;
  }

  function readFill(el) {
    if (buttonOf(el)) {
      var cell = allCells(buttonOf(el))[0];
      return (cell && (cell.getAttribute('bgcolor') || decl(cell, 'background-color'))) || '';
    }
    if (el.getAttribute('data-nl') === 'social-element') {
      var plate = el.querySelector('td');
      return (plate && (plate.getAttribute('bgcolor') || decl(plate, 'background-color'))) || '';
    }
    if (el.getAttribute('data-nl') === 'hspacer') return readGap(el).bg;
    var host = fillHost(el);
    return host.getAttribute('bgcolor') || decl(host, 'background-color') || '';
  }

  // Button color stays on the button cell and its link. A gap keeps its width.
  function writeFill(el, color) {
    if (buttonOf(el)) {
      paintButtonColor(buttonOf(el), color);
      return;
    }
    if (el.getAttribute('data-nl') === 'social-element') {
      paintPlate(el, color);
      return;
    }
    if (el.getAttribute('data-nl') === 'hspacer') {
      var now = readGap(el);
      var gapHex = color ? (normalizeColor(color) || '') : '';
      if (color && !gapHex) return;
      setGap(el, { n: now.n, unit: now.unit, bg: gapHex });
      return;
    }
    var host = fillHost(el);
    if (host.tagName === 'TD' || host.tagName === 'TH' || host.tagName === 'TABLE') paintSolid(host, color);
    else {
      var hex = color ? (normalizeColor(color) || '') : '';
      if (color && !hex) return;
      setDecl(host, 'background-color', hex);
    }
  }

  function writeCssSize(el, name, value) {
    var v = String(value || '').trim();
    if (el.getAttribute('data-nl') === 'section' && name === 'width') return;
    if (el.getAttribute('data-nl') === 'hspacer') return;
    if (isButtonTable(el) && (name === 'width' || name === 'max-width')) {
      if (v === '100%' || (name === 'width' && /%$/.test(v))) return;
    }
    if (name === 'height' && el.getAttribute('data-ez') === 'spacer') {
      if (!/^\d+(?:\.\d+)?(?:px)?$/i.test(v)) return;
      applySpacerHeight(el, v);
      return;
    }
    var host = (name === 'height' || name === 'max-width') && (el.getAttribute('data-ez') === 'divider') ? (el.querySelector('td') || el) : el;
    setDecl(host, name, v);
    if (name !== 'width') return;
    var px = v.match(/^(\d+(?:\.\d+)?)px$/i);
    if (host.tagName === 'IMG' && px) host.setAttribute('width', String(Math.round(parseFloat(px[1]))));
    if (isButtonTable(el)) {
      if (!v) el.removeAttribute('width');
      else if (px) el.setAttribute('width', String(Math.round(parseFloat(px[1]))));
    }
  }

  function writeRadius(el, value) {
    var v = String(value || '').trim();
    var button = buttonOf(el);
    if (button) {
      var cell = allCells(button)[0];
      var link = cell && buttonAnchor(cell);
      setDecl(button, 'border-radius', v);
      if (cell) setDecl(cell, 'border-radius', v);
      if (link) setDecl(link, 'border-radius', v);
      return;
    }
    setDecl(el, 'border-radius', v);
  }

  function bgHost(el) {
    if (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section') return outerBackgroundCell(el) || el;
    if (el.getAttribute('data-ez') === 'spacer' || el.getAttribute('data-ez') === 'divider') return el.querySelector('td') || el;
    return el;
  }

  function caretSvg(open) {
    return '<svg viewBox="0 0 24 24" class="' + (open ? '' : 'is-shut') + '" aria-hidden="true"><path fill="currentColor" d="M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6 1.41-1.42z"/></svg>';
  }

  function sector(title, key, nodes) {
    var box = document.createElement('div');
    box.className = 'ez-sector';
    var open = sectorOpen[key] !== false;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ez-sector-title';
    button.innerHTML = caretSvg(open) + '<span></span>';
    button.querySelector('span').textContent = title;
    var body = document.createElement('div');
    body.className = 'ez-sector-body';
    body.hidden = !open;
    nodes.forEach(function (node) { if (node) body.appendChild(node); });
    button.addEventListener('click', function () {
      body.hidden = !body.hidden;
      sectorOpen[key] = !body.hidden;
      var mark = button.querySelector('svg');
      if (mark) mark.classList.toggle('is-shut', body.hidden);
    });
    box.appendChild(button);
    box.appendChild(body);
    return box;
  }

  function dimensionFields(el) {
    var fields = [];
    var skipWidth = el.getAttribute('data-nl') === 'section' || el.getAttribute('data-nl') === 'hspacer';
    if (el.getAttribute('data-nl') === 'section') fields.push(note('Hug, fill, and fixed width are in Config.'));
    if (el.getAttribute('data-nl') === 'hspacer') fields.push(note('Gap width and unit are in Config.'));
    if (!skipWidth) {
      fields.push(unitField('Width', decl(el, 'width') || '', 'css-width', function (value) { writeCssSize(el, 'width', value); }, SIZE_UNITS, false));
    }
    var heightHost = el.getAttribute('data-ez') === 'spacer' ? (el.querySelector('td') || el) : el;
    fields.push(unitField('Height', decl(heightHost, 'height') || '', 'css-height', function (value) { writeCssSize(el, 'height', value); }, SIZE_UNITS, false));
    fields.push(unitField('Max width', decl(el, 'max-width') || '', 'max-width', function (value) { writeCssSize(el, 'max-width', value); }, SIZE_UNITS, false));
    var minHost = el.getAttribute('data-ez') === 'spacer' ? (el.querySelector('td') || el) : el;
    fields.push(unitField('Min height', decl(minHost, 'min-height') || '', 'min-height', function (value) { setDecl(minHost, 'min-height', String(value || '').trim()); }, SIZE_UNITS, false));
    var margin = boxSides(el, 'margin');
    fields.push(sidesField('Margin', 'margin', margin, function (sides) { writeSides(el, 'margin', sides); }));
    var padHost = isButtonTable(el) ? (buttonAnchor(allCells(el)[0]) || allCells(el)[0]) : fillHost(el);
    var padding = boxSides(padHost, 'padding');
    fields.push(sidesField('Padding', 'padding', padding, function (sides) {
      writeSides(padHost, 'padding', sides);
      if (isButtonTable(el)) {
        var cell = allCells(el)[0];
        if (cell) setDecl(cell, 'mso-padding-alt', decl(padHost, 'padding'));
      }
    }));
    return fields;
  }

  var ALIGN_ICON = {
    left: 'M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z',
    center: 'M3 3h18v2H3V3zm4 4h10v2H7V7zm-4 4h18v2H3v-2zm4 4h10v2H7v-2zm-4 4h18v2H3v-2z',
    right: 'M3 3h18v2H3V3zm6 4h12v2H9V7zm-6 4h18v2H3v-2zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z',
    justify: 'M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z'
  };

  function typeFields(el) {
    var host = typeHost(el);
    var faces = FONTS.map(function (face) { return [face, face.split(',')[0].replace(/"/g, '')]; });
    var family = decl(host, 'font-family') || FONT;
    if (!faces.some(function (face) { return face[0] === family; })) faces.unshift([family, family]);
    var align = readAlign(el);
    var justify = el.tagName !== 'IMG' && el.tagName !== 'TABLE' && !isButtonTable(el);
    var alignOptions = [
      ['left', 'Left', iconSvg(ALIGN_ICON.left)],
      ['center', 'Center', iconSvg(ALIGN_ICON.center)],
      ['right', 'Right', iconSvg(ALIGN_ICON.right)]
    ];
    if (justify) alignOptions.push(['justify', 'Justify', iconSvg(ALIGN_ICON.justify)]);
    if (!alignOptions.some(function (option) { return option[0] === align; })) align = 'left';
    var decoration = (decl(host, 'text-decoration') || 'none').toLowerCase();
    if (decoration.indexOf('underline') !== -1) decoration = 'underline';
    else if (decoration.indexOf('line-through') !== -1) decoration = 'line-through';
    else decoration = 'none';
    var fontStyle = (decl(host, 'font-style') || 'normal').toLowerCase() === 'italic' ? 'italic' : 'normal';
    var font = selectField('Font family', family, 'font', faces, function (value) { setDecl(host, 'font-family', value); });
    font.classList.add('ez-wide');
    var fields = [
      font,
      unitField('Font size', decl(host, 'font-size') || '', 'size', function (value) { setDecl(host, 'font-size', String(value || '').trim()); }, SIZE_UNITS, false),
      selectField('Font weight', decl(host, 'font-weight') || '400', 'weight', (function () {
        var weights = [['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold']];
        var current = decl(host, 'font-weight') || '400';
        if (!weights.some(function (option) { return option[0] === current; })) weights.unshift([current, current]);
        return weights;
      })(), function (value) { setDecl(host, 'font-weight', value); }),
      unitField('Letter spacing', decl(host, 'letter-spacing') || '', 'letter-spacing', function (value) { setDecl(host, 'letter-spacing', String(value || '').trim()); }, ['px', 'em', 'rem'], true),
      colorField('Font color', decl(host, 'color') || '', 'color', function (value) {
        var hex = normalizeColor(value);
        if (hex) setDecl(host, 'color', hex);
        else if (!String(value || '').trim()) setDecl(host, 'color', '');
      }),
      unitField('Line height', decl(host, 'line-height') || '', 'line-height', function (value) { setDecl(host, 'line-height', String(value || '').trim()); }, ['px', 'em', 'rem', '%'], true),
      radioField('Text align', align, 'align', alignOptions, function (value) { writeAlign(el, value); }),
      radioField('Text decoration', decoration, 'decoration', [
        ['none', 'None', iconSvg('M5 4v3h5.5v12h3V7H19V4H5z')],
        ['underline', 'Underline', iconSvg('M5 21h14v-2H5v2zM12 2a6 6 0 0 0-6 6v5a6 6 0 0 0 12 0V8a6 6 0 0 0-6-6zm4 11a4 4 0 0 1-8 0V8a4 4 0 0 1 8 0v5z')],
        ['line-through', 'Line through', iconSvg('M3 14h18v-2H3v2zm2-5h2.5A2.5 2.5 0 0 1 10 6.5 2.5 2.5 0 0 1 12.5 9H14a4 4 0 0 0-8 0H6zm8 6h2a4 4 0 0 1-8 0h2.5A1.5 1.5 0 0 0 12 16.5 1.5 1.5 0 0 0 13.5 15H13z')]
      ], function (value) {
        setDecl(host, 'text-decoration', value === 'none' ? '' : value);
      }),
      radioField('Font style', fontStyle, 'font-style', [
        ['normal', 'Normal', iconSvg('M5 4v3h5.5v12h3V7H19V4H5z')],
        ['italic', 'Italic', iconSvg('M10 4v3h2.2l-3.4 10H6v3h8v-3h-2.2l3.4-10H18V4h-8z')]
      ], function (value) {
        setDecl(host, 'font-style', value === 'normal' ? '' : value);
      })
    ];
    var vertical = el.tagName !== 'IMG' && (el.tagName === 'TD' || el.tagName === 'TH' || (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section')) && el.getAttribute('data-nl') !== 'hspacer' && el.getAttribute('data-nl') !== 'social-element';
    if (vertical) {
      var current = el.tagName === 'TABLE' ? ((firstRowCells(el)[0] && firstRowCells(el)[0].getAttribute('valign')) || 'top') : (el.getAttribute('valign') || decl(el, 'vertical-align') || 'top');
      fields.push(selectField('Vertical align', current, 'valign', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], function (value) {
        setValign(el, value);
      }));
    }
    return fields;
  }

  function borderParts(value) {
    var raw = String(value || '').trim();
    return {
      width: (raw.match(/(\d+(?:\.\d+)?(?:px|em|rem|%)?)/) || [])[1] || '',
      style: (raw.match(/\b(none|solid|dashed|dotted|double)\b/i) || [])[1] || (raw ? 'solid' : 'solid'),
      color: (raw.match(/#[0-9a-f]{3,8}\b/i) || [])[0] || ''
    };
  }

  // A button's outline goes on its link, which the Outlook copy also reads.
  // A border on the table or cell drew a square box behind the rounded button.
  function buttonBorderHost(el) {
    var button = buttonOf(el);
    if (!button) return null;
    var cell = allCells(button)[0];
    return (cell && buttonAnchor(cell)) || null;
  }

  function writeBorder(el, parts) {
    var divider = el.getAttribute('data-ez') === 'divider';
    var host = divider ? (el.querySelector('td') || el) : el;
    var link = buttonBorderHost(el);
    if (link) {
      var button = buttonOf(el);
      setDecl(button, 'border', '');
      if (allCells(button)[0]) setDecl(allCells(button)[0], 'border', '');
      host = link;
    }
    var prop = divider ? 'border-top' : 'border';
    var width = String(parts.width || '').trim();
    var style = String(parts.style || '').trim();
    var color = String(parts.color || '').trim();
    if (!width && (!style || style === 'none') && !color) {
      setDecl(host, prop, '');
      return;
    }
    setDecl(host, prop, (width || '1px') + ' ' + (style || 'solid') + (color ? ' ' + color : ''));
  }

  function decorFields(el) {
    var fields = [
      colorField('Background color', readFill(el), 'background', function (value) { writeFill(el, value); })
    ];
    var radiusHost = buttonOf(el) ? (allCells(buttonOf(el))[0] || el) : el;
    var radius = boxSides(radiusHost, 'border-radius');
    fields.push(sidesField('Border radius', 'radius', radius, function (sides) {
      var values = ['top', 'right', 'bottom', 'left'].map(function (side) { return String(sides[side] || '').trim(); });
      writeRadius(el, values.some(Boolean) ? values.map(function (value) { return value || '0'; }).join(' ') : '');
    }));
    if (el.tagName === 'TABLE') {
      fields.push(selectField('Border collapse', decl(el, 'border-collapse') || 'separate', 'border-collapse', [['separate', 'Separate'], ['collapse', 'Collapse']], function (value) {
        setDecl(el, 'border-collapse', value === 'separate' ? '' : value);
      }));
    }
    var borderHost = el.getAttribute('data-ez') === 'divider' ? (el.querySelector('td') || el) : el;
    var borderValue = el.getAttribute('data-ez') === 'divider' ? (decl(borderHost, 'border-top') || '') : (decl(buttonBorderHost(el) || el, 'border') || decl(el, 'border') || '');
    var parts = borderParts(borderValue);
    fields.push(unitField('Border width', parts.width, 'border-width', function (value) {
      parts.width = value;
      writeBorder(el, parts);
    }, ['px', 'em', 'rem'], false));
    fields.push(selectField('Border style', parts.style || 'solid', 'border-style', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double'], ['none', 'None']], function (value) {
      parts.style = value;
      writeBorder(el, parts);
    }));
    fields.push(colorField('Border color', parts.color, 'border-color', function (value) {
      var hex = normalizeColor(value);
      parts.color = hex || (String(value || '').trim() ? parts.color : '');
      if (String(value || '').trim() && !hex) return;
      writeBorder(el, parts);
    }));
    if (el.tagName === 'TABLE' || el.tagName === 'TD' || el.tagName === 'TH') {
      var host = bgHost(el);
      var image = textField('Background image', host.getAttribute('background') || '', 'bg-image', function (value) {
        if (!setBackgroundImage(el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section' ? el : host, value)) status('That address was not saved.');
      }, { asset: true, wide: true });
      image.classList.add('ez-wide');
      fields.push(image);
      fields.push(selectField('Repeat', decl(host, 'background-repeat') || 'repeat', 'bg-repeat', [['repeat', 'Repeat'], ['no-repeat', 'No repeat'], ['repeat-x', 'Repeat x'], ['repeat-y', 'Repeat y']], function (value) {
        setDecl(host, 'background-repeat', value === 'repeat' ? '' : value);
      }));
      fields.push(textField('Position', decl(host, 'background-position') || '', 'bg-position', function (value) {
        setDecl(host, 'background-position', String(value || '').trim());
      }));
      fields.push(unitField('Size', decl(host, 'background-size') || '', 'bg-size', function (value) {
        setDecl(host, 'background-size', String(value || '').trim());
      }, ['px', '%', 'em', 'rem', 'vw', 'vh'], false));
    }
    return fields;
  }

  function extraFields(el) {
    return [
      textField('Opacity', decl(el, 'opacity') || '', 'opacity', function (value) {
        var v = String(value || '').trim();
        if (v && (!/^\d*\.?\d+$/.test(v) || parseFloat(v) > 1)) return;
        setDecl(el, 'opacity', v);
      })
    ];
  }

  function writeBodyRule(name, value) {
    if (value) bodyRules[name] = value;
    else delete bodyRules[name];
    applyBody();
  }

  function pageFields() {
    var faces = FONTS.map(function (face) { return [face, face.split(',')[0].replace(/"/g, '')]; });
    var family = bodyRules['font-family'] || FONT;
    if (!faces.some(function (face) { return face[0] === family; })) faces.unshift([family, family]);
    var font = selectField('Font family', family, 'font', faces, function (value) { writeBodyRule('font-family', value); });
    font.classList.add('ez-wide');
    return {
      dimension: [
        note('The column stays 600px wide. Padding here is the page around that column.'),
        unitField('Padding', bodyRules.padding || '0', 'page-padding', function (value) { writeBodyRule('padding', String(value || '').trim()); }, ['px', '%', 'em', 'rem'], true)
      ],
      type: [
        font,
        unitField('Font size', bodyRules['font-size'] || '', 'size', function (value) { writeBodyRule('font-size', String(value || '').trim()); }, SIZE_UNITS, false),
        colorField('Font color', bodyRules.color || '', 'color', function (value) {
          var hex = normalizeColor(value);
          if (String(value || '').trim() && !hex) return;
          writeBodyRule('color', hex || '');
        })
      ],
      decor: [
        colorField('Background color', bodyRules['background-color'] || '#ffffff', 'page-color', function (value) {
          var hex = normalizeColor(value);
          if (String(value || '').trim() && !hex) return;
          writeBodyRule('background-color', hex || '#ffffff');
        }),
        note('The page color is the area around the 600px column in the inbox.')
      ]
    };
  }

  function paintEdit(body, el) {
    if (!el) {
      var page = pageFields();
      body.appendChild(sector('Dimension', 'dimension', page.dimension));
      body.appendChild(sector('Typography', 'type', page.type));
      body.appendChild(sector('Decorations', 'decor', page.decor));
      return;
    }
    body.appendChild(sector('Dimension', 'dimension', dimensionFields(el)));
    body.appendChild(sector('Typography', 'type', typeFields(el)));
    body.appendChild(sector('Decorations', 'decor', decorFields(el)));
    body.appendChild(sector('Extra', 'extra', extraFields(el)));
  }

  function paintConfig(body, el) {
    if (!el) {
      body.appendChild(note('Choose a block to edit its label, link, image, spacing, or width. Type, color, and spacing live in Edit.'));
      return;
    }
    if (el.tagName !== 'IMG' && el.tagName !== 'A' && !isButtonTable(el) && el.getAttribute('data-nl') !== 'social-element' && el.getAttribute('data-nl') !== 'hspacer') {
      body.appendChild(attrField('Id', el, 'id'));
      body.appendChild(attrField('Title', el, 'title'));
    }
    if (isButtonTable(el)) paintButton(body, el);
    else if (el.tagName === 'IMG') paintImage(body, el);
    else if (el.getAttribute('data-nl') === 'hspacer') paintGap(body, el);
    else if (el.getAttribute('data-nl') === 'social-element') paintSocialIcon(body, el);
    else if (el.getAttribute('data-nl') === 'section') paintSection(body, el);
    else if (el.tagName === 'TD' || el.tagName === 'TH') paintCell(body, el);
    else if (el.getAttribute('data-ez') === 'spacer') paintSpacer(body, el);
    else if (el.getAttribute('data-ez') === 'divider') paintDivider(body, el);
    else paintText(body, el);
    var iconBox = el && el.getAttribute('data-nl') !== 'icon-text' && el.closest ? el.closest('[data-nl="icon-text"]') : null;
    if (iconBox) paintIconText(body, iconBox);
    body.appendChild(removeButton());
  }

  function isLayer(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === 'ez-insert' || el.id === 'ez-insert-label' || el.id === 'ez-badge' || el.id === 'ez-tools') return false;
    var tag = el.tagName;
    if (tag === 'TABLE' || tag === 'TR' || tag === 'TD' || tag === 'TH' || tag === 'IMG' || tag === 'A') return true;
    if (/^H[1-6]$/.test(tag) || tag === 'P' || tag === 'UL' || tag === 'OL' || tag === 'LI') return true;
    if (el.getAttribute('data-ez') || el.getAttribute('data-nl')) return true;
    return false;
  }

  function layerNodes(el) {
    var kids = [];
    if (!el || !el.children) return kids;
    Array.prototype.forEach.call(el.children, function (child) {
      if (!child || child.nodeType !== 1) return;
      if (child.id === 'ez-insert' || child.id === 'ez-insert-label' || child.id === 'ez-badge' || child.id === 'ez-tools') return;
      var tag = child.tagName;
      if (tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT') {
        kids = kids.concat(layerNodes(child));
        return;
      }
      if (isLayer(child)) kids.push(child);
      else kids = kids.concat(layerNodes(child));
    });
    return kids;
  }

  function layerName(el) {
    var named = crumbLabel(el);
    if (named) return named;
    if (el.tagName === 'TR') return 'Row';
    if (el.tagName === 'TD' || el.tagName === 'TH') return 'Cell';
    if (el.tagName === 'DIV') return 'Box';
    if (el.tagName === 'UL' || el.tagName === 'OL') return 'List';
    if (el.tagName === 'LI') return 'Item';
    return el.tagName.toLowerCase();
  }

  function layerOpen(el, depth) {
    if (layerState.has(el)) return !!layerState.get(el);
    return depth < 2;
  }

  function layerRow(el, depth) {
    var wrap = document.createElement('div');
    var row = document.createElement('div');
    row.className = 'ez-layer' + (el === selectedEl ? ' is-on' : '');
    row.style.paddingLeft = (depth * 12) + 'px';
    var kids = layerNodes(el);
    var open = kids.length ? layerOpen(el, depth) : false;
    var twist = document.createElement('button');
    twist.type = 'button';
    twist.className = 'ez-twist';
    twist.textContent = kids.length ? (open ? '▾' : '▸') : '';
    twist.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
    twist.addEventListener('click', function (event) {
      event.stopPropagation();
      layerState.set(el, !layerOpen(el, depth));
      var panel = document.getElementById('ez-panel-layers');
      if (!panel) return;
      panel.innerHTML = '';
      paintLayers(panel);
    });
    var name = document.createElement('button');
    name.type = 'button';
    name.className = 'ez-layer-name';
    name.textContent = layerName(el);
    name.addEventListener('click', function () { select(el); });
    var eye = document.createElement('button');
    eye.type = 'button';
    var off = el.getAttribute('data-ez-hidden') === '1' || decl(el, 'display') === 'none';
    eye.className = 'ez-eye' + (off ? ' is-off' : '');
    eye.title = off ? 'Show' : 'Hide';
    eye.innerHTML = iconSvg('M12 6.5C7 6.5 2.73 9.61 1 14c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 .01 6.01A3 3 0 0 0 12 11z');
    eye.addEventListener('click', function (event) {
      event.stopPropagation();
      // The Layers eye hides the block in the canvas only.
      // The exported email still has it. A display:none written in the email is shown again.
      if (decl(el, 'display') === 'none') {
        snapshot();
        setDecl(el, 'display', '');
        changed();
      } else if (el.getAttribute('data-ez-hidden') === '1') el.removeAttribute('data-ez-hidden');
      else el.setAttribute('data-ez-hidden', '1');
      var hidden = el.getAttribute('data-ez-hidden') === '1' || decl(el, 'display') === 'none';
      eye.classList.toggle('is-off', hidden);
      eye.title = hidden ? 'Show' : 'Hide';
      placeChrome();
    });
    // Drag a layer onto another to move it there.
    row.draggable = true;
    row.addEventListener('dragstart', function (event) {
      layerDrag = el;
      try {
        event.dataTransfer.setData('text/plain', 'ezlayer');
        event.dataTransfer.effectAllowed = 'move';
      } catch (err) {}
    });
    row.addEventListener('dragend', function () {
      layerDrag = null;
      clearLayerMarks();
    });
    row.addEventListener('dragover', function (event) {
      if (!layerDrag) return;
      var spot = layerSpot(layerDrag, el, event);
      clearLayerMarks();
      if (!spot) return;
      event.preventDefault();
      row.classList.add(spot.into ? 'is-into' : (spot.before === el ? 'is-before' : 'is-after'));
    });
    row.addEventListener('drop', function (event) {
      if (!layerDrag) return;
      event.preventDefault();
      var spot = layerSpot(layerDrag, el, event);
      var moving = layerDrag;
      layerDrag = null;
      clearLayerMarks();
      if (!spot) return;
      snapshot();
      var from = moving.parentElement;
      if (spot.before && spot.before.parentNode === spot.parent) spot.parent.insertBefore(moving, spot.before);
      else spot.parent.appendChild(moving);
      if (moving.getAttribute('data-nl') === 'social-element') spaceSocial(socialTableOf(moving));
      if (from && from !== spot.parent && from.getAttribute && from.getAttribute('data-nl') === 'social-group') spaceSocial(from.closest('[data-nl="social-icons"]'));
      select(moving);
      changed();
    });
    row.appendChild(twist);
    row.appendChild(name);
    row.appendChild(eye);
    wrap.appendChild(row);
    if (open) kids.forEach(function (child) { wrap.appendChild(layerRow(child, depth + 1)); });
    return wrap;
  }

  var layerDrag = null;

  function clearLayerMarks() {
    document.querySelectorAll('.ez-layer.is-before, .ez-layer.is-after, .ez-layer.is-into').forEach(function (node) {
      node.classList.remove('is-before', 'is-after', 'is-into');
    });
  }

  // Where a dragged layer lands. Cells stay in their row, rows in their table,
  // social icons in their group. Blocks go beside another block or into a column.
  function layerSpot(moving, target, event) {
    if (!moving || !target || moving === target || moving.contains(target)) return null;
    var rect = event.currentTarget.getBoundingClientRect();
    var y = event.clientY - rect.top;
    var upper = y < rect.height / 2;
    var cellMove = moving.tagName === 'TD' || moving.tagName === 'TH';
    if (cellMove) {
      if ((target.tagName !== 'TD' && target.tagName !== 'TH') || target.parentElement !== moving.parentElement) return null;
      return { parent: target.parentElement, before: upper ? target : target.nextSibling };
    }
    if (moving.tagName === 'TR') {
      if (target.tagName !== 'TR' || target.parentElement !== moving.parentElement) return null;
      return { parent: target.parentElement, before: upper ? target : target.nextSibling };
    }
    if (target.tagName === 'TD' || target.tagName === 'TH') {
      if (sealedCell(target)) return null;
      if (y > rect.height * 0.25 && y < rect.height * 0.75) return { parent: target, before: null, into: true };
      return null;
    }
    var parent = target.parentElement;
    if (!parent || /^(TR|TBODY|THEAD|TFOOT|TABLE)$/.test(parent.tagName)) return null;
    if ((parent.tagName === 'TD' || parent.tagName === 'TH') && sealedCell(parent)) return null;
    if (target.closest('[data-nl="social-icons"]') || target.closest('[contenteditable="true"]')) return null;
    return { parent: parent, before: upper ? target : target.nextSibling };
  }

  function revealLayers(el) {
    var node = el;
    while (node && node !== doc.body) {
      layerState.set(node, true);
      node = node.parentElement;
    }
  }

  function paintLayers(root) {
    if (!doc || !root) return;
    var kids = layerNodes(doc.body);
    if (!kids.length) {
      root.appendChild(note('The column is empty.'));
      return;
    }
    kids.forEach(function (el) { root.appendChild(layerRow(el, 0)); });
  }

  var painting = false;

  function paintSettings() {
    if (painting) return;
    var title = document.getElementById('ez-settings-title');
    var edit = document.getElementById('ez-panel-edit');
    var config = document.getElementById('ez-panel-config');
    var layers = document.getElementById('ez-panel-layers');
    if (!edit || !config || !layers) return;
    painting = true;
    edit.innerHTML = '';
    config.innerHTML = '';
    layers.innerHTML = '';
    var el = selectedEl;
    if (title) title.textContent = el ? (crumbLabel(el) || 'Block') : 'Email';
    try {
      paintEdit(edit, el);
      paintConfig(config, el);
      paintLayers(layers);
      showTab(viewTab);
    } finally {
      painting = false;
    }
  }

  var editing = null;
  var INLINE_SIZE = 32;
  var INLINE_PLACEHOLDER = 'https://placehold.co/32x32/f3f3f3/888686?text=Img';

  var RTE_ACTIONS = [
    { act: 'bold', title: 'Bold', html: '<b>B</b>' },
    { act: 'italic', title: 'Italic', html: '<i>I</i>' },
    { act: 'underline', title: 'Underline', html: '<u>U</u>' },
    { act: 'strikeThrough', title: 'Strikethrough', html: '<s>S</s>' },
    { act: 'link', title: 'Link', svg: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z' },
    { act: 'inline-image', title: 'Insert image at the cursor', svg: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm2 0v10.6l3.3-3.3a1 1 0 0 1 1.4 0L12 14.6l4.3-4.3a1 1 0 0 1 1.4 0L19 11.6V5zm3.5 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z' }
  ];

  function ensureRte() {
    var bar = doc.getElementById('ez-rte');
    if (bar) return bar;
    bar = doc.createElement('div');
    bar.id = 'ez-rte';
    bar.setAttribute('contenteditable', 'false');
    RTE_ACTIONS.forEach(function (item) {
      var button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('data-rte', item.act);
      button.title = item.title;
      button.innerHTML = item.svg ? iconSvg(item.svg) : item.html;
      // Keep the caret in the text while a button is pressed.
      button.addEventListener('mousedown', function (event) { event.preventDefault(); });
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        runRte(item.act);
      });
      bar.appendChild(button);
    });
    doc.documentElement.appendChild(bar);
    return bar;
  }

  function placeRte() {
    if (!doc) return;
    var bar = doc.getElementById('ez-rte');
    if (!bar) return;
    if (!editing || !editing.isConnected || previewOn) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    var rect = editing.getBoundingClientRect();
    var top = Math.round(rect.top) - 34;
    if (top < 2) top = Math.round(rect.bottom) + 6;
    var limit = Math.max(4, (doc.documentElement.clientWidth || 0) - bar.offsetWidth - 4);
    bar.style.left = Math.max(4, Math.min(Math.round(rect.left), limit)) + 'px';
    bar.style.top = top + 'px';
    paintRteState();
  }

  function paintRteState() {
    var bar = doc && doc.getElementById('ez-rte');
    if (!bar) return;
    Array.prototype.forEach.call(bar.querySelectorAll('button[data-rte]'), function (button) {
      var act = button.getAttribute('data-rte');
      var on = false;
      if (act === 'link') on = !!linkAtCaret();
      else if (act !== 'inline-image') {
        try { on = doc.queryCommandState(act); } catch (err) { on = false; }
      }
      button.classList.toggle('is-on', !!on);
    });
  }

  function linkAtCaret() {
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount || !editing) return null;
    var node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentElement;
    var link = node && node.closest ? node.closest('a') : null;
    return link && editing.contains(link) ? link : null;
  }

  function inlineImageHtml(src) {
    return '<img src="' + (src || INLINE_PLACEHOLDER) + '" alt="" width="' + INLINE_SIZE + '" height="' + INLINE_SIZE + '" border="0" ' +
      'data-nl="inline-image" data-ez="image" data-ez-fresh="1" ' +
      'style="display:inline-block;vertical-align:middle;width:' + INLINE_SIZE + 'px;height:' + INLINE_SIZE + 'px;border:0;outline:none;margin:0 4px;">';
  }

  function runRte(act) {
    if (!editing) return;
    editing.focus();
    if (act === 'link') {
      var current = linkAtCaret();
      if (current) {
        var range = doc.createRange();
        range.selectNodeContents(current);
        var sel = doc.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        doc.execCommand('unlink', false, null);
      } else {
        var url = window.prompt('Link address', 'https://');
        editing.focus();
        var href = cleanHref(url);
        if (url == null) return;
        if (!href) {
          status('That link address was not saved.');
          return;
        }
        if (doc.getSelection().isCollapsed) doc.execCommand('insertHTML', false, '<a href="' + href.replace(/"/g, '&quot;') + '">' + href.replace(/</g, '&lt;') + '</a>');
        else doc.execCommand('createLink', false, href);
      }
      paintRteState();
      return;
    }
    if (act === 'inline-image') {
      doc.execCommand('insertHTML', false, inlineImageHtml());
      var fresh = editing.querySelector('img[data-ez-fresh]');
      var host = editing;
      endEdit();
      if (!fresh) fresh = host.querySelector('img[data-ez-fresh]');
      if (fresh) {
        fresh.removeAttribute('data-ez-fresh');
        select(fresh);
        pickImageFor(fresh);
      }
      return;
    }
    doc.execCommand('styleWithCSS', false, false);
    doc.execCommand(act, false, null);
    paintRteState();
  }

  // Pin the picture's height and give it the picture's own proportions.
  function fitInline(img) {
    var src = realSrc(img);
    if (!src || typeof Image === 'undefined') return;
    var probe = new Image();
    probe.onload = function () {
      if (!probe.naturalWidth || !probe.naturalHeight || !img.isConnected) return;
      var h = parseInt(img.getAttribute('height'), 10) || INLINE_SIZE;
      var w = Math.max(1, Math.min(600, Math.round(h * probe.naturalWidth / probe.naturalHeight)));
      img.setAttribute('width', String(w));
      setDecl(img, 'width', w + 'px');
      if (selectedEl === img) paintSettings();
      changed();
    };
    probe.src = src;
  }

  function endEdit() {
    if (!editing) return;
    var el = editing;
    editing = null;
    el.removeAttribute('contenteditable');
    el.removeEventListener('blur', onEditBlur);
    // Browsers leave empty tags and a stray <br> behind. Drop them.
    Array.prototype.forEach.call(el.querySelectorAll('b:empty, i:empty, u:empty, s:empty, strike:empty, span:empty, a:empty, font:empty'), function (node) { node.remove(); });
    placeRte();
    changed();
  }

  function onEditBlur() {
    // Clicking the RTE buttons keeps focus, so a blur means the edit is over.
    setTimeout(function () {
      if (editing && doc.activeElement !== editing && !editing.contains(doc.activeElement)) endEdit();
    }, 0);
  }

  function beginEdit(el) {
    if (!el || el.getAttribute('contenteditable') === 'true') return;
    if (editing && editing !== el) endEdit();
    snapshot();
    if (selectedEl !== el) select(el);
    editing = el;
    el.setAttribute('contenteditable', 'true');
    el.focus();
    el.addEventListener('blur', onEditBlur);
    ensureRte();
    placeRte();
  }

  function clearGuides() {
    if (!doc) return;
    doc.querySelectorAll('.ez-drop').forEach(function (node) { node.classList.remove('ez-drop'); });
    var bar = doc.getElementById('ez-insert');
    var label = doc.getElementById('ez-insert-label');
    if (bar) bar.style.display = 'none';
    if (label) label.style.display = 'none';
  }

  function ensureHud() {
    var bar = doc.getElementById('ez-insert');
    if (!bar) {
      bar = doc.createElement('div');
      bar.id = 'ez-insert';
      bar.style.pointerEvents = 'none';
      doc.documentElement.appendChild(bar);
    }
    var label = doc.getElementById('ez-insert-label');
    if (!label) {
      label = doc.createElement('div');
      label.id = 'ez-insert-label';
      doc.documentElement.appendChild(label);
    }
    return { bar: bar, label: label };
  }

  function ensureChrome() {
    var badge = doc.getElementById('ez-badge');
    if (!badge) {
      badge = doc.createElement('div');
      badge.id = 'ez-badge';
      doc.documentElement.appendChild(badge);
      badge.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (selectedEl) selectParent();
      });
    }
    var tools = doc.getElementById('ez-tools');
    if (!tools) {
      tools = doc.createElement('div');
      tools.id = 'ez-tools';
      tools.innerHTML = [
        '<button type="button" data-act="move" title="Move" draggable="true">' + iconSvg('M13 6v5h5V7.75L22.25 12 18 16.25V13h-5v5h3.25L12 22.25 7.75 18H11v-5H6v3.25L1.75 12 6 7.75V11h5V6H7.75L12 1.75 16.25 6H13z') + '</button>',
        '<button type="button" data-act="clone" title="Clone">' + iconSvg('M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1z') + '</button>',
        '<button type="button" data-act="delete" title="Delete">' + iconSvg('M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z') + '</button>',
        '<button type="button" data-act="parent" title="Select parent">' + iconSvg('M14 20h-4v-9l-3.5 3.5L4 12l8-8 8 8-2.5 2.5L14 11v9z') + '</button>'
      ].join('');
      doc.documentElement.appendChild(tools);
      tools.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('button');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        var act = button.getAttribute('data-act');
        if (act === 'clone') cloneSelected();
        else if (act === 'delete') removeSelected();
        else if (act === 'parent') selectParent();
      });
    }
    return { badge: badge, tools: tools };
  }

  function hideChrome() {
    if (!doc) return;
    var badge = doc.getElementById('ez-badge');
    var tools = doc.getElementById('ez-tools');
    if (badge) badge.style.display = 'none';
    if (tools) tools.style.display = 'none';
    placeHoverTag(null);
    hideHandles();
  }

  function placeHoverTag(el) {
    if (!doc) return;
    var tag = doc.getElementById('ez-hovertag');
    if (!el || !el.isConnected) {
      if (tag) tag.style.display = 'none';
      return;
    }
    if (!tag) {
      tag = doc.createElement('div');
      tag.id = 'ez-hovertag';
      doc.documentElement.appendChild(tag);
    }
    var rect = el.getBoundingClientRect();
    tag.textContent = crumbLabel(el) || 'Block';
    tag.style.display = 'block';
    tag.style.left = Math.max(0, Math.round(rect.left)) + 'px';
    var top = Math.round(rect.top) - 15;
    tag.style.top = (top < 0 ? Math.round(rect.top) + 1 : top) + 'px';
  }

  // ---- Direct resizing on the canvas -------------------------------------------
  // Pictures (corner), spacers (bottom edge), horizontal spacers (right edge) and
  // the line between two percent columns. One undo step per drag, a live size
  // readout, snapping, and the same attributes the Settings fields write.
  var resizing = null;

  function handle(kind, index) {
    var id = 'ez-h-' + kind + (index == null ? '' : '-' + index);
    var node = doc.getElementById(id);
    if (!node) {
      node = doc.createElement('div');
      node.id = id;
      node.className = 'ez-handle ez-h-' + (kind.indexOf('col') === 0 ? 'col' : kind);
      node.setAttribute('data-kind', kind);
      if (index != null) node.setAttribute('data-index', String(index));
      node.setAttribute('aria-hidden', 'true');
      node.title = kind === 'img' ? 'Drag to resize (Shift snaps to 10px)' : kind === 'y' ? 'Drag to change the height' : kind === 'x' ? 'Drag to change the width' : 'Drag to change the column widths';
      node.addEventListener('pointerdown', startResize);
      doc.documentElement.appendChild(node);
    }
    return node;
  }

  function hideHandles() {
    if (!doc) return;
    doc.querySelectorAll('.ez-handle').forEach(function (node) {
      if (!resizing || node !== resizing.node) node.style.display = 'none';
    });
  }

  function sizeTag(text, x, y) {
    var tag = doc.getElementById('ez-size');
    if (!tag) {
      tag = doc.createElement('div');
      tag.id = 'ez-size';
      doc.documentElement.appendChild(tag);
    }
    if (!text) { tag.style.display = 'none'; return; }
    tag.textContent = text;
    tag.style.display = 'block';
    var w = doc.documentElement.clientWidth || 600;
    tag.style.left = Math.max(2, Math.min(Math.round(x + 14), w - 120)) + 'px';
    tag.style.top = Math.max(2, Math.round(y + 14)) + 'px';
  }

  function resizableImage(el) {
    return el && el.tagName === 'IMG' && el.getAttribute('data-nl') !== 'icon' && !el.closest('[data-nl="social-element"]');
  }

  function contentWidth(node) {
    if (!node) return 600;
    var cs = doc.defaultView.getComputedStyle(node);
    return Math.max(16, Math.floor(node.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)));
  }

  function sectionRowOf(el) {
    if (!el || !el.closest) return null;
    var table = el.closest('table[data-nl="section"]');
    if (!table || !table.rows || !table.rows.length) return null;
    var row = table.rows[0];
    return percentColumns(row).length > 1 ? row : null;
  }

  function placeHandles() {
    hideHandles();
    if (!doc || previewOn || editing || !selectedEl || !selectedEl.isConnected || picked.length > 1) return;
    var el = selectedEl;
    var rect = el.getBoundingClientRect();
    if (resizableImage(el)) {
      var h = handle('img');
      h.style.display = 'block';
      h.style.left = Math.round(rect.right - 7) + 'px';
      h.style.top = Math.round(rect.bottom - 7) + 'px';
    } else if (el.getAttribute('data-ez') === 'spacer') {
      var y = handle('y');
      y.style.display = 'block';
      y.style.left = Math.round(rect.left + rect.width / 2 - 14) + 'px';
      y.style.top = Math.round(rect.bottom - 4) + 'px';
    } else if (el.getAttribute('data-nl') === 'hspacer') {
      var x = handle('x');
      x.style.display = 'block';
      x.style.left = Math.round(rect.right - 4) + 'px';
      x.style.top = Math.round(rect.top + rect.height / 2 - 14) + 'px';
    }
    var row = (el.tagName === 'TD' || (el.tagName === 'TABLE' && el.getAttribute('data-nl') === 'section')) ? sectionRowOf(el.tagName === 'TD' ? el : el.querySelector('td')) : null;
    if (row && (el.tagName === 'TABLE' || el.parentElement === row)) {
      var cells = Array.prototype.filter.call(row.cells, function (cell) { return cell.getAttribute('data-nl') !== 'hspacer'; });
      for (var i = 0; i < cells.length - 1; i++) {
        if (cells[i].nextElementSibling !== cells[i + 1]) continue;
        var a = cells[i].getBoundingClientRect();
        var c = handle('col', i);
        c.style.display = 'block';
        c.style.left = Math.round(a.right - 4) + 'px';
        c.style.top = Math.round(a.top + 4) + 'px';
        c.style.height = Math.max(16, Math.round(a.height - 8)) + 'px';
      }
    }
  }

  function startResize(event) {
    if (event.button !== 0 || !selectedEl) return;
    event.preventDefault();
    event.stopPropagation();
    var node = event.currentTarget;
    var kind = node.getAttribute('data-kind');
    var el = selectedEl;
    var state = { node: node, kind: kind, el: el, x: event.clientX, y: event.clientY, changed: false };
    if (kind === 'img') {
      var r = el.getBoundingClientRect();
      state.w = Math.round(r.width) || parseInt(el.getAttribute('width'), 10) || 100;
      state.h = Math.round(r.height) || parseInt(el.getAttribute('height'), 10) || state.w;
      state.ratio = (el.naturalWidth && el.naturalHeight) ? el.naturalHeight / el.naturalWidth : state.h / Math.max(1, state.w);
      state.max = Math.min(600, contentWidth(el.parentElement && el.parentElement.tagName === 'A' ? el.parentElement.parentElement : el.parentElement));
      state.inline = el.getAttribute('data-nl') === 'inline-image';
      state.centered = /center/i.test(el.getAttribute('align') || '') || (decl(el, 'margin-left') === 'auto' && decl(el, 'margin-right') === 'auto');
    } else if (kind === 'y') {
      var cell = el.querySelector('td');
      state.h = parseInt(cell && cell.getAttribute('height'), 10) || Math.round(el.getBoundingClientRect().height) || 32;
    } else if (kind === 'x') {
      state.gap = readGap(el);
      state.rowWidth = el.parentElement.getBoundingClientRect().width || 600;
    } else {
      var row = sectionRowOf(el.tagName === 'TD' ? el : el.querySelector('td'));
      var cells = row ? Array.prototype.filter.call(row.cells, function (td) { return td.getAttribute('data-nl') !== 'hspacer'; }) : [];
      var i = parseInt(node.getAttribute('data-index'), 10) || 0;
      if (!cells[i] || !cells[i + 1]) return;
      state.a = cells[i];
      state.b = cells[i + 1];
      state.pa = pctOf(state.a);
      state.pb = pctOf(state.b);
      state.rowWidth = row.getBoundingClientRect().width || 600;
    }
    state.depth = undoStack.length;
    snapshot();
    state.pushed = undoStack.length > state.depth;
    resizing = state;
    node.classList.add('is-active');
    doc.documentElement.classList.add('ez-resizing');
    try { node.setPointerCapture(event.pointerId); } catch (err) {}
    node.addEventListener('pointermove', moveResize);
    node.addEventListener('pointerup', endResize);
    node.addEventListener('pointercancel', endResize);
    placeHoverTag(null);
  }

  function moveResize(event) {
    var st = resizing;
    if (!st) return;
    var dx = event.clientX - st.x;
    var dy = event.clientY - st.y;
    var label = '';
    if (st.kind === 'img') {
      var w = st.w + (st.centered ? dx * 2 : dx);
      if (event.shiftKey) w = Math.round(w / 10) * 10;
      w = Math.max(16, Math.min(st.max, Math.round(w)));
      if (Math.abs(w - st.max) <= 6) w = st.max;
      var h = Math.max(1, Math.round(w * st.ratio));
      st.el.setAttribute('width', String(w));
      setDecl(st.el, 'width', w + 'px');
      if (st.inline) {
        st.el.setAttribute('height', String(h));
        setDecl(st.el, 'height', h + 'px');
      } else {
        st.el.removeAttribute('height');
        setDecl(st.el, 'height', 'auto');
      }
      label = w + ' × ' + h + ' px' + (w === st.max ? '  (full width)' : '');
    } else if (st.kind === 'y') {
      var n = Math.round(st.h + dy);
      if (event.shiftKey) n = Math.round(n / 10) * 10;
      n = Math.max(4, Math.min(400, n));
      applySpacerHeight(st.el, n);
      label = 'Height ' + n + ' px';
    } else if (st.kind === 'x') {
      var g = st.gap;
      var next = g.unit === '%' ? round(g.n + dx / st.rowWidth * 100) : Math.round(g.n + dx);
      if (event.shiftKey) next = g.unit === '%' ? Math.round(next) : Math.round(next / 10) * 10;
      setGap(st.el, { n: next, unit: g.unit, bg: g.bg });
      var now = readGap(st.el);
      label = 'Width ' + now.n + now.unit;
    } else {
      var total = st.pa + st.pb;
      var pa = st.pa + dx / st.rowWidth * 100;
      // Snap to whole percents, and to the common splits (1/4, 1/3, 1/2, 2/3, 3/4).
      pa = Math.round(pa);
      [25, 33.3333, 50, 66.6667, 75].forEach(function (mark) {
        var target = mark * total / 100;
        if (Math.abs(pa - target) < 1.6) pa = round(target);
      });
      var min = Math.max(10, total * 0.1);
      pa = Math.max(min, Math.min(total - min, pa));
      writePct(st.a, pa);
      writePct(st.b, round(total - pa));
      label = Math.round(pa) + '% | ' + Math.round(total - pa) + '%';
    }
    st.changed = true;
    sizeTag(label, event.clientX, event.clientY);
    placeChrome();
  }

  function endResize() {
    var st = resizing;
    if (!st) return;
    resizing = null;
    st.node.classList.remove('is-active');
    st.node.removeEventListener('pointermove', moveResize);
    st.node.removeEventListener('pointerup', endResize);
    st.node.removeEventListener('pointercancel', endResize);
    doc.documentElement.classList.remove('ez-resizing');
    sizeTag('');
    if (!st.changed) {
      // No change: drop the history step this drag added.
      if (st.pushed && undoStack.length) undoStack.pop();
      placeChrome();
      return;
    }
    changed();
    paintSettings();
  }

  function placeChrome() {
    if (!doc || !doc.body) return;
    var hud = ensureChrome();
    var target = selectedEl && selectedEl.isConnected ? selectedEl : doc.body;
    var rect = target.getBoundingClientRect();
    hud.badge.textContent = selectedEl ? (crumbLabel(selectedEl) || 'Block') : 'Body';
    hud.badge.style.display = previewOn ? 'none' : 'block';
    placeHandles();
    hud.badge.style.left = Math.max(0, Math.round(rect.left)) + 'px';
    hud.badge.style.top = Math.max(0, Math.round(rect.top) - 16) + 'px';
    if (!selectedEl || previewOn) {
      hud.tools.style.display = 'none';
      return;
    }
    hud.tools.style.display = 'flex';
    var width = hud.tools.offsetWidth || 112;
    var left = Math.round(rect.left + (rect.width / 2) - (width / 2));
    var limit = Math.max(4, (doc.documentElement.clientWidth || 0) - width - 4);
    hud.tools.style.left = Math.max(4, Math.min(left, limit)) + 'px';
    var top = Math.round(rect.top) - 32;
    if (top < 2) top = Math.round(rect.bottom) + 6;
    hud.tools.style.top = top + 'px';
    placeRte();
  }

  function placeBar(box, axis) {
    var bar = ensureHud().bar;
    bar.style.display = 'block';
    if (axis === 'x') {
      bar.style.width = '6px';
      bar.style.height = Math.max(12, Math.round(box.height || 0)) + 'px';
      bar.style.left = Math.round((box.x || 0) - 3) + 'px';
      bar.style.top = Math.round(box.y || 0) + 'px';
    } else {
      bar.style.width = Math.max(12, Math.round(box.width || 0)) + 'px';
      bar.style.height = '6px';
      bar.style.left = Math.round(box.x || 0) + 'px';
      bar.style.top = Math.round((box.y || 0) - 3) + 'px';
    }
  }

  function placeLabel(text, x, y) {
    var label = ensureHud().label;
    label.textContent = text;
    label.style.display = 'block';
    label.style.left = Math.max(0, Math.round(x || 0)) + 'px';
    label.style.top = Math.max(0, Math.round((y || 0) - 18)) + 'px';
  }

  function guideBox(parent, before, axis) {
    var parentRect = parent.getBoundingClientRect();
    var edge = before && before.nodeType === 1 ? before : null;
    if (edge) {
      var rect = edge.getBoundingClientRect();
      if (axis === 'x') return { x: rect.left, y: parentRect.top, height: parentRect.height || rect.height, width: parentRect.width };
      return { x: parentRect.left, y: rect.top, width: parentRect.width || rect.width, height: parentRect.height };
    }
    var last = null;
    Array.prototype.forEach.call(parent.children || [], function (child) {
      if (child.id === 'ez-insert' || child.id === 'ez-insert-label' || child.id === 'ez-badge' || child.id === 'ez-tools') return;
      if (child.nodeType === 1) last = child;
    });
    if (last) {
      var end = last.getBoundingClientRect();
      if (axis === 'x') return { x: end.right, y: parentRect.top, height: parentRect.height || end.height, width: parentRect.width };
      return { x: parentRect.left, y: end.bottom, width: parentRect.width || end.width, height: parentRect.height };
    }
    if (axis === 'x') return { x: parentRect.left, y: parentRect.top, height: Math.max(parentRect.height, 24), width: parentRect.width };
    return { x: parentRect.left, y: parentRect.top, width: Math.max(parentRect.width, 24), height: parentRect.height };
  }

  function draggingSocial() {
    if (dragPayload === 'ezblock:email-social-element') return true;
    if (dragPayload !== 'ezmove') return false;
    var moving = doc.querySelector('[data-ez-moving]');
    return !!(moving && moving.getAttribute('data-nl') === 'social-element');
  }

  function showGapGuide(hit, point) {
    var cell = columnCell(hitTarget(hit) || hit);
    clearGuides();
    if (!cell) {
      placeLabel('Beside a column', point.x, point.y);
      return;
    }
    cell.classList.add('ez-drop');
    var rect = cell.getBoundingClientRect();
    var left = leftHalf(cell, point);
    placeBar({ x: left ? rect.left : rect.right, y: rect.top, height: rect.height }, 'x');
    placeLabel(left ? 'Before column' : 'After column', left ? rect.left : rect.right, rect.top);
  }

  function showSocialGuide(hit, point) {
    var row = socialRowFrom(hit) || socialRowFrom(hitTarget(hit) || null);
    clearGuides();
    if (!row) {
      placeLabel('Only inside Group Social', point.x, point.y);
      return;
    }
    row.classList.add('ez-drop');
    var rect = row.getBoundingClientRect();
    placeBar({ x: rect.right, y: rect.top, height: rect.height }, 'x');
    placeLabel('Add icon', rect.right, rect.top);
  }

  function showSpotGuide(hit, point) {
    var target = hitTarget(hit) || hit;
    var moving = doc.querySelector('[data-ez-moving]');
    if (moving && target && (target === moving || (moving.contains && moving.contains(target)))) target = moving;
    var spot = destination(target, point);
    clearGuides();
    if (!spot.parent) return;
    if (spot.parent.classList) spot.parent.classList.add('ez-drop');
    var axis = spot.parent.tagName === 'TR' ? 'x' : 'y';
    var box = guideBox(spot.parent, spot.before, axis);
    placeBar(box, axis);
    var before = spot.before && spot.before.nodeType === 1 ? spot.before : null;
    var where = before ? 'Before ' + (crumbLabel(before) || 'block') : (spot.parent === doc.body ? 'End of email' : 'Into ' + (crumbLabel(spot.parent) || 'block'));
    placeLabel(where, box.x, box.y);
  }

  function showGuide(raw, point) {
    if (!doc || !point) return;
    if (!dragPayload) {
      clearGuides();
      return;
    }
    hideChrome();
    var hit = raw && raw.nodeType === 1 ? raw : doc.body;
    if (isHud(hit)) hit = doc.body;
    if (dragPayload === 'ezblock:email-hspacer') {
      showGapGuide(hit, point);
      return;
    }
    if (draggingSocial()) {
      showSocialGuide(hit, point);
      return;
    }
    showSpotGuide(hit, point);
  }

  function pointFrom(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function elementInFrame(event) {
    return doc.elementFromPoint(event.clientX, event.clientY);
  }

  function elementFromParent(event) {
    var rect = frame.getBoundingClientRect();
    return doc.elementFromPoint(event.clientX - rect.left, event.clientY - rect.top);
  }

  function onDrop(data, el, point) {
    var payload = data || dragPayload;
    clearGuides();
    dragPayload = '';
    if (payload.indexOf('ezblock:') === 0) {
      add(payload.slice(8), hitTarget(el) || el, point);
      return;
    }
    if (payload !== 'ezmove') return;
    var moving = doc.querySelector('[data-ez-moving]');
    if (!moving) return;
    moving.removeAttribute('data-ez-moving');
    if (moving.getAttribute('data-nl') === 'social-element') {
      var row = socialRowFrom(el);
      if (!row || row === moving.parentElement && !point) return;
      if (!row) {
        status('A social icon only drops into a Group Social row.');
        return;
      }
      snapshot();
      row.appendChild(moving);
      spaceSocial(socialTableOf(moving));
      select(moving);
      changed();
      return;
    }
    var spot = destination(hitTarget(el) || el, point);
    if (!spot.parent || spot.parent === moving || (moving.contains && moving.contains(spot.parent))) return;
    snapshot();
    takePlaceholder(spot.parent, moving);
    if (spot.before && spot.before !== moving && spot.before.parentNode === spot.parent) spot.parent.insertBefore(moving, spot.before);
    else spot.parent.appendChild(moving);
    select(moving);
    changed();
  }

  // A column cell moves with its table. A social icon moves inside its row.
  // A horizontal spacer stays in its row. Words inside a text move with the text.
  function movable(el) {
    if (!el || el === doc.body) return null;
    if (el.getAttribute('data-nl') === 'social-element') return el;
    if (el.getAttribute('data-nl') === 'hspacer') return null;
    if (el.tagName === 'TD' || el.tagName === 'TH' || el.tagName === 'TR' || el.tagName === 'TBODY') return el.closest('table');
    return el;
  }

  function bindCanvas() {
    // A link in the email must never open inside the canvas. Doing so would
    // replace the email page in the frame (so it is blocked).
    function stopLink(event) {
      var node = event.target;
      if (node && node.nodeType === 3) node = node.parentElement;
      if (node && node.closest && node.closest('a[href], area[href], form, button[type="submit"], input[type="submit"]')) event.preventDefault();
    }
    doc.addEventListener('click', stopLink, true);
    doc.addEventListener('auxclick', stopLink, true);
    doc.addEventListener('submit', function (event) { event.preventDefault(); }, true);
    doc.addEventListener('click', function (event) {
      if (previewOn) return;
      if (isHud(event.target)) return;
      if (event.target.closest && event.target.closest('[contenteditable="true"]')) return;
      var target = hitTarget(event.target);
      if (event.shiftKey && selectedEl && target && selectedEl.parentElement === target.parentElement) {
        var kids = Array.prototype.filter.call(selectedEl.parentElement.children, function (node) { return node.nodeType === 1; });
        var a = kids.indexOf(selectedEl);
        var b = kids.indexOf(target);
        if (a !== -1 && b !== -1) {
          var range = kids.slice(Math.min(a, b), Math.max(a, b) + 1);
          select(target, range);
          return;
        }
      }
      if (event.ctrlKey || event.metaKey) {
        togglePick(target);
        return;
      }
      select(target);
    }, true);
    doc.addEventListener('dblclick', function (event) {
      if (previewOn) return;
      var node = event.target;
      if (!node || isHud(node)) return;
      if (node.nodeType === 3) node = node.parentElement;
      if (node.tagName === 'IMG') {
        // A double-click on a picture opens the image library.
        if (node.closest('[data-nl="social-element"]')) return;
        pickImageFor(node);
        return;
      }
      var button = node.closest && node.closest('table');
      if (button && isButtonTable(button)) {
        var link = buttonAnchor(allCells(button)[0]);
        if (link) beginEdit(link);
        return;
      }
      var text = textBoxOf(node) || (node.closest && node.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div[data-ez="text"]'));
      if (text) beginEdit(text);
    });
    var hovered = null;
    doc.addEventListener('mouseover', function (event) {
      if (isHud(event.target) || resizing) return;
      var el = hitTarget(event.target);
      if (el === hovered) return;
      if (hovered && picked.indexOf(hovered) === -1) hovered.classList.remove('ez-hover');
      doc.querySelectorAll('.ez-hover').forEach(function (node) {
        if (picked.indexOf(node) === -1) node.classList.remove('ez-hover');
      });
      hovered = el;
      if (el && picked.indexOf(el) === -1) el.classList.add('ez-hover');
      placeHoverTag(el && picked.indexOf(el) === -1 && !previewOn && !dragPayload ? el : null);
    });
    doc.addEventListener('mouseleave', function () {
      if (hovered && picked.indexOf(hovered) === -1) hovered.classList.remove('ez-hover');
      hovered = null;
      placeHoverTag(null);
    });
    doc.addEventListener('dragstart', function (event) {
      if (isHud(event.target)) {
        var act = event.target.closest && event.target.closest('[data-act]');
        if (!selectedEl || !act || act.getAttribute('data-act') !== 'move') {
          event.preventDefault();
          return;
        }
        var mover = movable(selectedEl);
        if (!mover) {
          event.preventDefault();
          return;
        }
        mover.setAttribute('data-ez-moving', '1');
        dragPayload = 'ezmove';
        try {
          event.dataTransfer.setData('text/plain', 'ezmove');
          event.dataTransfer.effectAllowed = 'move';
        } catch (err) {}
        return;
      }
      var el = selectedEl && (event.target === selectedEl || selectedEl.contains(event.target)) ? selectedEl : hitTarget(event.target);
      el = movable(el);
      if (!el || el.getAttribute('data-nl') === 'inline-image') {
        event.preventDefault();
        return;
      }
      el.setAttribute('data-ez-moving', '1');
      dragPayload = 'ezmove';
      try {
        event.dataTransfer.setData('text/plain', 'ezmove');
        event.dataTransfer.effectAllowed = 'move';
      } catch (err) {}
    });
    doc.addEventListener('dragend', function () {
      dragPayload = '';
      var moving = doc.querySelector('[data-ez-moving]');
      if (moving) moving.removeAttribute('data-ez-moving');
      clearGuides();
      placeChrome();
    });
    doc.addEventListener('dragover', function (event) {
      event.preventDefault();
      if (previewOn) return;
      showGuide(elementInFrame(event), pointFrom(event));
    });
    doc.addEventListener('drop', function (event) {
      event.preventDefault();
      if (previewOn) return;
      onDrop(event.dataTransfer.getData('text/plain') || '', elementInFrame(event), pointFrom(event));
    });
    doc.addEventListener('keydown', onKey);
    doc.defaultView.addEventListener('scroll', placeChrome, true);
    doc.defaultView.addEventListener('resize', placeChrome);
  }

  function onKey(event) {
    var target = event.target;
    if (previewOn) {
      if (event.key === 'Escape') { event.preventDefault(); setPreview(false); }
      return;
    }
    if (event.key === 'Escape') {
      if (editing) {
        event.preventDefault();
        var was = editing;
        endEdit();
        select(was);
        return;
      }
      if (!document.getElementById('ez-modal').hidden) {
        editor.Modal.close();
        return;
      }
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (picked.length) select(null);
      return;
    }
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    var key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault();
      redo();
    } else if ((event.ctrlKey || event.metaKey) && key === 'c') {
      if (!picked.length) return;
      var textSel = (window.getSelection && String(window.getSelection())) || '';
      if (textSel && !(event.target && event.target.ownerDocument === doc)) return;
      event.preventDefault();
      copySelected();
    } else if ((event.ctrlKey || event.metaKey) && key === 'v') {
      if (!clipboard.length) return;
      event.preventDefault();
      pasteCopied();
    } else if ((event.ctrlKey || event.metaKey) && key === 'd') {
      // Duplicate, as in design tools.
      if (!selectedEl) return;
      event.preventDefault();
      cloneSelected();
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && selectedEl) {
      event.preventDefault();
      nudge(selectedEl, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!picked.length) return;
      event.preventDefault();
      removeSelected();
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[wsad]$/.test(key) && picked.length) {
      // Keys: w previous, s next, a parent, d first child.
      event.preventDefault();
      stepSelection(key);
    }
  }

  var clipboard = [];

  // Quick insert: into the selected column, or right after the selected block
  // (climbing out of buttons, icon boxes and other blocks), or at the end.
  function addAfterSelection(id) {
    var el = selectedEl;
    if (!el || !el.isConnected || el === doc.body) {
      var last = null;
      Array.prototype.forEach.call(doc.body.children, function (kid) { if (!isHud(kid)) last = kid; });
      if (!last) return add(id, null, null);
      el = last;
    }
    if (id === 'email-hspacer' || id === 'email-social-element') return add(id, el, null);
    var isCell = function (node) { return node && (node.tagName === 'TD' || node.tagName === 'TH') && (node.getAttribute('data-ez') === 'cell' || (node.closest('table[data-nl="section"]') && node.parentElement && node.closest('table[data-nl="section"]').rows[0] === node.parentElement)); };
    if (isCell(el) && !sealedCell(el)) return add(id, el, null);
    var node = el;
    while (node.parentElement && node.parentElement !== doc.body && !isCell(node.parentElement)) node = node.parentElement;
    forcedSpot = { parent: node.parentElement || doc.body, before: node.nextSibling };
    try { return add(id, node, null); } finally { forcedSpot = null; }
  }
  var forcedSpot = null;

  // Alt+Up / Alt+Down: move the block one place among its siblings.
  function nudge(el, dir) {
    var target = movable(el);
    if (!target || target === doc.body || !target.parentElement) return;
    var sib = dir < 0 ? target.previousElementSibling : target.nextElementSibling;
    while (sib && isHud(sib)) sib = dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
    if (!sib || (target.tagName === 'TD') !== (sib.tagName === 'TD')) {
      status(dir < 0 ? 'Already at the top.' : 'Already at the bottom.');
      return;
    }
    if (sib.getAttribute('data-nl') === 'hspacer' || target.getAttribute('data-nl') === 'hspacer') return;
    snapshot();
    if (dir < 0) target.parentElement.insertBefore(target, sib);
    else target.parentElement.insertBefore(sib, target);
    if (target.getAttribute('data-nl') === 'social-element') spaceSocial(socialTableOf(target));
    select(el);
    changed();
  }

  function copySelected() {
    clipboard = outermost(picked.filter(Boolean)).map(function (el) {
      return cleanHtml(el.outerHTML);
    });
    status(clipboard.length === 1 ? 'Copied. Press Ctrl+V to paste it after the selection.' : 'Copied ' + clipboard.length + ' blocks.');
  }

  function pasteCopied() {
    var anchor = selectedEl;
    var nodes = [];
    clipboard.forEach(function (html) { nodes = nodes.concat(nodesFrom(html)); });
    if (!nodes.length) return;
    var cellCopy = nodes[0].tagName === 'TD' || nodes[0].tagName === 'TH';
    if (cellCopy) {
      // A column or a social icon pastes into a row.
      if (!anchor || (anchor.tagName !== 'TD' && anchor.tagName !== 'TH')) {
        status('Select a column or icon to paste beside it.');
        return;
      }
      if (nodes[0].getAttribute('data-nl') === 'social-element' && anchor.getAttribute('data-nl') !== 'social-element') {
        status('A social icon only pastes into a Group Social row.');
        return;
      }
    }
    snapshot();
    var parent = anchor && anchor.parentElement ? anchor.parentElement : doc.body;
    var before = anchor ? anchor.nextSibling : null;
    if (anchor && !cellCopy && (anchor.tagName === 'TD' || anchor.tagName === 'TH')) {
      parent = anchor;
      before = null;
    }
    nodes.forEach(function (node) {
      if (before && before.parentNode === parent) parent.insertBefore(node, before);
      else parent.appendChild(node);
    });
    var social = socialTableOf(nodes[0]);
    if (social) spaceSocial(social);
    markTree(doc.body);
    select(nodes[nodes.length - 1]);
    changed();
  }

  function selectableKids(el) {
    return layerNodes(el).filter(function (node) { return node.tagName !== 'TR' || true; });
  }

  function stepSelection(key) {
    var el = selectedEl;
    if (!el) return;
    if (key === 'a') return selectParent();
    if (key === 'd') {
      var kids = selectableKids(el);
      if (kids.length) select(kids[0]);
      return;
    }
    var holder = el.parentElement;
    while (holder && /^(TBODY|THEAD|TFOOT)$/.test(holder.tagName)) holder = holder.parentElement;
    var siblings = holder ? selectableKids(holder) : [];
    var index = siblings.indexOf(el);
    if (index === -1) return;
    var next = siblings[index + (key === 's' ? 1 : -1)];
    if (next) select(next);
  }

  function readMine() {
    try {
      var list = JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      return list.filter(function (block) { return block && block.id && block.label && typeof block.html === 'string'; });
    } catch (err) { return []; }
  }

  function outermost(nodes) {
    return nodes.filter(function (node) {
      return !nodes.some(function (other) { return other !== node && other.contains(node); });
    });
  }

  function saveBlock(name) {
    var label = String(name || '').trim();
    if (!label) return null;
    var nodes = outermost(picked.filter(Boolean));
    var html = nodes.length ? nodes.map(function (el) { return cleanHtml(el.outerHTML); }).join('') : cleanHtml(doc.body.innerHTML);
    if (!String(html || '').trim()) {
      status('Nothing to save.');
      return null;
    }
    var block = { id: 'b' + Date.now(), label: label, html: html };
    var list = readMine().filter(function (item) { return item.label !== label; });
    list.unshift(block);
    try { localStorage.setItem(MINE_KEY, JSON.stringify(list)); } catch (err) { return null; }
    paintPalette();
    status('Saved ' + label + '.');
    return block;
  }

  var BLOCK_PATH = {
    sect100: 'M2 20h20V4H2v16Zm-1 0V4a1 1 0 0 1 1-1h20a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1Z',
    sect50: 'M2 20h8V4H2v16Zm-1 0V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1ZM13 20h8V4h-8v16Zm-1 0V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1Z',
    sect30: 'M2 20h4V4H2v16Zm-1 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1ZM17 20h4V4h-4v16Zm-1 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1ZM9.5 20h4V4h-4v16Zm-1 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1Z',
    sect37: 'M2 20h5V4H2v16Zm-1 0V4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1ZM10 20h12V4H10v16Zm-1 0V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1Z',
    button: 'M20 20.5C20 21.3 19.3 22 18.5 22H13C12.6 22 12.3 21.9 12 21.6L8 17.4L8.7 16.6C8.9 16.4 9.2 16.3 9.5 16.3H9.7L12 18V9C12 8.4 12.4 8 13 8S14 8.4 14 9V13.5L15.2 13.6L19.1 15.8C19.6 16 20 16.6 20 17.1V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.1 2.9 14 4 14H8V12H4V4H20V12H18V14H20C21.1 14 22 13.1 22 12V4C22 2.9 21.1 2 20 2Z',
    divider: 'M21 18H2V20H21V18M19 10V14H4V10H19M20 8H3C2.45 8 2 8.45 2 9V15C2 15.55 2.45 16 3 16H20C20.55 16 21 15.55 21 15V9C21 8.45 20.55 8 20 8M21 4H2V6H21V4Z',
    text: 'M18.5 4L19.66 8.35L18.7 8.61C18.25 7.74 17.79 6.87 17.26 6.43C16.73 6 16.11 6 15.5 6H13V16.5C13 17 13 17.5 13.33 17.75C13.67 18 14.33 18 15 18V19H9V18C9.67 18 10.33 18 10.67 17.75C11 17.5 11 17 11 16.5V6H8.5C7.89 6 7.27 6 6.74 6.43C6.21 6.87 5.75 7.74 5.3 8.61L4.34 8.35L5.5 4H18.5Z',
    image: 'M21 3H3C2 3 1 4 1 5V19A2 2 0 0 0 3 21H21C22 21 23 20 23 19V5C23 4 22 3 21 3M5 17L8.5 12.5L11 15.5L14.5 11L19 17H5Z',
    link: 'M3.9 12C3.9 10.29 5.29 8.9 7 8.9H11V7H7A5 5 0 0 0 2 12A5 5 0 0 0 7 17H11V15.1H7C5.29 15.1 3.9 13.71 3.9 12M8 13H16V11H8V13M17 7H13V8.9H17C18.71 8.9 20.1 10.29 20.1 12C20.1 13.71 18.71 15.1 17 15.1H13V17H17A5 5 0 0 0 22 12A5 5 0 0 0 17 7Z',
    'text-sect': 'M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2M4 6v12h16V6H4M6 9h12v2H6V9M6 13h10v2H6v-2z',
    quote: 'M14 17h3l2-4V7h-6v6h3M6 17h3l2-4V7H5v6h3L6 17z',
    'link-block': 'M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2m2 3h8v2H5V8m0 4h5v2H5v-2z',
    'grid-items': 'M3 11h8V3H3v8m0 10h8v-8H3v8m10 0h8v-8h-8v8M13 3v8h8V3h-8z',
    'list-items': 'M2 14h6v6H2v-6m14-6h-6v2h6V8M2 10h6V4H2v6m8-6v2h12V4H10m0 16h6v-2h-6v2m0-4h12v-2H10v2z'
  };
  var BLOCK_BADGE = {
    'email-preview': 'Pre', 'email-browser': 'Web', 'email-logo': 'Logo', 'email-menu': 'Menu',
    'email-hero': 'Hero', 'email-image-text': 'Img+', 'email-text-image': '+Txt', 'email-icon-text': 'Ico+',
    'email-cta': 'CTA', 'email-product': 'Item', 'email-products': 'Pair', 'email-coupon': 'Code',
    'email-social': 'Soc', 'email-social-group': 'Grp', 'email-social-element': 'Ico', 'email-footer': 'Foot',
    'email-spacer': 'Gap', 'email-callout': 'Note', 'email-stats': '123', 'email-event': 'Date',
    'email-author': 'By', 'email-video': 'Play', 'email-testimonial': 'Quote'
  };

  function blockMedia(id) {
    if (id === 'email-hspacer') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7v10M18 7v10M8 12h8M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    }
    if (BLOCK_PATH[id]) return iconSvg(BLOCK_PATH[id], id === 'sect50' || id === 'sect30' ? '0 0 23 24' : '0 0 24 24');
    if (String(id).indexOf('mine:') === 0) return iconSvg('M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z');
    var badge = BLOCK_BADGE[id] || 'Blk';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15.5" text-anchor="middle" font-size="7" font-family="Arial,sans-serif" fill="currentColor">' + badge + '</text></svg>';
  }

  function paintPalette() {
    var root = document.getElementById('ez-panel-blocks');
    if (!root) return;
    root.innerHTML = '';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'nl-field ez-block-search';
    search.placeholder = 'Search blocks';
    search.value = blockQuery;
    search.setAttribute('aria-label', 'Search blocks');
    root.appendChild(search);
    var groups = {};
    window.EzBlocks.list().forEach(function (block) {
      (groups[block.group] || (groups[block.group] = [])).push(block);
    });
    var mine = readMine();
    if (mine.length) groups['My blocks'] = mine.map(function (block) { return { id: 'mine:' + block.id, label: block.label, group: 'My blocks' }; });
    Object.keys(groups).forEach(function (name) {
      var cat = document.createElement('div');
      cat.className = 'ez-category';
      var open = categoryOpen[name] !== false;
      var title = document.createElement('button');
      title.type = 'button';
      title.className = 'ez-category-title';
      title.innerHTML = caretSvg(open);
      var label = document.createElement('span');
      label.textContent = name;
      title.appendChild(label);
      if (name === 'My blocks') title.id = 'ez-mine-title';
      var grid = document.createElement('div');
      grid.className = 'ez-blocks-grid';
      grid.hidden = !open;
      title.addEventListener('click', function () {
        grid.hidden = !grid.hidden;
        categoryOpen[name] = !grid.hidden;
        var mark = title.querySelector('svg');
        if (mark) mark.classList.toggle('is-shut', grid.hidden);
      });
      groups[name].forEach(function (block) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'ez-block' + (name === 'My blocks' ? ' ez-block-mine' : '');
        button.innerHTML = blockMedia(block.id);
        var caption = document.createElement('span');
        caption.className = 'ez-block-label';
        caption.textContent = block.label;
        button.appendChild(caption);
        button.title = block.label;
        button.setAttribute('data-block', block.id);
        button.draggable = true;
        var moved = false;
        button.addEventListener('dragstart', function (event) {
          moved = true;
          dragPayload = 'ezblock:' + block.id;
          try {
            event.dataTransfer.setData('text/plain', dragPayload);
            event.dataTransfer.effectAllowed = 'copy';
          } catch (err) {}
        });
        button.addEventListener('dragend', function () {
          dragPayload = '';
          clearGuides();
          placeChrome();
          setTimeout(function () { moved = false; }, 0);
        });
        button.addEventListener('click', function () {
          if (moved) return;
          add(block.id);
        });
        grid.appendChild(button);
      });
      cat.appendChild(title);
      cat.appendChild(grid);
      root.appendChild(cat);
    });
    function applyFilter() {
      var query = blockQuery.trim().toLowerCase();
      root.querySelectorAll('.ez-category').forEach(function (cat) {
        var shown = 0;
        cat.querySelectorAll('.ez-block').forEach(function (button) {
          var ok = !query || (button.textContent || '').toLowerCase().indexOf(query) !== -1;
          button.hidden = !ok;
          if (ok) shown += 1;
        });
        cat.hidden = shown === 0;
      });
    }
    search.addEventListener('input', function () {
      blockQuery = search.value;
      applyFilter();
    });
    applyFilter();
  }

  // Preview (the eye): the panels and block tools go away, nothing
  // can be picked or edited, and a single button (or Escape) brings them back.
  function setPreview(on) {
    on = !!on;
    if (on === previewOn) return;
    if (on) {
      if (editing) endEdit();
      select(null);
      clearGuides();
    }
    previewOn = on;
    var button = document.getElementById('ez-preview');
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    document.getElementById('ez-editor').classList.toggle('is-preview', on);
    var off = document.getElementById('ez-preview-off');
    if (off) off.hidden = !on;
    if (doc) {
      doc.documentElement.classList.toggle('ez-preview', on);
      if (doc.body) doc.body.classList.remove('ez-selected');
      if (!on && doc.body && !selectedEl) doc.body.classList.add('ez-selected');
    }
    if (on && off) off.focus();
    placeChrome();
  }

  function toggleFullscreen() {
    var root = document.documentElement;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (root.requestFullscreen) root.requestFullscreen();
    } catch (err) {}
  }

  // Images off (the newsletter toggle): pictures show as broken so
  // the alt text is visible. The real address is kept in data-ez-src and put back
  // in every save, undo step, and export, so nothing is lost.
  var IMG_OFF = '##';
  var imagesOff = false;
  var imageWatch = null;

  function hideImage(img) {
    if (!img || img.tagName !== 'IMG' || img.closest('#ez-rte, #ez-tools, #ez-badge')) return;
    var src = img.getAttribute('src');
    if (src === IMG_OFF) return;
    img.setAttribute('data-ez-src', src == null ? '' : src);
    img.setAttribute('src', IMG_OFF);
  }

  function showImage(img) {
    if (!img.hasAttribute('data-ez-src')) return;
    var real = img.getAttribute('data-ez-src');
    img.removeAttribute('data-ez-src');
    if (real) img.setAttribute('src', real);
    else img.removeAttribute('src');
  }

  function setImagesOff(on) {
    imagesOff = !!on;
    var button = document.getElementById('ez-images');
    if (button) {
      button.classList.toggle('is-on', imagesOff);
      button.setAttribute('aria-pressed', imagesOff ? 'true' : 'false');
    }
    if (!doc) return;
    if (imageWatch) {
      imageWatch.disconnect();
      imageWatch = null;
    }
    Array.prototype.forEach.call(doc.body.querySelectorAll('img'), imagesOff ? hideImage : showImage);
    if (!imagesOff) return;
    imageWatch = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes' && record.target.tagName === 'IMG') {
          var img = record.target;
          var src = img.getAttribute('src');
          // A new address written while images are off becomes the real one.
          if (src !== IMG_OFF) {
            img.removeAttribute('data-ez-src');
            hideImage(img);
          }
        } else if (record.type === 'childList') {
          Array.prototype.forEach.call(record.addedNodes, function (node) {
            if (node.nodeType !== 1) return;
            if (node.tagName === 'IMG') hideImage(node);
            Array.prototype.forEach.call(node.querySelectorAll ? node.querySelectorAll('img') : [], hideImage);
          });
        }
      });
    });
    imageWatch.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  }

  function setDevice(name) {
    device = name || 'Desktop';
    var fixed = device === 'Mobile landscape' ? '480px' : device === 'Mobile portrait' ? '375px' : '';
    frame.classList.toggle('is-fixed', !!fixed);
    if (fixed) frame.style.setProperty('--ez-device', fixed);
    document.querySelectorAll('#ez-devices button').forEach(function (button) {
      button.classList.toggle('is-on', button.getAttribute('data-device') === device);
    });
  }

  // The editor drops whitespace-only text at the start or end of an element and any
  // that holds a line break. Pasted mail had it between cells and images, where
  // old Outlook can show it as a gap. A single space between words stays.
  function dropLayoutSpace(root) {
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var drop = [];
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue || '';
      // Only layout space counts. A no-break space is content: it keeps a thin
      // color cell or spacer open in Outlook.
      if (value === ' ' || /[^ \t\n\r\f]/.test(value)) continue;
      var parent = node.parentNode;
      if (parent && /^(PRE|TEXTAREA)$/.test(parent.nodeName)) continue;
      var edge = !node.previousSibling || !node.nextSibling;
      if (edge || value.indexOf('\n') !== -1) drop.push(node);
    }
    drop.forEach(function (item) { item.remove(); });
  }

  function onlyBlank(cell) {
    if (!cell || cell.children.length) return false;
    return !(cell.textContent || '').replace(/\u00a0/g, ' ').trim();
  }

  // Marks the parts this editor gives their own settings, for blocks pasted from
  // the original EzBuilder or another tool: sections, columns, spacers, dividers.
  function markTree(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('table[data-nl="section"]'), function (table) {
      if (!table.getAttribute('data-ez')) table.setAttribute('data-ez', 'section');
      firstRowCells(table).forEach(function (cell) {
        if (cell.getAttribute('data-nl') === 'hspacer') {
          if (!cell.getAttribute('data-ez')) cell.setAttribute('data-ez', 'hspacer');
          return;
        }
        if (!cell.getAttribute('data-ez')) cell.setAttribute('data-ez', 'cell');
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('table:not([data-ez]):not([data-nl])'), function (table) {
      var cells = allCells(table);
      if (cells.length !== 1 || table.rows.length !== 1) return;
      var cell = cells[0];
      if (cell.getAttribute('data-nl') || !onlyBlank(cell)) return;
      var height = parseFloat(decl(cell, 'height') || cell.getAttribute('height') || table.rows[0].getAttribute('height') || '') || 0;
      var fill = decl(cell, 'background-color') || cell.getAttribute('bgcolor') || '';
      if (/\bdivider\b/.test(cell.className || '') || (decl(cell, 'border-top') && height <= 4) || (fill && height > 0 && height <= 4)) {
        table.setAttribute('data-ez', 'divider');
        return;
      }
      if (height > 0 && !fill) table.setAttribute('data-ez', 'spacer');
    });
  }

  function loadHtml(html, css) {
    snapshot();
    extraCss = css || '';
    doc.body.innerHTML = html || '';
    dropLayoutSpace(doc.body);
    markTree(doc.body);
    applyExtraCss();
    settleDrops();
    Array.prototype.forEach.call(doc.querySelectorAll('[data-nl="social-icons"]'), spaceSocial);
    select(null);
    changed();
  }

  function clearCanvas() {
    snapshot();
    doc.body.innerHTML = '';
    extraCss = '';
    applyExtraCss();
    select(null);
    changed();
  }

  function specificity(selector) {
    var clean = selector.replace(/\([^)]*\)/g, '');
    var ids = (clean.match(/#[\w-]+/g) || []).length;
    var classes = (clean.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
    var types = (clean.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return ids * 10000 + classes * 100 + types;
  }

  // Semicolons inside quotes or brackets (content:"a;b", data URLs) are kept.
  function splitRaw(text) {
    var parts = [];
    var buf = '';
    var quote = '';
    var depth = 0;
    String(text || '').split('').forEach(function (ch) {
      if (quote) { if (ch === quote) quote = ''; buf += ch; return; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && !depth) { parts.push(buf); buf = ''; return; }
      buf += ch;
    });
    parts.push(buf);
    return parts;
  }

  function splitDecls(text) {
    // Split on semicolons outside quotes and brackets.
    var parts = [];
    var buf = '';
    var quote = '';
    var depth = 0;
    String(text || '').split('').forEach(function (ch) {
      if (quote) { if (ch === quote) quote = ''; buf += ch; return; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && !depth) { parts.push(buf); buf = ''; return; }
      buf += ch;
    });
    parts.push(buf);
    return parts.map(function (part) { return part.trim(); }).filter(Boolean).map(function (part) {
      var index = part.indexOf(':');
      if (index === -1) return null;
      var value = part.slice(index + 1).trim();
      var important = /!important\s*$/i.test(value);
      return { name: part.slice(0, index).trim().toLowerCase(), value: value.replace(/\s*!important\s*$/i, ''), important: important };
    }).filter(function (item) { return item && item.name && item.value; });
  }

  // A pasted style block is inlined on export: plain rules are written onto
  // the elements they match, and media queries stay in a style tag, so Gmail
  // and Outlook keep the pasted design.
  // Top level rules of a style block, read from the text itself so colors and
  // values stay exactly as written (the browser would turn #e11d48 into rgb()).
  function cssBlocks(css) {
    var text = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
    var out = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var open = -1;
      var quote = '';
      var j = i;
      for (; j < n; j++) {
        var ch = text[j];
        if (quote) { if (ch === quote && text[j - 1] !== '\\') quote = ''; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === ';' && open === -1 && /^\s*@/.test(text.slice(i, j))) { out.push({ at: true, text: text.slice(i, j + 1).trim() }); i = j + 1; j = -2; break; }
        if (ch === '{') { open = j; break; }
      }
      if (j === -2) continue;
      if (open === -1) break;
      var depth = 0;
      var k = open;
      quote = '';
      for (; k < n; k++) {
        var c = text[k];
        if (quote) { if (c === quote && text[k - 1] !== '\\') quote = ''; continue; }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === '{') depth += 1;
        else if (c === '}') { depth -= 1; if (!depth) break; }
      }
      var prelude = text.slice(i, open).trim();
      var body = text.slice(open + 1, k);
      if (prelude) out.push(prelude.charAt(0) === '@' ? { at: true, text: prelude + ' {' + body + '}' } : { selector: prelude, body: body.trim() });
      i = k + 1;
    }
    return out;
  }

  // A pasted style block is inlined on export: plain rules are written onto
  // the elements they match, and media queries stay in a style tag, so Gmail
  // and Outlook keep the pasted design.
  function inlineCss(html, css) {
    if (!css || !String(css).trim()) return { html: html, css: '' };
    var scratch = document.implementation.createHTMLDocument('');
    var tpl = scratch.createElement('template');
    tpl.innerHTML = html;
    var root = tpl.content;
    var kept = [];
    var rules = [];
    var order = 0;
    cssBlocks(css).forEach(function (rule) {
      if (rule.at) {
        kept.push(rule.text);
        return;
      }
      var leftover = [];
      rule.selector.split(/,(?![^(]*\))/).forEach(function (raw) {
        var selector = raw.trim();
        // Hover, pseudo elements, and the page itself cannot live on an element.
        if (!selector || /::?[a-z-]+/i.test(selector.replace(/:(first-child|last-child|nth-child\([^)]*\)|nth-of-type\([^)]*\)|first-of-type|last-of-type|not\([^)]*\))/gi, '')) || /(^|[\s>+~,])(html|body|head)\b/i.test(selector) || selector === '*') {
          leftover.push(selector);
          return;
        }
        var matched;
        try { matched = root.querySelectorAll(selector); } catch (err) {
          leftover.push(selector);
          return;
        }
        rules.push({ selector: selector, spec: specificity(selector), order: order++, decls: splitDecls(rule.body), nodes: matched });
      });
      if (leftover.length) kept.push(leftover.join(', ') + ' { ' + rule.body + ' }');
    });
    rules.sort(function (a, b) { return a.spec - b.spec || a.order - b.order; });
    var computed = new Map();
    rules.forEach(function (rule) {
      Array.prototype.forEach.call(rule.nodes, function (el) {
        var entry = computed.get(el);
        if (!entry) {
          entry = { map: {}, order: [], strong: {} };
          computed.set(el, entry);
        }
        rule.decls.forEach(function (item) {
          if (entry.strong[item.name] && !item.important) return;
          if (!(item.name in entry.map)) entry.order.push(item.name);
          entry.map[item.name] = item.value;
          if (item.important) entry.strong[item.name] = true;
        });
      });
    });
    computed.forEach(function (entry, el) {
      var own = readStyle(el.getAttribute('style'));
      own.order.forEach(function (name) {
        if (entry.strong[name]) return;
        if (!(name in entry.map)) entry.order.push(name);
        entry.map[name] = own.map[name];
      });
      var text = entry.order.filter(function (name) { return entry.map[name]; }).map(function (name) { return name + ':' + entry.map[name]; }).join(';');
      if (text) el.setAttribute('style', text);
    });
    return { html: tpl.innerHTML, css: kept.join('\n') };
  }

  var editor = {
    getHtml: function () {
      var inlined = inlineCss(cleanHtml(doc.body.innerHTML), extraCss);
      var css = inlined.css ? '<style>' + escapeStyle(inlined.css) + '</style>' : '';
      var parts = [];
      Object.keys(bodyRules).forEach(function (key) {
        if (bodyRules[key]) parts.push(key + ':' + bodyRules[key]);
      });
      return css + '<body style="' + parts.join(';') + '">' + inlined.html + '</body>';
    },
    getCss: function () { return extraCss; },
    getWrapper: function () {
      return {
        getStyle: function () {
          var copy = {};
          Object.keys(bodyRules).forEach(function (key) { copy[key] = bodyRules[key]; });
          return copy;
        },
        addStyle: function (rules) { setBodyStyle(rules); }
      };
    },
    Canvas: { getFrameEl: function () { return frame; } },
    getDevice: function () { return device; },
    setDevice: setDevice,
    on: on,
    trigger: trigger,
    loadHtml: loadHtml,
    setBodyStyle: setBodyStyle,
    refresh: function () {},
    Commands: { add: function () {} },
    I18n: { getLocale: function () { return 'en'; }, addMessages: function () {} },
    Panels: { getButton: function () { return null; } },
    Modal: {
      open: function (opts) {
        opts = opts || {};
        document.getElementById('ez-modal-title').textContent = opts.title || '';
        var box = document.getElementById('ez-modal-body');
        box.innerHTML = '';
        if (opts.content) box.appendChild(opts.content);
        document.getElementById('ez-modal').hidden = false;
      },
      close: function () {
        document.getElementById('ez-modal').hidden = true;
        document.getElementById('ez-modal-body').innerHTML = '';
      }
    }
  };

  function bindChrome() {
    document.getElementById('ez-undo').addEventListener('click', undo);
    document.getElementById('ez-redo').addEventListener('click', redo);
    document.getElementById('ez-clear').addEventListener('click', function () {
      var text = (doc.body.textContent || '').replace(/\s+/g, '');
      if (text && !window.confirm('Clear the canvas?')) return;
      clearCanvas();
    });
    document.getElementById('nl-save').addEventListener('click', function () {
      var name = window.prompt('Name this block', 'My block');
      if (name) saveBlock(name);
    });
    document.getElementById('nl-mine').addEventListener('click', function () {
      showTab('blocks');
      var title = document.getElementById('ez-mine-title');
      if (title) title.scrollIntoView({ block: 'nearest' });
      else status('Save a selection first. It will show here as My blocks.');
    });
    document.getElementById('ez-outlines').addEventListener('click', function () {
      boxesOn = !boxesOn;
      this.classList.toggle('is-on', boxesOn);
      this.setAttribute('aria-pressed', boxesOn ? 'true' : 'false');
      if (doc) doc.documentElement.classList.toggle('ez-boxes', boxesOn);
    });
    document.getElementById('ez-preview').addEventListener('click', function () { setPreview(!previewOn); });
    var previewOff = document.getElementById('ez-preview-off');
    if (previewOff) previewOff.addEventListener('click', function () { setPreview(false); });
    window.addEventListener('resize', placeChrome);
    document.getElementById('ez-fullscreen').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', function () {
      var on = !!document.fullscreenElement;
      var button = document.getElementById('ez-fullscreen');
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.getElementById('ez-code').addEventListener('click', function () { document.getElementById('nl-copy').click(); });
    document.getElementById('ez-import').addEventListener('click', function () { document.getElementById('nl-paste').click(); });
    document.getElementById('ez-images').addEventListener('click', function () { setImagesOff(!imagesOff); });
    document.querySelectorAll('#ez-devices button').forEach(function (button) {
      button.addEventListener('click', function () { setDevice(button.getAttribute('data-device')); });
    });
    document.getElementById('ez-modal-x').addEventListener('click', function () { editor.Modal.close(); });
    document.querySelectorAll('#ez-views button').forEach(function (button) {
      button.addEventListener('click', function () { showTab(button.getAttribute('data-tab')); });
    });
    document.addEventListener('keydown', onKey);
    document.addEventListener('nl-theme', paintTone);
    frame.addEventListener('dragover', function (event) {
      event.preventDefault();
      var rect = frame.getBoundingClientRect();
      showGuide(elementFromParent(event), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
    });
    frame.addEventListener('drop', function (event) {
      event.preventDefault();
      onDrop(event.dataTransfer.getData('text/plain') || '', elementFromParent(event), {
        x: event.clientX - frame.getBoundingClientRect().left,
        y: event.clientY - frame.getBoundingClientRect().top
      });
    });
    window.NewsletterHtmlIO.register(editor);
  }

  function openFrame(saved) {
    if (saved && saved.body) {
      bodyRules = defaultBody();
      Object.keys(saved.body).forEach(function (key) { bodyRules[key] = saved.body[key]; });
    }
    extraCss = saved && saved.css || '';
    var inner = saved && typeof saved.html === 'string' ? saved.html : SEED;
    frame.addEventListener('load', function onLoad() {
      frame.removeEventListener('load', onLoad);
      doc = frame.contentDocument;
      applyBody();
      settleDrops();
      markTree(doc.body);
      Array.prototype.forEach.call(doc.querySelectorAll('[data-nl="social-icons"]'), spaceSocial);
      bindCanvas();
      paintPalette();
      setDevice('Desktop');
      paintTone();
      select(null);
      bindChrome();
      window.editor = editor;
      window.EzApp = {
        add: function (id, into) {
          add.quiet = true;
          try { return add(id, into || null, null); } finally { add.quiet = false; }
        },
        exportHtml: function () { return window.NewsletterHtmlIO.exportHtml(editor); },
        select: select,
        frame: function () { return frame; },
        column: function () { return doc.body; },
        undo: undo,
        redo: redo,
        clear: clearCanvas,
        blocks: function () { return window.EzBlocks.list(); },
        saveBlock: saveBlock,
        setDevice: setDevice,
        editor: editor,
        // For js/studio.js (quick insert, email check, shortcuts) and the tests.
        _: {
          selected: function () { return selectedEl; },
          label: crumbLabel,
          status: status,
          changed: changed,
          snapshot: snapshot,
          history: function () { return { undo: undoStack.length, redo: redoStack.length }; },
          forget: function () { undoStack.length = 0; redoStack.length = 0; armed = false; },
          preview: function (on) { if (on == null) return previewOn; setPreview(on); },
          images: function (on) { if (on == null) return imagesOff; setImagesOff(on); },
          tab: showTab,
          parent: selectParent,
          clone: cloneSelected,
          remove: removeSelected,
          editing: function () { return !!editing; },
          save: saveNow,
          addAt: addAfterSelection
        }
      };
      document.dispatchEvent(new CustomEvent('ez-ready'));
    });
    frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style id="ez-canvas">' + canvasCssText() +
      '</style><style id="ez-extra">' + escapeStyle(extraCss) + '</style></head><body>' + inner + '</body></html>';
  }

  var saved = null;
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (err) { saved = null; }
  openFrame(saved && typeof saved.html === 'string' ? saved : null);
})();
