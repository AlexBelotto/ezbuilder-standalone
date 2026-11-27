// EzBuilder studio layer: toasts, quick insert (Ctrl+K), the Email check and the
// keyboard shortcut sheet. Plain JavaScript, works offline, adds nothing to the
// exported email.
(function () {
  'use strict';

  // ---- Toasts ------------------------------------------------------------------
  var toastBox = document.getElementById('ez-toasts');
  var lastToast = { text: '', at: 0, node: null };
  window.EzToast = function (text, kind) {
    if (!toastBox || !text) return;
    var now = Date.now();
    // The same note twice in a row only refreshes the one on screen.
    if (lastToast.node && lastToast.node.isConnected && lastToast.text === text && now - lastToast.at < 2500) {
      lastToast.at = now;
      clearTimeout(lastToast.node._timer);
      lastToast.node._timer = setTimeout(close.bind(null, lastToast.node), 2600);
      return;
    }
    var node = document.createElement('div');
    node.className = 'ez-toast' + (kind ? ' is-' + kind : '');
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.textContent = text;
    toastBox.appendChild(node);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    requestAnimationFrame(function () { node.classList.add('is-in'); });
    node._timer = setTimeout(close.bind(null, node), kind === 'error' ? 6000 : 2600);
    node.addEventListener('click', function () { close(node); });
    lastToast = { text: text, at: now, node: node };
    function close(el) {
      if (!el.isConnected) return;
      el.classList.remove('is-in');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
  };

  function ready(fn) {
    if (window.EzApp && window.EzApp._) fn();
    else document.addEventListener('ez-ready', fn, { once: true });
  }

  ready(function () {
    var app = window.EzApp;
    var api = app._;
    var editor = app.editor;
    var canvasDoc = function () { return app.frame().contentDocument; };

    // Copy HTML and Copy body feedback as toasts.
    document.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('#ez-modal-body button');
      if (!btn || btn.textContent !== 'Copy HTML') return;
      setTimeout(function () {
        var note = btn.parentNode && btn.parentNode.querySelector('span');
        var text = note ? note.textContent : '';
        if (text) window.EzToast(text === 'Copied.' ? 'HTML copied to the clipboard' : text, text === 'Copied.' ? 'ok' : '');
      }, 150);
    }, true);
    var bodyBtn = document.getElementById('nl-copy-body');
    if (bodyBtn) {
      new MutationObserver(function () {
        if (bodyBtn.textContent === 'Copied') window.EzToast('Body HTML copied to the clipboard', 'ok');
      }).observe(bodyBtn, { childList: true, characterData: true, subtree: true });
    }

    // ---- Overlay helper ----------------------------------------------------------
    function overlay(id, title) {
      var root = document.getElementById(id);
      if (root) return root;
      root = document.createElement('div');
      root.id = id;
      root.className = 'ez-overlay';
      root.hidden = true;
      root.innerHTML = '<div class="ez-sheet" role="dialog" aria-modal="true" aria-label="' + title + '"></div>';
      root.addEventListener('mousedown', function (event) { if (event.target === root) hide(root); });
      document.body.appendChild(root);
      return root;
    }
    var lastFocus = null;
    function show(root) {
      lastFocus = document.activeElement;
      root.hidden = false;
      requestAnimationFrame(function () { root.classList.add('is-in'); });
    }
    function hide(root) {
      if (!root || root.hidden) return;
      root.classList.remove('is-in');
      root.hidden = true;
      if (lastFocus && lastFocus.focus && lastFocus.isConnected) { try { lastFocus.focus(); } catch (err) {} }
    }
    function anyOpen(modalOnly) {
      return Array.prototype.some.call(document.querySelectorAll('.ez-overlay'), function (node) { return !node.hidden && !(modalOnly && node.classList.contains('is-side')); });
    }

    // ---- Quick insert / command palette -------------------------------------------
    function click(id) { return function () { var el = document.getElementById(id); if (el) el.click(); }; }
    var COMMANDS = [
      { label: 'Undo', hint: 'Ctrl+Z', run: app.undo },
      { label: 'Redo', hint: 'Ctrl+Shift+Z', run: app.redo },
      { label: 'Copy HTML', hint: 'Export', run: click('nl-copy') },
      { label: 'Copy body', hint: 'Export', run: click('nl-copy-body') },
      { label: 'Paste HTML', hint: 'Import', run: click('nl-paste') },
      { label: 'Email check', hint: 'Preflight', run: function () { openCheck(); } },
      { label: 'Preview', hint: 'View', run: click('ez-preview') },
      { label: 'Old Outlook preview', hint: 'View', run: click('nl-outlook') },
      { label: 'View components (outlines)', hint: 'View', run: click('ez-outlines') },
      { label: 'Toggle images', hint: 'View', run: click('ez-images') },
      { label: 'Fixed 600px width (non-responsive) on/off', hint: 'Page · min-width', run: function () { api.fixedWidth(!api.fixedWidth()); } },
      { label: 'Desktop', hint: 'Device', run: function () { app.setDevice('Desktop'); } },
      { label: 'Tablet', hint: 'Device', run: function () { app.setDevice('Tablet'); } },
      { label: 'Mobile landscape', hint: 'Device', run: function () { app.setDevice('Mobile landscape'); } },
      { label: 'Mobile portrait', hint: 'Device', run: function () { app.setDevice('Mobile portrait'); } },
      { label: 'Dark mode', hint: 'Editor theme', run: click('nl-theme') },
      { label: 'Duplicate selected block', hint: 'Ctrl+D', run: function () { api.clone(); }, needs: true },
      { label: 'Delete selected block', hint: 'Delete', run: function () { api.remove(); }, needs: true },
      { label: 'Select parent', hint: 'A', run: function () { api.parent(); }, needs: true },
      { label: 'Save selected as block', hint: 'My blocks', run: click('nl-save'), needs: true },
      { label: 'Keyboard shortcuts', hint: '?', run: function () { openKeys(); } },
      { label: 'Clear canvas', hint: 'Danger', run: click('ez-clear') }
    ];

    function score(text, query) {
      // Words that start with the query rank first, then substrings, then letters in order.
      text = text.toLowerCase();
      if (!query) return 1;
      var at = text.indexOf(query);
      if (at === 0) return 100 - text.length / 100;
      if (at > 0 && /[\s(+/-]/.test(text.charAt(at - 1))) return 80 - at / 100;
      if (at > 0) return 60 - at / 100;
      var i = 0;
      var gaps = 0;
      for (var j = 0; j < text.length && i < query.length; j++) {
        if (text.charAt(j) === query.charAt(i)) i++;
        else if (i) gaps++;
      }
      return i === query.length ? 30 - gaps : 0;
    }

    var pal = overlay('ez-palette', 'Quick insert');
    var palSheet = pal.querySelector('.ez-sheet');
    palSheet.innerHTML = '<div class="ez-pal-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/></svg>' +
      '<input type="text" id="ez-pal-input" placeholder="Insert a block or run a command…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="ez-pal-list"><kbd>Esc</kbd></div>' +
      '<div id="ez-pal-list" role="listbox"></div><div class="ez-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span>Blocks go after the selected block, or into the selected column.</span></div>';
    var palInput = palSheet.querySelector('#ez-pal-input');
    var palList = palSheet.querySelector('#ez-pal-list');
    var palItems = [];
    var palIndex = 0;

    function entries() {
      var out = [];
      app.blocks().forEach(function (block) {
        out.push({ label: block.label, hint: 'Insert · ' + block.group, block: block.id });
      });
      var mine = [];
      try { mine = JSON.parse(localStorage.getItem('ezbuilder-my-blocks') || '[]') || []; } catch (err) { mine = []; }
      mine.forEach(function (block) {
        if (block && block.id) out.push({ label: block.label || 'My block', hint: 'Insert · My blocks', block: 'mine:' + block.id });
      });
      var has = !!api.selected();
      COMMANDS.forEach(function (cmd) { if (!cmd.needs || has) out.push(cmd); });
      return out;
    }

    function paintPalette() {
      var query = palInput.value.trim().toLowerCase();
      palItems = entries().map(function (item) {
        return { item: item, s: Math.max(score(item.label, query), query ? score(item.hint || '', query) * 0.5 : 0) };
      }).filter(function (row) { return row.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 40).map(function (row) { return row.item; });
      palIndex = Math.min(palIndex, Math.max(0, palItems.length - 1));
      palList.innerHTML = '';
      if (!palItems.length) {
        var none = document.createElement('div');
        none.className = 'ez-pal-empty';
        none.textContent = 'Nothing matches “' + palInput.value + '”.';
        palList.appendChild(none);
        return;
      }
      palItems.forEach(function (item, index) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'ez-pal-row' + (index === palIndex ? ' is-on' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', index === palIndex ? 'true' : 'false');
        row.setAttribute('data-pal', item.block || item.label);
        var name = document.createElement('span');
        name.className = 'ez-pal-name';
        name.textContent = item.label;
        var hint = document.createElement('span');
        hint.className = 'ez-pal-hint';
        hint.textContent = item.hint || '';
        row.appendChild(name);
        row.appendChild(hint);
        row.addEventListener('mousemove', function () {
          if (palIndex === index) return;
          palIndex = index;
          mark();
        });
        row.addEventListener('click', function () { runItem(item); });
        palList.appendChild(row);
      });
    }

    function mark() {
      Array.prototype.forEach.call(palList.children, function (row, index) {
        row.classList.toggle('is-on', index === palIndex);
        row.setAttribute('aria-selected', index === palIndex ? 'true' : 'false');
        if (index === palIndex && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      });
    }

    function runItem(item) {
      hide(pal);
      if (item.block) {
        var made = api.addAt(item.block);
        if (made) {
          window.EzToast('Inserted ' + item.label, 'ok');
          if (made.scrollIntoView) made.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return;
      }
      try { item.run(); } catch (err) { window.EzToast('That command did not run.', 'error'); }
    }

    function openPalette() {
      if (api.preview()) return;
      hideAll();
      palInput.value = '';
      palIndex = 0;
      paintPalette();
      show(pal);
      palInput.focus();
    }
    palInput.addEventListener('input', function () { palIndex = 0; paintPalette(); });
    palInput.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); palIndex = Math.min(palItems.length - 1, palIndex + 1); mark(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); palIndex = Math.max(0, palIndex - 1); mark(); }
      else if (event.key === 'Enter') { event.preventDefault(); if (palItems[palIndex]) runItem(palItems[palIndex]); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(pal); }
    });
    document.getElementById('ez-quick').addEventListener('click', openPalette);

    // ---- Keyboard shortcuts sheet ---------------------------------------------------
    var keys = overlay('ez-keysheet', 'Keyboard shortcuts');
    var KEYS = [
      ['Ctrl+K', 'Quick insert a block or run a command'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
      ['Ctrl+C / Ctrl+V', 'Copy the block / paste it after the selection'],
      ['Ctrl+D', 'Duplicate the selected block'],
      ['Alt+↑ / Alt+↓', 'Move the block up or down'],
      ['Delete', 'Delete the selected block'],
      ['W / S', 'Select the previous / next block'],
      ['A / D', 'Select the parent / first child'],
      ['Double-click', 'Edit text, or pick another picture'],
      ['Shift while resizing', 'Snap to 10px steps'],
      ['Ctrl+click', 'Select more than one block'],
      ['Esc', 'Stop editing, close, or leave Preview'],
      ['?', 'This list']
    ];
    keys.querySelector('.ez-sheet').innerHTML = '<div class="ez-sheet-head"><strong>Keyboard shortcuts</strong><button type="button" class="ez-sheet-x" aria-label="Close">×</button></div>' +
      '<dl class="ez-keylist">' + KEYS.map(function (row) {
        return '<div><dt>' + row[0].split(' / ').map(function (part) { return part.split('+').map(function (k) { return '<kbd>' + k + '</kbd>'; }).join('+'); }).join(' / ') + '</dt><dd>' + row[1] + '</dd></div>';
      }).join('') + '</dl>';
    keys.querySelector('.ez-sheet-x').addEventListener('click', function () { hide(keys); });
    function openKeys() { hideAll(); show(keys); keys.querySelector('.ez-sheet-x').focus(); }
    document.getElementById('ez-keys').addEventListener('click', openKeys);

    // ---- Email check (preflight) -----------------------------------------------------
    var check = overlay('ez-checksheet', 'Email check');
    check.classList.add('is-side');
    var checkSheet = check.querySelector('.ez-sheet');
    var checkBtn = document.getElementById('ez-check');
    var countNode = document.getElementById('ez-check-count');
    var GMAIL_CLIP = 102 * 1024;

    function bytes(text) {
      try { return new Blob([text]).size; } catch (err) { return unescape(encodeURIComponent(text)).length; }
    }
    function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }

    function parseColor(value) {
      var m = String(value || '').match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      var p = m[1].split(',').map(function (x) { return parseFloat(x); });
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function lum(c) {
      return [c.r, c.g, c.b].map(function (v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }).reduce(function (acc, v, i) { return acc + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
    }
    function contrast(a, b) {
      var l1 = lum(a);
      var l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function backdrop(el, win) {
      for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
        var cs = win.getComputedStyle(node);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
        var c = parseColor(cs.backgroundColor);
        if (c && c.a > 0.5) return c;
        var attr = node.getAttribute('bgcolor');
        if (attr && /^#[0-9a-f]{6}$/i.test(attr)) return { r: parseInt(attr.substr(1, 2), 16), g: parseInt(attr.substr(3, 2), 16), b: parseInt(attr.substr(5, 2), 16), a: 1 };
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    function ownText(el) {
      var text = '';
      Array.prototype.forEach.call(el.childNodes, function (n) { if (n.nodeType === 3) text += ' ' + n.nodeValue; });
      text = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      return /[0-9A-Za-z\u00c0-\u024f]/.test(text) ? text : '';
    }

    var PLACEHOLDER_COPY = /(Preview text shown in the inbox|Replace this sentence|Insert your text here|Headline goes here|Lorem ipsum|Company name|123 Street, City|One or two sentences)/i;

    function runCheck() {
      var d = canvasDoc();
      var win = d.defaultView;
      var issues = [];
      function add(level, text, el, fix) { issues.push({ level: level, text: text, el: el || null, fix: fix || '' }); }
      var html = '';
      try { html = app.exportHtml(); } catch (err) { add('error', 'The email could not be exported: ' + err.message); }
      var size = bytes(html);
      if (size > GMAIL_CLIP) add('error', 'The HTML is ' + kb(size) + '. Gmail clips emails over 102 KB and hides the end (usually the footer and unsubscribe link).', null, 'Remove blocks or use fewer, simpler sections.');
      else if (size > 90 * 1024) add('warn', 'The HTML is ' + kb(size) + ', close to Gmail’s 102 KB clipping limit. Sending platforms add tracking links on top.', null);
      var body = d.body;
      var imgs = Array.prototype.filter.call(body.querySelectorAll('img'), function (img) { return !img.closest('#ez-rte'); });
      imgs.forEach(function (img) {
        var src = img.getAttribute('data-ez-src') || img.getAttribute('src') || '';
        var label = img.getAttribute('data-nl') === 'icon' ? 'Icon' : img.closest('[data-nl="social-element"]') ? 'Social icon' : 'Image';
        if (!src) add('error', label + ' has no picture address.', img);
        else if (/^data:/i.test(src)) add('error', label + ' is an uploaded file stored inside the email. Gmail and Outlook usually block these; use a web address (https://…).', img);
        else if (/\.svg(\?|#|$)/i.test(src) || /^data:image\/svg/i.test(src)) add('error', label + ' is an SVG. Gmail and Outlook do not show SVG pictures; use PNG or JPG.', img);
        else if (/^http:\/\//i.test(src)) add('warn', label + ' loads over http://. Use https:// so it is not blocked.', img);
        else if (/placehold\.co|placeholder\.com|via\.placeholder|dummyimage/i.test(src)) add('warn', label + ' still uses a placeholder picture.', img);
        if (!img.hasAttribute('alt')) add('error', label + ' has no alt text. Screen readers and images-off views need it (use empty alt for decoration).', img);
        else {
          var alt = img.getAttribute('alt').trim();
          if (/\.(png|jpe?g|gif|webp)$/i.test(alt) || /^(image|img|picture|photo|imagen|foto)$/i.test(alt)) add('warn', label + ' alt text “' + alt + '” does not describe the picture.', img);
        }
        if (!img.getAttribute('width') && !img.closest('[data-nl="social-element"]')) add('info', label + ' has no width attribute. Old Outlook may show it at its full file size.', img);
      });
      var links = Array.prototype.slice.call(body.querySelectorAll('a'));
      var unsub = false;
      var testHosts = {};
      links.forEach(function (a) {
        var href = (a.getAttribute('href') || '').trim();
        var text = (a.textContent || '').replace(/\s+/g, ' ').trim();
        var name = text ? '“' + (text.length > 34 ? text.slice(0, 34) + '…' : text) + '”' : (a.querySelector('img') ? 'Image link' : 'Link');
        if (/unsub|baja|desuscri|darse de baja|cancelar (la )?suscrip|d[ée]sabonn|abmelden|descadastr/i.test(text + ' ' + href)) unsub = true;
        if (!href || href === '#') add('error', name + ' has no link address.', a);
        else if (/^javascript:/i.test(href)) add('error', name + ' uses a javascript: link. Email clients remove it.', a);
        else if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/i.test(href) || /(^|\.)(example\.(com|org|net)|test|invalid)(\/|$|:)/i.test(href.replace(/^https?:\/\//i, '').split('/')[0] + '/')) {
          // One row per test host; the rest are counted on it.
          var host = href.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].toLowerCase();
          if (testHosts[host]) {
            testHosts[host].n++;
            testHosts[host].issue.text = testHosts[host].base + ' (+' + testHosts[host].n + ' more ' + (testHosts[host].n === 1 ? 'link' : 'links') + ' to ' + host + ')';
          } else {
            add('warn', name + ' points to a test address (' + href + ').', a);
            testHosts[host] = { issue: issues[issues.length - 1], base: issues[issues.length - 1].text, n: 0 };
          }
        }
        if (/^(click here|here|aquí|aqui|haz clic aquí|read more|más|mas|leer más)$/i.test(text)) add('info', name + ' does not say where it goes. Descriptive link text helps screen readers.', a);
      });
      if (!unsub && body.textContent.trim()) add('warn', 'No unsubscribe link found. Most senders must include one (unless your platform adds it).', null);
      var lowPairs = {};
      var walker = d.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, null);
      var seen = 0;
      var tiny = 0;
      var low = 0;
      var copyLeft = 0;
      for (var el = walker.nextNode(); el && seen < 3000; el = walker.nextNode()) {
        seen++;
        if (el.closest('#ez-rte')) continue;
        var words = ownText(el);
        if (!words || el.offsetParent === null && el.tagName !== 'BODY') continue;
        var cs = win.getComputedStyle(el);
        var px = parseFloat(cs.fontSize) || 16;
        if (px < 10 && tiny < 5) { tiny++; add('warn', 'Text “' + words.slice(0, 30) + '” is ' + px + 'px. Keep text at 10px or more (14px for body copy).', el); }
        var fg = parseColor(cs.color);
        var bg = backdrop(el, win);
        if (fg && bg && low < 6) {
          var ratio = contrast(fg, bg);
          var large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
          if (ratio < (large ? 3 : 4.5)) {
            // Texts that share the same colors are one row with a count.
            var pair = [fg.r, fg.g, fg.b, bg.r, bg.g, bg.b, large].join(',');
            if (lowPairs[pair]) {
              lowPairs[pair].n++;
              lowPairs[pair].issue.text = lowPairs[pair].base + ' Same colors on ' + lowPairs[pair].n + ' more ' + (lowPairs[pair].n === 1 ? 'text' : 'texts') + '.';
            } else {
              low++;
              add('warn', 'Low contrast (' + ratio.toFixed(1) + ':1) on “' + words.slice(0, 30) + '”. Aim for ' + (large ? '3' : '4.5') + ':1.', el);
              lowPairs[pair] = { issue: issues[issues.length - 1], base: issues[issues.length - 1].text, n: 0 };
            }
          }
        }
        if (PLACEHOLDER_COPY.test(words) && copyLeft < 6) { copyLeft++; add('info', 'Placeholder copy left: “' + words.slice(0, 40) + '”.', el); }
      }
      var title = (document.getElementById('nl-email-title') || {}).value || '';
      if (!title.trim() || title.trim() === 'Newsletter') add('info', 'The email title is the default (“' + (title.trim() || 'Newsletter') + '”). Some clients show it.', null);
      var opens = (html.match(/\{\{/g) || []).length;
      var closes = (html.match(/\}\}/g) || []).length;
      if (opens !== closes) add('warn', 'Merge tags look unbalanced ({{ ' + opens + ' vs }} ' + closes + ').', null);
      if (!body.querySelector('[data-nl="preheader"], .preheader, [data-ez="preview"]') && !/display:\s*none[^"]*"[^>]*>[^<]{10,}/i.test(html)) add('info', 'No preheader. The inbox will show the first words of the email instead (the Preview text block adds one).', null);
      var order = { error: 0, warn: 1, info: 2 };
      issues.sort(function (a, b) { return order[a.level] - order[b.level]; });
      return { issues: issues, size: size, images: imgs.length, links: links.length };
    }

    function paintBadge(result) {
      var n = result.issues.filter(function (i) { return i.level !== 'info'; }).length;
      var errors = result.issues.some(function (i) { return i.level === 'error'; });
      countNode.hidden = !n;
      countNode.textContent = n > 99 ? '99+' : String(n);
      countNode.classList.toggle('is-error', errors);
      checkBtn.title = n ? 'Email check: ' + n + ' to review' : 'Email check: all clear';
    }

    // The check sheet is a docked, non-modal panel: the canvas stays usable
    // beside it, and the list refreshes itself as the email changes.
    function dockCheck() {
      var views = document.getElementById('ez-views-body') || document.getElementById('ez-views');
      var right = 12;
      if (views) {
        var box = views.getBoundingClientRect();
        if (box.width) right = Math.max(12, Math.round(window.innerWidth - box.left + 12));
      }
      check.style.paddingRight = right + 'px';
    }
    function openCheck(opts) {
      var refresh = !!(opts && opts.refresh);
      var keepScroll = 0;
      if (refresh) {
        var old = checkSheet.querySelector('.ez-issues');
        keepScroll = old ? old.scrollTop : 0;
      } else hideAll();
      var result = runCheck();
      paintBadge(result);
      var level = { error: 'Fix', warn: 'Review', info: 'Tip' };
      var parts = [];
      var pct = Math.min(100, Math.round(result.size / GMAIL_CLIP * 100));
      checkSheet.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'ez-sheet-head';
      head.innerHTML = '<strong>Email check</strong><button type="button" class="ez-sheet-x" aria-label="Close">×</button>';
      checkSheet.appendChild(head);
      var meter = document.createElement('div');
      meter.className = 'ez-meter' + (pct >= 100 ? ' is-error' : pct >= 88 ? ' is-warn' : '');
      meter.innerHTML = '<div class="ez-meter-top"><span>HTML size</span><b>' + kb(result.size) + ' of 102 KB</b></div><div class="ez-meter-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="ez-meter-sub">' + result.images + ' pictures · ' + result.links + ' links · Gmail clips above 102 KB</div>';
      checkSheet.appendChild(meter);
      var list = document.createElement('div');
      list.className = 'ez-issues';
      if (!result.issues.length) {
        list.innerHTML = '<div class="ez-allclear">All clear. Nothing to fix before sending.</div>';
      }
      result.issues.forEach(function (issue) {
        var row = document.createElement(issue.el ? 'button' : 'div');
        if (issue.el) row.type = 'button';
        row.className = 'ez-issue is-' + issue.level;
        row.setAttribute('data-level', issue.level);
        row.innerHTML = '<span class="ez-issue-tag">' + level[issue.level] + '</span><span class="ez-issue-text"></span>';
        row.querySelector('.ez-issue-text').textContent = issue.text + (issue.fix ? ' ' + issue.fix : '');
        if (issue.el) {
          row.title = 'Select it on the canvas';
          row.addEventListener('click', function () {
            if (!issue.el.isConnected) return;
            Array.prototype.forEach.call(list.querySelectorAll('.ez-issue.is-on'), function (node) { node.classList.remove('is-on'); });
            row.classList.add('is-on');
            app.select(issue.el);
            issue.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            api.tab(issue.el.tagName === 'IMG' || issue.el.tagName === 'A' ? 'config' : 'edit');
          });
        }
        list.appendChild(row);
      });
      checkSheet.appendChild(list);
      var foot = document.createElement('p');
      foot.className = 'ez-sheet-note';
      foot.textContent = 'This is a quick check in the editor. Still send a test to Gmail and Outlook before the real send.';
      checkSheet.appendChild(foot);
      head.querySelector('.ez-sheet-x').addEventListener('click', function () { hide(check); checkBtn.setAttribute('aria-expanded', 'false'); });
      dockCheck();
      if (refresh) {
        list.scrollTop = keepScroll;
        return result;
      }
      show(check);
      checkBtn.setAttribute('aria-expanded', 'true');
      head.querySelector('.ez-sheet-x').focus();
      return result;
    }
    checkBtn.addEventListener('click', function () {
      if (!check.hidden) { hide(check); checkBtn.setAttribute('aria-expanded', 'false'); return; }
      openCheck();
    });

    // Keep the badge current without slowing typing: only when idle, at most every 1.5s.
    var badgeTimer = 0;
    function scheduleBadge() {
      clearTimeout(badgeTimer);
      badgeTimer = setTimeout(function () {
        var go = function () {
          try {
            if (!check.hidden) openCheck({ refresh: true });
            else paintBadge(runCheck());
          } catch (err) {}
        };
        if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 2000 });
        else go();
      }, 1500);
    }
    editor.on('update', scheduleBadge);
    scheduleBadge();
    window.addEventListener('resize', function () { if (!check.hidden) dockCheck(); });

    function hideAll() {
      Array.prototype.forEach.call(document.querySelectorAll('.ez-overlay'), function (node) { hide(node); });
      checkBtn.setAttribute('aria-expanded', 'false');
    }

    // ---- Keys (parent page and canvas) ------------------------------------------------
    function onKey(event) {
      var t = event.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      var k = (event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && k === 'k') {
        event.preventDefault();
        event.stopPropagation();
        if (!pal.hidden) hide(pal);
        else openPalette();
        return;
      }
      if (event.key === 'Escape' && anyOpen()) {
        event.preventDefault();
        event.stopPropagation();
        hideAll();
        return;
      }
      if (anyOpen(true)) return;
      if (!typing && event.key === '?' && !api.preview()) {
        event.preventDefault();
        openKeys();
      }
    }
    document.addEventListener('keydown', onKey, true);
    function hookCanvas() {
      var d = canvasDoc();
      if (d && !d.__ezStudio) {
        d.__ezStudio = true;
        d.addEventListener('keydown', onKey, true);
      }
    }
    hookCanvas();
    app.frame().addEventListener('load', hookCanvas);

    window.EzStudio = { openPalette: openPalette, openCheck: openCheck, runCheck: runCheck, openKeys: openKeys, hideAll: hideAll };
  });
})();
