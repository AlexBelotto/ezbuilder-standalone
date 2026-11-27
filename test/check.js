// Headless check for the standalone editor. Uses a throwaway Edge profile
// and the file:// page. It does not open the user's browser profile.
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var childProcess = require('child_process');

var port = 9415;
var profileTag = 'ez-edge-9415';
var profile = path.join(os.tmpdir(), profileTag);
var pageUrl = encodeURI('file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/').replace(/^\/+/, ''));
var edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(function (file) { return fs.existsSync(file); })[0];

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function getJson(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

function killEdge() {
  var script = [
    "$procs = Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\"",
    "$procs | Where-Object { $_.CommandLine -and $_.CommandLine -match '" + port + "' -and $_.CommandLine -match '" + profileTag + "' } | ForEach-Object {",
    "  & taskkill.exe /PID $_.ProcessId /T /F | Out-Null",
    "}"
  ].join('; ');
  try {
    childProcess.execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
  } catch (err) {}
}

var EXPR = `(async function () {
  var failures = [];
  var details = {};
  function check(name, ok) { if (!ok) failures.push(name); }
  function ready() {
    return new Promise(function (resolve) {
      var n = 0;
      (function poll() {
        if (window.EzApp && window.EzApp.column()) return resolve(true);
        if (++n > 60) return resolve(false);
        setTimeout(poll, 100);
      })();
    });
  }
  if (!(await ready())) return { ok: false, failures: ['editor did not start'], details: details };
  var frameEl = document.getElementById('ez-frame');
  frameEl.style.width = '900px';
  frameEl.style.height = '900px';
  frameEl.style.minWidth = '900px';
  frameEl.style.flexShrink = '0';
  var scripts = Array.prototype.map.call(document.scripts, function (node) { return node.src || ''; });
  check('no grapes script', !scripts.some(function (src) { return /grapes/i.test(src); }));
  check('no grapes global', typeof window.grapesjs === 'undefined');
  check('blocks', ['sect100', 'sect50', 'sect30', 'sect37', 'button', 'email-icon-text', 'email-hspacer', 'email-social-group', 'email-social-element'].every(function (id) {
    return EzApp.blocks().some(function (block) { return block.id === id; });
  }));
  check('starter blocks', ['text-sect', 'quote', 'link-block', 'grid-items', 'list-items'].every(function (id) {
    return EzApp.blocks().some(function (block) { return block.id === id; });
  }));
  EzApp.add('sect50');
  // Like the GrapesJS version, a new section has empty 150px columns: no starter
  // text that could end up in the email.
  var cells = EzApp.column().querySelectorAll('td[data-ez="cell"]');
  check('section columns empty', cells.length === 2 && !cells[0].textContent.trim() && !cells[1].textContent.trim());
  check('section 150 high', EzApp.column().querySelector('table[data-nl="section"]').getAttribute('height') === '150');
  EzApp.add('text', EzApp.column().querySelector('td'));
  check('text into column', !!cells[0].querySelector('[data-ez="text"]'));
  EzApp.clear();
  EzApp.add('link-block');
  var linkBlock = EzApp.column().querySelector('[data-ez="link-block"]');
  EzApp.add('text', linkBlock);
  check('link block holds text', !!(linkBlock && linkBlock.querySelector('[data-ez="text"]')));

  function field(name) { return document.querySelector('[data-ez-field="' + name + '"]'); }
  function setField(name, value) {
    var input = field(name);
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function leaks(root, color) {
    var bad = [];
    root.querySelectorAll('td, th, table').forEach(function (el) {
      var bg = ((el.getAttribute('bgcolor') || '') + ' ' + (el.getAttribute('style') || '')).toLowerCase();
      if (bg.indexOf(color) === -1) return;
      if (el.querySelector('table')) bad.push(el.tagName + ':' + (el.getAttribute('data-nl') || el.className || '').slice(0, 40));
    });
    return bad;
  }

  EzApp.clear();
  EzApp.add('button');
  var button = EzApp.column().querySelector('table[data-ez="button"]');
  var buttonWidth = button ? button.getBoundingClientRect().width : 0;
  details.buttonWidth = Math.round(buttonWidth);
  check('default button', !!button && (button.getAttribute('bgcolor') || button.innerHTML).toLowerCase().indexOf('f45e43') !== -1);
  check('short button', buttonWidth > 40 && buttonWidth < 220);
  var plainButton = EzApp.exportHtml();
  details.buttonExportHasAccent = plainButton.toLowerCase().indexOf('f45e43') !== -1;
  check('export accent', details.buttonExportHasAccent);
  check('no leaked closer', plainButton.indexOf('--&gt;') === -1);
  check('arial body', /<body[^>]*font-family:\\s*Arial/i.test(plainButton));
  check('button has no max width', !/max-width\\s*:\\s*100%/i.test(button.getAttribute('style') || ''));

  EzApp.clear();
  EzApp.add('sect100');
  var outer = EzApp.column().querySelector('table[data-nl="section"]');
  var outerCell = outer.rows[0].cells[0];
  EzApp.add('sect30', outerCell);
  var split = outerCell.querySelector('table[data-nl="section"]');
  var cols = split.rows[0].cells;
  EzApp.add('image', cols[0]);
  EzApp.add('image', cols[2]);
  EzApp.add('button', cols[1]);
  var mid = cols[1].querySelector('table[data-ez="button"]');
  EzApp.select(mid);
  check('button field', setField('background', '#2255aa'));
  setField('css-width', '50%');
  check('button percent width ignored', !/width\\s*:\\s*[^;]*%/i.test(mid.getAttribute('style') || '') && (mid.getAttribute('width') || '').indexOf('%') === -1);
  var liveBad = leaks(EzApp.column(), '2255aa');
  details.liveLeaks = liveBad;
  check('live button only', liveBad.length === 0);
  check('live button colored', ((mid.innerHTML || '') + (cols[1].querySelector('td').getAttribute('bgcolor') || '')).toLowerCase().indexOf('2255aa') !== -1);
  check('outer cell clean', ((outerCell.getAttribute('bgcolor') || '') + (outerCell.getAttribute('style') || '')).toLowerCase().indexOf('2255aa') === -1);
  var bleedHtml = EzApp.exportHtml();
  var bleedDoc = new DOMParser().parseFromString(bleedHtml, 'text/html');
  var exportLeaks = leaks(bleedDoc, '2255aa');
  details.exportLeaks = exportLeaks;
  check('export button only', exportLeaks.length === 0);
  check('export still colored', bleedHtml.toLowerCase().indexOf('2255aa') !== -1);

  EzApp.clear();
  EzApp.add('sect100');
  var linkCell = EzApp.column().querySelector('td');
  linkCell.innerHTML = '<a href="https://example.com" style="background-color:#2255aa;color:#ffffff;padding:8px 12px;">Read</a>';
  var linkHtml = EzApp.exportHtml();
  var linkDoc = new DOMParser().parseFromString(linkHtml, 'text/html');
  var readCell = null;
  linkDoc.querySelectorAll('td').forEach(function (cell) {
    if ((cell.textContent || '').trim() === 'Read' && !cell.querySelector('table')) readCell = cell;
  });
  details.linkCell = readCell ? (readCell.getAttribute('bgcolor') || '') : 'missing';
  check('plain link lifts', !!readCell && (readCell.getAttribute('bgcolor') || '').toLowerCase() === '#2255aa');

  var snippet = '%%=ProperCase(IIF(INDEXOF(TRIM(FIRST_NAME)," ") > 0,SUBSTRING(TRIM(FIRST_NAME),1,SUBTRACT(INDEXOF(TRIM(FIRST_NAME)," "),1)),TRIM(FIRST_NAME)))=%%';
  EzApp.clear();
  EzApp.add('text');
  var paragraph = EzApp.column().querySelector('[data-ez="text"]');
  paragraph.textContent = 'Hello ' + snippet + ' and 5 > 3';
  var amp = EzApp.exportHtml();
  details.ampCount = amp.split(snippet).length - 1;
  check('ampscript exact', details.ampCount >= 1);
  check('plain gt escaped', amp.indexOf('5 &gt; 3') !== -1);
  check('merge gt restored', amp.indexOf('&gt; 0') === -1);

  EzApp.clear();
  EzApp.add('text');
  var georgia = EzApp.column().querySelector('[data-ez="text"]');
  EzApp.select(georgia);
  check('font field', setField('font', 'Georgia, serif'));
  var georgiaHtml = EzApp.exportHtml();
  check('georgia kept', /font-family:\\s*Georgia/i.test(georgiaHtml));

  EzApp.clear();
  EzApp.add('sect37');
  var section = EzApp.column().querySelector('table[data-nl="section"]');
  var wide = section.rows[0].cells[1];
  wide.innerHTML = '<p style="margin:0;font-size:16px;">https://example.com/' + new Array(121).join('a') + '</p>';
  var sectionWidth = section.getBoundingClientRect().width;
  var leftWidth = section.rows[0].cells[0].getBoundingClientRect().width;
  var rightWidth = wide.getBoundingClientRect().width;
  var bodyWidth = EzApp.column().getBoundingClientRect().width;
  details.widths = { body: Math.round(bodyWidth), section: Math.round(sectionWidth), left: Math.round(leftWidth), right: Math.round(rightWidth) };
  check('paper 600', Math.abs(bodyWidth - 600) < 8);
  check('section 600', Math.abs(sectionWidth - 600) < 8);
  check('3/7 split', Math.abs(leftWidth - 180) < 10 && Math.abs(rightWidth - 420) < 10);
  var splitHtml = EzApp.exportHtml();
  check('wrap anywhere', splitHtml.indexOf('overflow-wrap:anywhere') !== -1 && splitHtml.indexOf('word-wrap:break-word') !== -1);

  EzApp.clear();
  EzApp.add('sect100');
  EzApp.select(EzApp.column().querySelector('table[data-nl="section"]'));
  check('hug field', setField('section-width', 'hug'));
  check('hug attribute', EzApp.column().querySelector('table[data-nl="section"]').getAttribute('data-nl-hug') === '1');
  check('section min field', !!field('section-min'));

  EzApp.clear();
  EzApp.add('sect50');
  var half = EzApp.column().querySelector('table[data-nl="section"]');
  EzApp.add('email-hspacer', half.rows[0].cells[0]);
  var gap = half.querySelector('[data-nl="hspacer"]');
  var shares = [];
  if (gap) {
    Array.prototype.forEach.call(half.rows[0].cells, function (cell) {
      var raw = ((cell.getAttribute('style') || '').match(/width\\s*:\\s*([\\d.]+%|\\d+px)/i) || [])[1] || cell.getAttribute('width') || '';
      shares.push(cell.getAttribute('data-nl') === 'hspacer' ? 'gap:' + raw : raw);
    });
  }
  details.gap = shares;
  check('gap cell', !!gap && gap.tagName === 'TD' && gap.parentElement === half.rows[0]);
  var total = 0;
  if (gap) Array.prototype.forEach.call(half.rows[0].cells, function (cell) {
    var raw = (cell.getAttribute('style') || '') + ' ' + (cell.getAttribute('width') || '');
    var match = raw.match(/([\\d.]+)\\s*%/);
    if (match) total += parseFloat(match[1]);
  });
  details.gapTotal = Math.round(total * 100) / 100;
  check('gap row stays 100', total > 98 && total < 102);
  if (gap) {
    EzApp.select(gap);
    check('gap unit control', !!field('gap-width') && field('gap-unit') && field('gap-unit').tagName === 'SELECT');
    setField('gap-unit', 'px');
    check('gap unit converts', /width\\s*:\\s*\\d+px/i.test(gap.getAttribute('style') || ''));
  } else check('gap unit control', false);

  EzApp.clear();
  var rejected = EzApp.add('email-social-element');
  check('social stays in group', !rejected && !EzApp.column().querySelector('[data-nl="social-element"]'));
  EzApp.add('email-social-group');
  var icons = EzApp.column().querySelector('[data-nl="social-icons"]');
  EzApp.select(icons);
  check('gap field', setField('social-gap', '10'));
  var iconCells = icons.querySelectorAll('[data-nl="social-element"]');
  var firstBox = iconCells[0] ? getComputedStyle(iconCells[0]) : null;
  var lastBox = iconCells.length ? getComputedStyle(iconCells[iconCells.length - 1]) : null;
  details.social = {
    n: iconCells.length,
    gap: icons.getAttribute('data-nl-gap'),
    first: firstBox ? [firstBox.paddingTop, firstBox.paddingRight, firstBox.paddingBottom, firstBox.paddingLeft] : [],
    last: lastBox ? [lastBox.paddingTop, lastBox.paddingRight, lastBox.paddingBottom, lastBox.paddingLeft] : []
  };
  check('social gap stored', icons.getAttribute('data-nl-gap') === '10');
  if (iconCells[0]) EzApp.select(iconCells[0]);
  check('social network', !!field('social-network') && field('social-network').tagName === 'SELECT');
  check('social end pads', !!firstBox && firstBox.paddingLeft === '0px' && firstBox.paddingRight === '5px' && lastBox.paddingRight === '0px' && lastBox.paddingLeft === '5px');

  EzApp.clear();
  EzApp.add('image');
  var image = EzApp.column().querySelector('img');
  EzApp.select(image);
  check('href field', !!field('href'));
  var widthInput = field('css-width');
  check('width unit', !!widthInput && !!widthInput.parentElement && !!widthInput.parentElement.querySelector('select'));
  var assetBtn = document.querySelector('.ez-asset-btn');
  check('image browser button', !!assetBtn);
  if (assetBtn) assetBtn.click();
  check('image modal', document.getElementById('ez-modal').hidden === false && document.getElementById('ez-modal-title').textContent === 'Select Image');
  document.getElementById('ez-modal-x').click();
  check('image modal closes', document.getElementById('ez-modal').hidden === true);
  setField('href', 'javascript:alert(1)');
  check('javascript rejected', !image.parentElement || image.parentElement.tagName !== 'A' || (image.parentElement.getAttribute('href') || '').indexOf('javascript:') === -1);
  setField('href', 'www.example.com/a');
  check('www upgraded', image.parentElement && image.parentElement.getAttribute('href') === 'https://www.example.com/a');

  var beforeTheme = document.documentElement.getAttribute('data-nl-theme');
  document.getElementById('nl-theme').click();
  var afterTheme = document.documentElement.getAttribute('data-nl-theme');
  check('theme toggles', beforeTheme !== afterTheme);
  document.getElementById('nl-theme').click();
  check('theme restores', document.documentElement.getAttribute('data-nl-theme') === beforeTheme);
  check('paper stays white', getComputedStyle(EzApp.column()).backgroundColor === 'rgb(255, 255, 255)');

  EzApp.clear();
  EzApp.add('text');
  check('text added', !!EzApp.column().querySelector('[data-ez="text"]'));
  EzApp.undo();
  check('undo', !EzApp.column().querySelector('[data-ez="text"]'));
  EzApp.redo();
  check('redo', !!EzApp.column().querySelector('[data-ez="text"]'));

  EzApp.clear();
  EzApp.add('button');
  var round = EzApp.exportHtml();
  EzApp.clear();
  var imported = window.NewsletterHtmlIO.importHtml(EzApp.editor, round, { force: true });
  check('paste', imported && !imported.error && !imported.cancelled);
  var again = EzApp.exportHtml();
  check('paste keeps button', again.toLowerCase().indexOf('f45e43') !== -1);
  check('paste no leak', again.indexOf('--&gt;') === -1);

  var title = document.getElementById('nl-email-title');
  title.value = 'Stand Alone';
  title.dispatchEvent(new Event('input', { bubbles: true }));
  var lang = document.getElementById('nl-email-lang');
  lang.value = 'custom';
  lang.dispatchEvent(new Event('change', { bubbles: true }));
  var custom = document.getElementById('nl-email-lang-custom');
  custom.value = 'nope';
  custom.dispatchEvent(new Event('input', { bubbles: true }));
  check('bad lang', custom.getAttribute('aria-invalid') === 'true');
  custom.value = 'es-MX';
  custom.dispatchEvent(new Event('input', { bubbles: true }));
  var headed = EzApp.exportHtml();
  check('title written', headed.indexOf('<title>Stand Alone</title>') !== -1);
  check('lang written', /<html[^>]*\\slang="es-MX"/i.test(headed));

  document.getElementById('nl-outlook').click();
  await new Promise(function (resolve) { setTimeout(resolve, 700); });
  var preview = document.getElementById('nl-outlook-frame').srcdoc || '';
  check('outlook preview', preview.indexOf('nl-ol-preview') !== -1 && preview.length > 200);
  document.getElementById('nl-outlook-close').click();

  var badNet = performance.getEntriesByType('resource').map(function (entry) { return entry.name; }).filter(function (name) {
    return /grapesjs|juice|unpkg|cdn\\.jsdelivr|cdnjs/i.test(name);
  });
  details.badNet = badNet;
  check('no library network', badNet.length === 0);

  check('detail tabs', !!document.getElementById('ez-tab-edit') && !!document.getElementById('ez-tab-config') && !!document.getElementById('ez-tab-layers'));
  EzApp.clear();
  EzApp.add('text');
  var sample = EzApp.column().querySelector('p, h1, [data-ez="text"]');
  EzApp.select(sample);
  var editText = document.getElementById('ez-panel-edit').textContent || '';
  check('edit sectors', editText.indexOf('Dimension') !== -1 && editText.indexOf('Typography') !== -1 && editText.indexOf('Decorations') !== -1);
  check('edit font', !!field('font') && field('font').tagName === 'SELECT');
  document.getElementById('ez-tab-config').click();
  check('config tab', document.getElementById('ez-panel-config').hidden === false && document.getElementById('ez-panel-edit').hidden === true);
  document.getElementById('ez-tab-layers').click();
  check('layers list', document.querySelectorAll('#ez-panel-layers .ez-layer').length > 0);
  var layerButton = document.querySelector('#ez-panel-layers .ez-layer-name');
  if (layerButton) layerButton.click();
  check('layer selects', !!EzApp.column().querySelector('.ez-selected'));
  document.getElementById('ez-tab-edit').click();
  var block = document.querySelector('[data-block="text"]');
  var transfer = new DataTransfer();
  block.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  var dragFrame = document.getElementById('ez-frame');
  var dragRect = dragFrame.getBoundingClientRect();
  dragFrame.dispatchEvent(new DragEvent('dragover', {
    bubbles: true,
    cancelable: true,
    clientX: dragRect.left + dragRect.width / 2,
    clientY: dragRect.top + 120,
    dataTransfer: transfer
  }));
  var bar = dragFrame.contentDocument.getElementById('ez-insert');
  details.insert = bar ? { display: bar.style.display, parent: bar.parentNode && bar.parentNode.tagName } : 'missing';
  check('insert line', !!bar && bar.style.display !== 'none' && bar.parentNode === dragFrame.contentDocument.documentElement);
  check('guide stays out of export', EzApp.exportHtml().indexOf('id="ez-insert"') === -1 && EzApp.exportHtml().indexOf("id='ez-insert'") === -1);
  block.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  check('insert line clears', !bar || bar.style.display === 'none');
  return { ok: failures.length === 0, failures: failures, details: details };
})()`;

async function main() {
  if (!edge) throw new Error('Edge was not found');
  fs.rmSync(profile, { recursive: true, force: true });
  var proc = childProcess.spawn(edge, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-extensions',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--window-size=1440,900',
    pageUrl
  ], { stdio: 'ignore' });
  var page = null;
  for (var i = 0; i < 40; i++) {
    try {
      var list = await getJson('http://127.0.0.1:' + port + '/json/list');
      page = list.filter(function (item) { return item.type === 'page' && item.webSocketDebuggerUrl; })[0];
      if (page) break;
    } catch (err) {}
    await sleep(250);
  }
  if (!page) throw new Error('Edge did not open the page');
  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  var seq = 0;
  var pending = {};
  ws.addEventListener('message', function (event) {
    var msg = JSON.parse(event.data);
    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg);
      delete pending[msg.id];
    }
  });
  function send(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = function (msg) {
        if (msg.error) reject(new Error(method + ' ' + JSON.stringify(msg.error)));
        else resolve(msg.result);
      };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }
  await send('Runtime.enable');
  var evaluated = await send('Runtime.evaluate', {
    expression: EXPR,
    awaitPromise: true,
    returnByValue: true
  });
  ws.close();
  proc.kill();
  if (evaluated.exceptionDetails) {
    console.log(JSON.stringify({
      ok: false,
      exception: evaluated.exceptionDetails.text,
      description: evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(evaluated.result && evaluated.result.value, null, 2));
  if (!evaluated.result || !evaluated.result.value || !evaluated.result.value.ok) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err && err.stack || err);
  process.exitCode = 1;
}).finally(function () {
  killEdge();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (err) {}
});
