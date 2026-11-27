// Email export. This file turns the canvas HTML into the message that
// Salesforce and old Outlook receive. It has no third-party dependencies.
// The editor hands it a small surface: getHtml, Canvas.getFrameEl, loadHtml.
(function () {
  var TITLE_KEY = 'newsletter-project-email-title';
  var LANG_KEY = 'newsletter-project-email-lang';
  var LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'nl'];

  function escapeText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function decodeText(value) {
    var el = document.createElement('textarea');
    el.innerHTML = value;
    return el.value;
  }

  function isMjml(raw) {
    return /<\s*mjml[\s>]/i.test(raw) || /<\s*mj-[\w-]+/i.test(raw);
  }

  function stripActive(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1=$2#$2');
  }

  // Splits a style attribute on ";" outside quotes and parentheses, so
  // font-family:'A;B' or url(data:...;base64,...) stays in one piece.
  function splitStyle(style) {
    var parts = [];
    var text = String(style || '');
    var start = 0, quote = '', depth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && !depth) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  }

  function styleToObject(style) {
    var out = {};
    splitStyle(style).forEach(function (part) {
      var index = part.indexOf(':');
      if (index === -1) return;
      var key = part.slice(0, index).trim();
      var value = part.slice(index + 1).trim();
      if (key && value) out[key] = value;
    });
    return out;
  }

  function split(raw) {
    var source = String(raw || '').trim();
    if (!source) return { error: 'Paste some HTML first.' };
    if (isMjml(source)) {
      return { error: 'That is MJML. Paste the HTML version of the email. This editor reads and writes HTML only.' };
    }

    var titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var title = titleMatch ? decodeText(titleMatch[1]).trim() : '';
    var htmlTag = source.match(/<html\b([^>]*)>/i);
    var lang = htmlTag ? cleanLang(decodeText((htmlTag[1].match(/\slang\s*=\s*(['"]?)([^"'\s>]*)\1/i) || [])[2] || '')) : '';
    var bodyTag = source.match(/<body([^>]*)>/i);
    var bodyAttrs = bodyTag ? bodyTag[1] : '';
    var styles = [];
    var withoutScripts = stripActive(source).replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, function (_, css) {
      styles.push(css);
      return '';
    });

    var css = styles.join('\n');
    var fluid = fluidWidths(css);
    var html = dropEmptyConditionals(withoutScripts);
    var bodyInner = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyInner) {
      html = bodyInner[1];
    } else {
      html = html
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<\/?(html|head)[^>]*>/gi, '')
        .replace(/<title[\s\S]*?<\/title>/gi, '')
        .replace(/<meta\b[^>]*>/gi, '')
        .replace(/<link\b[^>]*>/gi, '');
    }

    html = html.trim();
    if (!html) return { error: 'No email content was found in that HTML.' };

    return {
      html: html,
      css: dropOwnCss(css),
      fluid: fluid,
      title: title,
      lang: lang,
      bodyAttrs: bodyAttrs
    };
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  // Outlook keeps the drawn button in a conditional comment. The browser drops
  // that comment, so a button with no HTML copy is rebuilt as a normal one.
  function msoButtonHtml(fragment) {
    var href = (String(fragment).match(/\shref\s*=\s*(['"])(.*?)\1/i) || [])[2] || '';
    var labelHtml = (String(fragment).match(/<center[^>]*>([\s\S]*?)<\/center>/i) || [])[1] || '';
    var label = labelHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!href && !label) return '';
    var fill = (String(fragment).match(/\sfillcolor\s*=\s*(['"]?)(#[0-9a-f]{3,8}|[a-z]+)\1/i) || [])[2] || '';
    var color = (String(fragment).match(/(?:^|[;{])\s*color\s*:\s*([^;"']+)/i) || [])[1] || '#ffffff';
    var size = (String(fragment).match(/font-size\s*:\s*([^;"']+)/i) || [])[1] || '15px';
    var family = (String(fragment).match(/font-family\s*:\s*([^;"']+)/i) || [])[1] || 'Arial, Helvetica, sans-serif';
    var bg = fill ? 'background-color:' + fill + ';' : '';
    var bgAttr = fill ? ' bgcolor="' + escapeAttr(fill) + '"' : '';
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" ' +
      'style="border-collapse:collapse;">' +
      '<tr><td align="center"' + bgAttr + ' style="' + bg + 'border-radius:4px;text-align:center;mso-padding-alt:12px 22px;">' +
      '<a href="' + escapeAttr(href || '#') + '" style="display:inline-block;padding:12px 22px;' + bg +
      'color:' + escapeAttr(color.trim()) + ';font-family:' + escapeAttr(family.trim()) +
      ';font-size:' + escapeAttr(size.trim()) + ';font-weight:700;line-height:1.2;text-decoration:none;border-radius:4px;">' +
      escapeText(label || 'Button') + '</a></td></tr></table>';
  }

  function hrefsIn(html) {
    var found = [];
    var re = /\shref\s*=\s*(['"])(.*?)\1/gi;
    var match;
    while ((match = re.exec(html))) found.push(match[2]);
    return found;
  }

  function documentHasHref(doc, href) {
    if (!href) return false;
    var links = doc.body.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('href') === href) return true;
    }
    return false;
  }

  function rescueMsoButtons(html) {
    if (!html || html.indexOf('[if') === -1) return html;
    var doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    var comments = [];
    function walk(node) {
      var child = node.firstChild;
      while (child) {
        var next = child.nextSibling;
        if (child.nodeType === 8) comments.push(child);
        else if (child.nodeType === 1) walk(child);
        child = next;
      }
    }
    walk(doc.body);
    comments.forEach(function (comment) {
      var text = comment.nodeValue || '';
      if (!/\[if\s+[^\]]*mso/i.test(text) || /\[if\s+!/i.test(text)) return;
      var inner = text.replace(/^\s*\[if[^\]]*\]\s*>?/i, '').replace(/<!\[endif\]\s*$/i, '').trim();
      if (!/<a\b/i.test(inner) && !/<v:roundrect\b/i.test(inner)) return;
      var hrefs = hrefsIn(inner);
      if (hrefs.some(function (href) { return documentHasHref(doc, href); })) return;
      var usable = inner
        .replace(/<v:[\w:-]+[^>]*>[\s\S]*?<\/v:[\w:-]+>/gi, '')
        .replace(/<v:[\w:-]+[^>]*\/?>/gi, '')
        .replace(/<\/?(?:w|o):[\w:-]+[^>]*>/gi, '')
        .trim();
      var replacement = /<a\b/i.test(usable) ? usable : msoButtonHtml(inner);
      if (!replacement) return;
      var holder = doc.createElement('div');
      holder.innerHTML = replacement;
      var parent = comment.parentNode;
      if (!parent) return;
      while (holder.firstChild) parent.insertBefore(holder.firstChild, comment);
      parent.removeChild(comment);
    });
    return doc.body.innerHTML;
  }

  // Paste HTML of an EzBuilder export. The export adds Outlook copies, width
  // pins, helper classes and an email column. Kept in the canvas, the next
  // export adds them again, so each round trip grew the email. They are taken
  // out here and the next export writes them fresh.
  var OWN_CLASS = /^(?:nl-ow\d+|nl-pct|nl-full|nl-vbg)$/;
  var BOX_OPEN = /^\[if mso\]><table role="presentation" align="center" width="\d+"[^>]*><tr><td width="\d+"[^>]*><!\[endif\]$/i;
  var BOX_CLOSE = /^\[if mso\]><\/td><\/tr><\/table><!\[endif\]$/i;
  var VML_OPEN = /^\[if gte mso 9\]><table role="presentation" align="center"[^>]*><tr><td[^>]*><v:rect\b[\s\S]*<v:textbox\b[^>]*><!\[endif\]$/i;
  var VML_CLOSE = /^\[if gte mso 9\]><\/v:textbox><\/v:rect><\/td><\/tr><\/table><!\[endif\]$/i;
  var OUTLOOK_COPY = /^\[if mso\]>(?:<table role="presentation" width="\d+" cellpadding="0" cellspacing="0" border="0" style="width:\d+px;?">(?:<tbody>|<tr>)|<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="(?:left|center)"><tbody>|<a\b[^>]*\bdata-nl-ol="1")[\s\S]*<!\[endif\]$/i;
  var ALIGN_OPEN = /^\[if mso\]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;?"><tr><td align="(?:left|center|right)"[^>]*>(?:<table role="presentation" align="(?:left|center|right)" width="\d+"[^>]*><tr><td width="\d+"[^>]*>)?<!\[endif\]$/i;
  var ALIGN_CLOSE = /^\[if mso\]><\/td><\/tr><\/table>(?:<\/td><\/tr><\/table>)?<!\[endif\]$/i;
  var REVEAL_OPEN = /^\[if !mso\]><!$/i;
  var REVEAL_CLOSE = /^<!\[endif\]$/i;

  function fluidWidths(css) {
    var map = {};
    String(css || '').replace(/\.nl-ow(\d+)\s*\{([^}]*)\}/g, function (rule, n, body) {
      var width = (body.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?%)/i) || [])[1];
      if (width) map[n] = width;
      return rule;
    });
    return map;
  }

  // The width rules and the VML behavior rule are written by every export.
  function dropOwnCss(css) {
    return String(css || '')
      .replace(/\.nl-(?:ow\d+|vbg)\s*\{[^}]*\}/g, '')
      .replace(/[^{}]*\.nl-fixed-[\w-]+[^{}]*\{[^}]*\}/g, '')
      .replace(/[vo]\\:\*\s*\{[^}]*\}/g, '')
      .replace(/^\s+$/gm, '')
      .trim();
  }

  // Taking the style blocks out leaves their conditional comments empty.
  function dropEmptyConditionals(html) {
    return String(html || '')
      .replace(/<!--\[if [^\]]+\]>\s*<!\[endif\]-->/gi, '')
      .replace(/<!--\[if !mso\]><!-->\s*<!--<!\[endif\]-->/gi, '');
  }

  function commentText(node) {
    return String(node.nodeValue || '').replace(/>\s+</g, '><').trim();
  }

  function isComment(node, re) {
    return !!(node && node.nodeType === 8 && re.test(commentText(node)));
  }

  function nextNode(node) {
    var next = node && node.nextSibling;
    while (next && next.nodeType === 3 && !next.nodeValue.trim()) next = next.nextSibling;
    return next;
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function unwrapNode(node) {
    var parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  }

  function allComments(root) {
    var found = [];
    (function walk(node) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 8) found.push(child);
        else if (child.nodeType === 1) walk(child);
      }
    })(root);
    return found;
  }

  function compactStyle(el) {
    return String(el.getAttribute('style') || '').replace(/\s+/g, '').replace(/;$/, '').toLowerCase();
  }

  function onlyElement(node) {
    var found = null;
    for (var child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3 && !child.nodeValue.trim()) continue;
      if (child.nodeType !== 1 || found) return null;
      found = child;
    }
    return found;
  }

  // The single cell of a table, through the tbody the parser adds.
  function soleCell(table) {
    if (!table || table.tagName !== 'TABLE') return null;
    var body = onlyElement(table);
    if (body && body.tagName === 'TBODY') body = onlyElement(body);
    if (!body || body.tagName !== 'TR') return null;
    var cell = onlyElement(body);
    return cell && cell.tagName === 'TD' ? cell : null;
  }

  // heightLock: a table that only pins the height for Word.
  function isHeightLock(table) {
    if (!table || table.tagName !== 'TABLE' || table.getAttribute('role') !== 'presentation') return false;
    var w = table.getAttribute('width');
    var h = table.getAttribute('height');
    if (!/^\d+$/.test(w || '') || !/^\d+$/.test(h || '')) return false;
    if (compactStyle(table) !== 'width:' + w + 'px;height:' + h + 'px;border-collapse:collapse') return false;
    var cell = soleCell(table);
    return !!(cell && cell.getAttribute('height') === h && cell.getAttribute('valign'));
  }

  function undoOutlookComments(root) {
    allComments(root).forEach(function (comment) {
      if (!comment.parentNode) return;
      if (isComment(comment, OUTLOOK_COPY)) {
        var open = nextNode(comment);
        if (!isComment(open, REVEAL_OPEN)) return;
        var shown = nextNode(open);
        var close = shown && nextNode(shown);
        if (!shown || shown.nodeType !== 1 || !isComment(close, REVEAL_CLOSE)) return;
        removeNode(comment);
        removeNode(open);
        removeNode(close);
      } else if (isComment(comment, BOX_OPEN)) {
        var table = nextNode(comment);
        var after = table && nextNode(table);
        if (!table || table.tagName !== 'TABLE' || !isComment(after, BOX_CLOSE)) return;
        removeNode(comment);
        removeNode(after);
      } else if (isComment(comment, ALIGN_OPEN)) {
        // Other Outlook copies can sit between the shell's two comments.
        var closer = nextNode(comment);
        while (closer && !isComment(closer, ALIGN_CLOSE)) closer = nextNode(closer);
        if (!closer) return;
        removeNode(comment);
        removeNode(closer);
      } else if (isComment(comment, VML_OPEN)) {
        var holder = nextNode(comment);
        var end = holder && nextNode(holder);
        if (!holder || holder.tagName !== 'DIV' || compactStyle(holder) !== 'margin:0' || !isComment(end, VML_CLOSE)) return;
        removeNode(comment);
        removeNode(end);
        var lock = onlyElement(holder);
        if (isHeightLock(lock)) {
          var cell = soleCell(lock);
          while (cell.firstChild) holder.insertBefore(cell.firstChild, lock);
          removeNode(lock);
        }
        unwrapNode(holder);
      }
    });
  }

  function undoWidthPins(root, fluid) {
    Array.prototype.forEach.call(root.querySelectorAll('[class]'), function (el) {
      var names = String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      if (!names.some(function (name) { return OWN_CLASS.test(name); })) return;
      var slot = names.map(function (name) { return (name.match(/^nl-ow(\d+)$/) || [])[1]; }).filter(Boolean)[0];
      var keep = names.filter(function (name) { return !OWN_CLASS.test(name); });
      if (keep.length) el.setAttribute('class', keep.join(' '));
      else el.removeAttribute('class');
      var style = dropDecl(el.getAttribute('style') || '', 'mso-width-alt');
      var pct = slot && fluid ? fluid[slot] : '';
      if (pct) {
        style = replaceDecl(style, 'width', pct);
        if (el.hasAttribute('width')) el.setAttribute('width', pct);
      }
      style = style.replace(/^\s*;+|;+\s*$/g, '').trim();
      if (style) el.setAttribute('style', style);
      else el.removeAttribute('style');
    });
    // A narrow aligned table gets mso-width-alt from its pixel width on
    // export (outlookAlignment). It is written again from the width.
    Array.prototype.forEach.call(root.querySelectorAll('table[style*="mso-width-alt"]'), function (el) {
      var style = dropDecl(el.getAttribute('style') || '', 'mso-width-alt').replace(/^\s*;+|;+\s*$/g, '').trim();
      if (style) el.setAttribute('style', style);
      else el.removeAttribute('style');
    });
  }

  // emailColumn: the 100% table and the centered 600px table around everything.
  function undoEmailColumn(body) {
    if (undoFixedColumn(body)) return;
    var outer = onlyElementIgnoringComments(body);
    var outerCell = soleCell(outer);
    if (!outerCell || outer.getAttribute('role') !== 'presentation' || outer.getAttribute('width') !== '100%') return;
    if (compactStyle(outer).replace(/;?min-width:100%/, '') !== 'width:100%;border-collapse:collapse') return;
    var column = onlyElement(outerCell);
    var columnCell = soleCell(column);
    if (!columnCell || column.getAttribute('role') !== 'presentation' || column.getAttribute('width') !== '600') return;
    if (!/^width:600px;max-width:600px;border-collapse:collapse/.test(compactStyle(column))) return;
    while (columnCell.firstChild) body.insertBefore(columnCell.firstChild, outer);
    removeNode(outer);
  }

  // fixedColumn: the shell that keeps a fixed-width email at 600px.
  function undoFixedColumn(body) {
    var outer = onlyElementIgnoringComments(body);
    if (!outer || outer.tagName !== 'TABLE' || !/(?:^|\s)nl-fixed-page(?:\s|$)/.test(outer.getAttribute('class') || '')) return false;
    var column = outer.querySelector('table.nl-fixed-600');
    var cell = column && column.rows[0] && column.rows[0].cells[0];
    if (!cell) return false;
    Array.prototype.forEach.call(column.querySelectorAll('td.nl-fixed-gmail'), function (gmail) {
      var row = gmail.parentElement;
      if (row && row.parentNode) row.parentNode.removeChild(row);
    });
    while (cell.firstChild) body.insertBefore(cell.firstChild, outer);
    removeNode(outer);
    return true;
  }

  function onlyElementIgnoringComments(node) {
    var found = null;
    for (var child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 8 || (child.nodeType === 3 && !child.nodeValue.trim())) continue;
      if (child.nodeType !== 1 || found) return null;
      found = child;
    }
    return found;
  }

  function isSpacerRowCell(cell) {
    var h = cell && cell.getAttribute('height');
    if (!/^\d+$/.test(h || '') || cell.parentElement.getAttribute('height') !== h) return false;
    if (String(cell.textContent).replace(/\u00a0/g, '').trim() || cell.children.length) return false;
    return compactStyle(cell) === 'mso-line-height-rule:exactly;mso-line-height-alt:' + h + 'px;height:' + h + 'px;line-height:' + h + 'px;font-size:' + h + 'px';
  }

  // gapTable: a spacer row that stood in for a table's top or bottom margin.
  function gapHeight(table) {
    if (!table || table.tagName !== 'TABLE' || table.getAttribute('role') !== 'presentation' || table.getAttribute('width') !== '100%') return 0;
    if (compactStyle(table) !== 'width:100%;border-collapse:collapse') return 0;
    var cell = soleCell(table);
    return isSpacerRowCell(cell) ? parseInt(cell.getAttribute('height'), 10) : 0;
  }

  function isGapCell(cell) {
    if (!cell || cell.tagName !== 'TD' || cell.getAttribute('valign') !== 'top') return 0;
    var px = cell.getAttribute('width');
    if (!/^\d+$/.test(px || '') || compactStyle(cell) !== 'width:' + px + 'px;font-size:0;line-height:0') return 0;
    var inner = onlyElement(cell);
    return inner && inner.tagName === 'TABLE' && inner.getAttribute('width') === px ? parseInt(px, 10) : 0;
  }

  function elementKids(node) {
    return Array.prototype.filter.call(node.children, function () { return true; });
  }

  function rowOf(table) {
    var body = onlyElement(table);
    if (body && body.tagName === 'TBODY') body = onlyElement(body);
    return body && body.tagName === 'TR' ? body : null;
  }

  // pinButton: the 100% shell with gap cells that stood in for a button's
  // left or right margin. Gives back the button table with its margin.
  function undoButtonShell(shell) {
    if (compactStyle(shell) !== 'width:100%;border-collapse:collapse' || shell.getAttribute('width') !== '100%') return false;
    var row = rowOf(shell);
    if (!row) return false;
    var left = 0;
    var right = 0;
    var hold = null;
    var extra = false;
    elementKids(row).forEach(function (cell) {
      var gap = isGapCell(cell);
      if (gap) {
        if (hold) right = gap;
        else left = gap;
      } else if (!hold && cell.tagName === 'TD' && cell.getAttribute('align') === 'left') {
        hold = cell;
      } else {
        extra = true;
      }
    });
    if (!hold || extra) return false;
    var first = elementKids(hold)[0];
    var button = null;
    var margin = null;
    if (elementKids(hold).length === 1 && first.tagName === 'TABLE' && first.getAttribute('align') !== 'right') {
      button = first;
      margin = { left: left + 'px', right: right + 'px' };
    } else if (first && first.tagName === 'TABLE' && first.getAttribute('align') === 'right' && /float:right/.test(compactStyle(first))) {
      // Right-aligned: a floated group with the button and the right gap.
      var groupRow = rowOf(first);
      var groupCells = groupRow ? elementKids(groupRow) : [];
      var inner = groupCells[0] && onlyElement(groupCells[0]);
      if (!inner || inner.tagName !== 'TABLE') return false;
      button = inner;
      margin = { left: 'auto', right: (isGapCell(groupCells[1]) || 0) + 'px' };
    }
    if (!button) return false;
    var style = replaceDecl(button.getAttribute('style') || '', 'margin-left', margin.left);
    button.setAttribute('style', replaceDecl(style, 'margin-right', margin.right));
    shell.parentNode.insertBefore(button, shell);
    removeNode(shell);
    return true;
  }

  function undoTableMargins(root) {
    Array.prototype.slice.call(root.querySelectorAll('table[role="presentation"][width="100%"]')).forEach(function (table) {
      if (table.parentNode) undoButtonShell(table);
    });
    Array.prototype.slice.call(root.querySelectorAll('table[role="presentation"][width="100%"]')).forEach(function (gap) {
      var height = gapHeight(gap);
      if (!height || !gap.parentNode) return;
      var prev = gap.previousElementSibling;
      var next = gap.nextElementSibling;
      var owner = prev && prev.tagName === 'TABLE' && !gapHeight(prev) ? prev : null;
      var side = 'margin-bottom';
      if (!owner && next && next.tagName === 'TABLE' && !gapHeight(next)) {
        owner = next;
        side = 'margin-top';
      }
      if (!owner) return;
      owner.setAttribute('style', replaceDecl(owner.getAttribute('style') || '', side, height + 'px'));
      removeNode(gap);
    });
  }

  function undoExport(html, fluid) {
    if (!html || !/nl-pct|data-nl-ol|v:rect|\[if mso\]/i.test(html)) return html;
    var doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = html;
    undoOutlookComments(doc.body);
    undoWidthPins(doc.body, fluid);
    undoTableMargins(doc.body);
    Array.prototype.forEach.call(doc.body.querySelectorAll('[data-nl-ol-align]'), function (el) {
      el.removeAttribute('align');
      el.removeAttribute('data-nl-ol-align');
    });
    Array.prototype.forEach.call(doc.body.querySelectorAll('[data-nl-ol-cell-align]'), function (el) {
      el.removeAttribute('align');
      el.removeAttribute('data-nl-ol-cell-align');
      var style = dropDecl(el.getAttribute('style') || '', 'text-align').replace(/^\s*;+|;+\s*$/g, '').trim();
      if (style) el.setAttribute('style', style);
      else el.removeAttribute('style');
    });
    Array.prototype.forEach.call(doc.body.querySelectorAll('[data-nl-ol-was-align]'), function (el) {
      el.setAttribute('align', el.getAttribute('data-nl-ol-was-align'));
      el.removeAttribute('data-nl-ol-was-align');
    });
    undoEmailColumn(doc.body);
    return doc.body.innerHTML;
  }

  // The editor keeps `.class` rules, and drops `a.class` into an extra selector the
  // style panel does not edit. Promote that simple form so the panel edits the
  // rule that actually paints.
  function promoteTagClassRules(editor) {
    if (!editor || !editor.Css || !editor.Selectors) return;
    var rules = editor.Css.getRules ? editor.Css.getRules() : [];
    rules.forEach(function (rule) {
      if (!rule || !rule.get) return;
      if (rule.get('mediaText') || rule.get('atRuleType') || rule.get('state')) return;
      var sels = rule.get('selectors');
      if (sels && sels.length) return;
      var extra = String(rule.get('selectorsAdd') || '').trim();
      if (!extra || extra.indexOf(',') !== -1 || /[:\s>+~]/.test(extra)) return;
      var match = extra.match(/^[a-z][\w-]*((?:\.[\w-]+)+)$/i);
      if (!match) return;
      var names = match[1].slice(1).split('.');
      names.forEach(function (name) {
        var selector = editor.Selectors.add({ name: name, label: name });
        if (selector && sels && sels.add) sels.add(selector);
      });
      if (sels && sels.length) rule.set('selectorsAdd', '');
    });
  }

  function applyBodyChrome(editor, bodyAttrs) {
    if (!bodyAttrs) return;
    var wrapper = editor.getWrapper();
    var style = (bodyAttrs.match(/style\s*=\s*(['"])([\s\S]*?)\1/i) || [])[2];
    var bg = (bodyAttrs.match(/bgcolor\s*=\s*(['"])?([^"'\s>]+)\1?/i) || [])[2];
    var rules = style ? styleToObject(style) : {};
    if (bg && !rules['background-color']) rules['background-color'] = bg;
    if (Object.keys(rules).length) wrapper.addStyle(rules);
  }

  function canvasIsEmpty(editor) {
    var html = editor.getHtml() || '';
    var text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    return text.length === 0;
  }

  function importHtml(editor, raw, options) {
    var parsed = split(raw);
    if (parsed.error) return parsed;
    var force = options && options.force;
    if (!force && !canvasIsEmpty(editor)) {
      var ok = window.confirm('Replace the current email with this HTML?');
      if (!ok) return { cancelled: true };
    }

    // A fixed-width export (Copy HTML or Copy body) turns Fixed 600px width back on.
    var pastedFixed = /\bnl-fixed-600\b/.test(parsed.html);
    parsed.html = stripLeakedClosers(rescueMsoButtons(undoExport(parsed.html, parsed.fluid)));
    if (typeof editor.loadHtml === 'function') {
      editor.loadHtml(parsed.html, parsed.css || '');
      var pastedRules = {};
      if (parsed.bodyAttrs) {
        var pastedStyle = (parsed.bodyAttrs.match(/style\s*=\s*(['"])([\s\S]*?)\1/i) || [])[2];
        var pastedBg = (parsed.bodyAttrs.match(/bgcolor\s*=\s*(['"])?([^"'\s>]+)\1?/i) || [])[2];
        pastedRules = pastedStyle ? styleToObject(pastedStyle) : {};
        if (pastedBg && !pastedRules['background-color']) pastedRules['background-color'] = pastedBg;
      }
      if (pastedFixed || isFixedBody('min-width:' + (pastedRules['min-width'] || ''))) pastedRules['min-width'] = FIXED_WIDTH + 'px';
      else if (!pastedRules['min-width']) pastedRules['min-width'] = '';
      if (editor.setBodyStyle) editor.setBodyStyle(pastedRules);
      if (parsed.title) {
        try { localStorage.setItem(TITLE_KEY, parsed.title); } catch (err) {}
      }
      if (parsed.lang) {
        try { localStorage.setItem(LANG_KEY, parsed.lang); } catch (err) {}
      }
      paintEmailSettings();
      if (editor.trigger) editor.trigger('update');
      return parsed;
    }
    editor.Components.clear();
    editor.Css.clear();
    // setStyle replaces every CSS rule. Inline styles become rules while the
    // components render, so the stylesheet has to be loaded before that.
    if (parsed.css.trim()) editor.setStyle(parsed.css);
    promoteTagClassRules(editor);
    editor.setComponents(parsed.html);
    applyBodyChrome(editor, parsed.bodyAttrs);
    if (parsed.title) {
      try { localStorage.setItem(TITLE_KEY, parsed.title); } catch (err) {}
    }
    if (parsed.lang) {
      try { localStorage.setItem(LANG_KEY, parsed.lang); } catch (err) {}
    }
    paintEmailSettings();
    return parsed;
  }

  function emailTitle() {
    try {
      return localStorage.getItem(TITLE_KEY) || 'Newsletter';
    } catch (err) {
      return 'Newsletter';
    }
  }

  // A language tag such as en, es-MX or pt-BR. Anything else is dropped.
  function cleanLang(value) {
    var lang = String(value || '').trim();
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(lang) ? lang : '';
  }

  function emailLang() {
    try {
      return cleanLang(localStorage.getItem(LANG_KEY)) || 'en';
    } catch (err) {
      return 'en';
    }
  }

  // The Title and Lang fields in the top toolbar. Both are kept in
  // localStorage next to the saved email, and Paste HTML fills them in.
  function paintEmailSettings(only) {
    var titleField = document.getElementById('nl-email-title');
    var langField = document.getElementById('nl-email-lang');
    var customField = document.getElementById('nl-email-lang-custom');
    if (titleField && only !== 'lang' && document.activeElement !== titleField) titleField.value = emailTitle();
    if (!langField || only === 'title') return;
    var lang = emailLang();
    var known = LANGS.indexOf(lang.toLowerCase()) !== -1;
    langField.value = known ? lang.toLowerCase() : 'custom';
    if (customField) {
      customField.hidden = known;
      if (!known && document.activeElement !== customField) customField.value = lang;
    }
  }

  function bindEmailSettings(editor) {
    var titleField = document.getElementById('nl-email-title');
    var langField = document.getElementById('nl-email-lang');
    var customField = document.getElementById('nl-email-lang-custom');
    if (!titleField || !langField) return;
    function changed() { editor.trigger('nl-email-settings'); }
    titleField.addEventListener('input', function () {
      var value = titleField.value.trim();
      try {
        if (value) localStorage.setItem(TITLE_KEY, value);
        else localStorage.removeItem(TITLE_KEY);
      } catch (err) {}
      changed();
    });
    titleField.addEventListener('blur', function () { paintEmailSettings('title'); });
    function saveLang(value) {
      var lang = cleanLang(value);
      if (!lang) return;
      try { localStorage.setItem(LANG_KEY, lang); } catch (err) {}
      changed();
    }
    langField.addEventListener('change', function () {
      if (langField.value !== 'custom') {
        if (customField) customField.hidden = true;
        saveLang(langField.value);
        return;
      }
      if (!customField) return;
      customField.hidden = false;
      if (LANGS.indexOf(customField.value.toLowerCase()) !== -1) customField.value = '';
      customField.focus();
    });
    if (customField) {
      customField.addEventListener('input', function () {
        var ok = !customField.value.trim() || !!cleanLang(customField.value);
        customField.setAttribute('aria-invalid', ok ? 'false' : 'true');
        saveLang(customField.value);
      });
      customField.addEventListener('blur', function () {
        customField.setAttribute('aria-invalid', 'false');
        paintEmailSettings('lang');
      });
    }
    paintEmailSettings();
  }

  function inlinedFragment(editor) {
    if (!editor || typeof editor.runCommand !== 'function') {
      return editor && editor.getHtml ? editor.getHtml() : '';
    }
    var original = editor.getHtml.bind(editor);
    editor.getHtml = function (opts) {
      opts = opts || {};
      if (opts.cleanId == null) opts.cleanId = true;
      return original(opts);
    };
    try {
      return editor.runCommand('ez-get-inlined-html', { preserveMediaQueries: true }) || '';
    } finally {
      editor.getHtml = original;
    }
  }

  function bodyStyle(editor) {
    var style = editor.getWrapper().getStyle() || {};
    var parts = ['margin:0', 'padding:0'];
    Object.keys(style).forEach(function (key) {
      if (style[key] == null || style[key] === '') return;
      if (key === 'margin' || key === 'padding') return;
      parts.push(key + ':' + style[key]);
    });
    return parts.join(';');
  }

  // A font set on the text stays. The body only gains Arial when nothing chose one.
  function ensureBodyFont(openTag) {
    if (/font-family\s*:/i.test(openTag)) return openTag;
    if (/style\s*=\s*(['"])/i.test(openTag)) {
      return openTag.replace(/style\s*=\s*(['"])/i, 'style=$1font-family:' + EMAIL_FONT + ';');
    }
    return openTag.replace(/<body\b/i, '<body style="font-family:' + EMAIL_FONT + ';"');
  }

  // A table that is already 600px wide is the email column. Wrapping it again would nest a second shell.
  function hasEmailColumn(html) {
    var head = String(html).slice(0, 4000);
    if (/<table\b[^>]*\bwidth\s*=\s*(['"]?)\s*600(?:px)?(?!\d)\s*\1/i.test(head)) return true;
    if (/<table\b[^>]*\bstyle\s*=\s*(['"])[^'"]*\bwidth\s*:\s*600px\b/i.test(head)) return true;
    return false;
  }

  function emailColumn(inner) {
    if (hasEmailColumn(inner)) return inner;
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">' +
      '<tr><td align="center">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600" style="width:600px;max-width:600px;border-collapse:collapse;">' +
      '<tr><td>' + inner + '</td></tr>' +
      '</table></td></tr></table>';
  }

  // Fixed width (Page settings): the email keeps its 600px look on phones. The
  // editor keeps it as min-width:600px on the page. The export puts the column
  // in a shell that will not shrink: min-width on the tables and cells for
  // Apple Mail, Outlook and most webmail, a no-wrap line that Gmail's apps
  // cannot squeeze, and !important rules that win over a template's phone
  // rules (the Salesforce template sets 600px tables to 100% on phones).
  var FIXED_WIDTH = 600;

  function isFixedBody(style) {
    return /(?:^|;)\s*min-width\s*:\s*600px\s*(?:!important\s*)?(?:;|$)/i.test(String(style || ''));
  }

  function fixedColumn(inner) {
    var nbsp = [];
    for (var i = 0; i < 33; i++) nbsp.push('&nbsp;');
    return '<table role="presentation" class="nl-fixed-page" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;min-width:' + FIXED_WIDTH + 'px;border-collapse:collapse;">' +
      '<tr><td align="center" class="nl-fixed-cell" style="min-width:' + FIXED_WIDTH + 'px;">' +
      '<table role="presentation" class="nl-fixed-600" cellpadding="0" cellspacing="0" border="0" align="center" width="' + FIXED_WIDTH + '" style="width:' + FIXED_WIDTH + 'px;min-width:' + FIXED_WIDTH + 'px;max-width:' + FIXED_WIDTH + 'px;border-collapse:collapse;">' +
      '<tr><td class="nl-fixed-cell" width="' + FIXED_WIDTH + '" style="width:' + FIXED_WIDTH + 'px;min-width:' + FIXED_WIDTH + 'px;">' + inner + '</td></tr>' +
      '<tr><td class="nl-fixed-gmail" style="min-width:' + FIXED_WIDTH + 'px;font-size:0;line-height:0;mso-line-height-rule:exactly;mso-hide:all;">' +
      '<div style="white-space:nowrap;font:15px courier;line-height:0;color:transparent;mso-hide:all;">' + nbsp.join(' ') + '</div></td></tr>' +
      '</table></td></tr></table>';
  }

  function fixedCss() {
    var px = FIXED_WIDTH + 'px';
    // :has() is in its own block: a client that cannot read it drops only that block.
    return '<style type="text/css">table.nl-fixed-600.nl-fixed-600{width:' + px + ' !important;min-width:' + px + ' !important;max-width:' + px + ' !important;}' +
      'table.nl-fixed-page.nl-fixed-page,td.nl-fixed-cell.nl-fixed-cell,td.nl-fixed-gmail.nl-fixed-gmail{min-width:' + px + ' !important;}</style>' +
      '<style type="text/css">.email-shell:has(.nl-fixed-600),.stylingblock-content-wrapper:has(.nl-fixed-600){width:' + px + ' !important;min-width:' + px + ' !important;max-width:none !important;}</style>';
  }

  function exportHtml(editor) {
    var fragment = String(inlinedFragment(editor)).trim();
    var styles = [];
    var markup = fragment.replace(/<style[\s\S]*?<\/style>/gi, function (tag) {
      styles.push(tag);
      return '';
    }).trim();

    // The editor canvas is already a body element. Reuse it instead of nesting a second one.
    var bodyOpen = '<body style="' + escapeText(bodyStyle(editor)) + '">';
    var inner = markup;
    var wrapped = markup.match(/^<body(\s[^>]*)?>([\s\S]*)<\/body>$/i);
    if (wrapped) {
      var attrs = (wrapped[1] || '').replace(/\sid=(['"])[\s\S]*?\1/i, '');
      bodyOpen = '<body' + attrs + '>';
      inner = wrapped[2].trim();
    }
    bodyOpen = ensureBodyFont(bodyOpen).replace(/\sstyle=(['"])([\s\S]*?)\1/i, function (_, quote, style) {
      return ' style=' + quote + declarations(style).join(';') + quote;
    });
    var fixed = isFixedBody((bodyOpen.match(/\sstyle=(['"])([\s\S]*?)\1/i) || [])[2]);
    inner = fixed ? fixedColumn(inner) : emailColumn(inner);
    var sized = outlookSizes(inner, editor);
    inner = outlookBackgrounds(sized.html, measureBackgroundHeights(editor));
    if (sized.css) inner = sized.css + inner;
    if (fixed) inner = fixedCss() + inner;

    var title = escapeText(emailTitle());
    var lang = escapeAttr(emailLang());
    var usesVml = /<v:fill\b/i.test(inner);
    var htmlOpen = usesVml
      ? '<html lang="' + lang + '" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
      : '<html lang="' + lang + '">';
    var msoHead = usesVml
      ? '<!--[if gte mso 9]>\n<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>\n' +
        '<style>v\\:* { behavior:url(#default#VML); display:inline-block; } o\\:* { behavior:url(#default#VML); }</style>\n<![endif]-->\n'
      : '';
    var documentHtml = '<!DOCTYPE html>\n' + htmlOpen + '\n<head>\n<meta charset="utf-8">\n' +
      (fixed ? '<meta name="viewport" content="width=' + FIXED_WIDTH + '">\n' : '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n') +
      '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n<title>' + title + '</title>\n' +
      msoHead + styles.join('\n') + '\n</head>\n' + bodyOpen + '\n' + inner + '\n</body>\n</html>\n';
    return restoreMergeCode(indentHtml(stripEditorBoxSizing(documentHtml)));
  }

  // Salesforce reads %%= ... =%% before it decodes HTML. A comparison written
  // as &gt; is not the operator, so the block is ignored. Put the characters
  // back only inside those blocks. The rest of the email stays escaped.
  function restoreMergeCode(html) {
    return String(html || '').replace(/%%[\s\S]*?%%/g, function (block) {
      var next = block;
      var prev;
      do {
        prev = next;
        next = next
          .replace(/&amp;/gi, '&')
          .replace(/&gt;/gi, '>')
          .replace(/&#0*62;/gi, '>')
          .replace(/&#x0*3e;/gi, '>')
          .replace(/&lt;/gi, '<')
          .replace(/&#0*60;/gi, '<')
          .replace(/&#x0*3c;/gi, '<')
          .replace(/&quot;/gi, '"')
          .replace(/&#0*34;/gi, '"')
          .replace(/&apos;/gi, "'")
          .replace(/&#0*39;/gi, "'");
      } while (next !== prev);
      return next;
    });
  }

  // Outlook's Word engine ignores CSS background-image. A VML rectangle paints it.
  // The shape uses pixels, capped at the 600px column. A percentage, or
  // mso-width-percent, is the whole Word page when the parent is not a fixed cell.
  var EMAIL_WIDTH = 600;
  var EMAIL_FONT = 'Arial, Helvetica, sans-serif';

  function styleMap(style) {
    var out = {};
    splitStyle(style).forEach(function (part) {
      var index = part.indexOf(':');
      if (index === -1) return;
      var key = part.slice(0, index).trim().toLowerCase();
      var value = part.slice(index + 1).trim();
      if (key && value) out[key] = value;
    });
    return out;
  }

  function cssUrl(value) {
    var match = String(value || '').match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
    return match ? match[2] : '';
  }

  function pxLength(value) {
    var match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)px$/i);
    return match ? Math.round(parseFloat(match[1])) : 0;
  }

  function percentRatio(value) {
    var match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)%$/);
    return match ? parseFloat(match[1]) / 100 : 0;
  }

  function digitLength(value) {
    return /^\d+$/.test(String(value || '').trim()) ? parseInt(value, 10) : 0;
  }

  function toHex(value) {
    var raw = String(value || '').trim();
    var short = raw.match(/^#([0-9a-f]{3})$/i);
    if (short) {
      return '#' + short[1].split('').map(function (ch) { return ch + ch; }).join('');
    }
    if (/^#([0-9a-f]{6})$/i.test(raw)) return raw;
    var rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!rgb) return '';
    return '#' + [rgb[1], rgb[2], rgb[3]].map(function (part) {
      var hex = parseInt(part, 10).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function points(pixels) {
    return (Math.round(pixels * 0.75 * 100) / 100) + 'pt';
  }

  function attrEscape(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  // Icon + text: the words get the row less the icon cell and the paddings.
  function iconTextCell(node) {
    if (!/^t[dh]$/i.test(node.tagName) || node.getAttribute('data-nl') === 'icon-cell') return false;
    var table = node.parentElement && node.parentElement.closest('table');
    return !!(table && table.getAttribute('data-nl') === 'icon-text');
  }

  function iconTextWidth(cell) {
    var row = cell.parentElement;
    var total = elementWidth(row.closest('table'));
    Array.prototype.forEach.call(row.children, function (td) {
      var tdStyle = styleMap(td.getAttribute('style'));
      var pad = boxSides(paddingValue(tdStyle));
      total -= sidePx(pad.left) + sidePx(pad.right);
      if (td !== cell) total -= pxLength(tdStyle.width) || digitLength(td.getAttribute('width'));
    });
    return Math.max(1, total);
  }

  function elementWidth(el) {
    var ratio = 1;
    var node = el;
    while (node && node.id !== 'nl-root') {
      if (iconTextCell(node)) return Math.max(1, Math.round(iconTextWidth(node) * ratio));
      var nodeStyle = styleMap(node.getAttribute('style'));
      var fixed = pxLength(nodeStyle.width) || digitLength(node.getAttribute('width'));
      if (fixed) return Math.max(1, Math.round(fixed * ratio));
      var portion = percentRatio(nodeStyle.width) || percentRatio(node.getAttribute('width'));
      if (portion) ratio *= portion;
      node = node.parentElement;
    }
    return Math.max(1, Math.round(EMAIL_WIDTH * ratio));
  }

  function boxHeight(el) {
    if (!el || !el.getAttribute) return 0;
    var style = styleMap(el.getAttribute('style'));
    return pxLength(style.height) || pxLength(style['min-height']) || digitLength(el.getAttribute('height'));
  }

  // The dimension control stores a section's height on its table. The picture
  // often stays on the cell. Word also ignores that CSS height and shrinks a
  // background to the buttons inside it.
  function nearestPixelHeight(el) {
    var node = el;
    while (node && node.id !== 'nl-root') {
      var height = boxHeight(node);
      if (height) return height;
      node = node.parentElement;
    }
    return 0;
  }

  function elementHeight(el, style, imageUrl, measured) {
    var seen = Math.max(boxHeight(el), measured || 0);
    if (!seen && el.parentElement) seen = nearestPixelHeight(el.parentElement);
    if (seen) return seen;
    var size = String(style['background-size'] || '').trim().split(/\s+/);
    if (size.length === 2 && pxLength(size[1])) return pxLength(size[1]);
    var fromUrl = String(imageUrl || '').match(/(\d{2,4})x(\d{2,4})/);
    if (fromUrl && (!style['background-size'] || style['background-size'] === 'auto')) return parseInt(fromUrl[2], 10);
    return 0;
  }

  function hasBackgroundImage(el) {
    var style = styleMap(el.getAttribute('style'));
    return !!(usableImage(style['background-image']) || usableImage(style.background) || usableImage(el.getAttribute('background')));
  }

  // The laid-out box in the editor, including a height set on the section table
  // and any margin that is pushing a button down inside it.
  function measureBackgroundHeights(editor) {
    var heights = [];
    try {
      var frame = editor && editor.Canvas && editor.Canvas.getFrameEl && editor.Canvas.getFrameEl();
      var doc = frame && frame.contentDocument;
      if (!doc) return heights;
      Array.prototype.forEach.call(doc.querySelectorAll('td, th, table, div'), function (el) {
        if (!hasBackgroundImage(el)) return;
        var height = Math.round(el.getBoundingClientRect().height);
        heights.push(height > 0 ? height : 0);
      });
    } catch (err) {
      return [];
    }
    return heights;
  }

  function positionPair(value) {
    var parts = String(value || 'center center').trim().toLowerCase().split(/\s+/);
    var a = parts[0] || 'center';
    var b = parts[1] || 'center';
    var vertical = { top: 1, bottom: 1 };
    var horizontal = { left: 1, right: 1 };
    var x = a;
    var y = b;
    if (vertical[a] || horizontal[b]) {
      y = a;
      x = b;
    }
    function axis(token) {
      if (token === 'left' || token === 'top' || token === '0' || token === '0%') return '0';
      if (token === 'right' || token === 'bottom' || token === '100%') return '1';
      if (/^\d+(?:\.\d+)?%$/.test(token)) return String(Math.max(0, Math.min(1, parseFloat(token) / 100)));
      return '0.5';
    }
    return axis(x) + ',' + axis(y);
  }

  function fillAttributes(style, imageUrl, color) {
    var repeat = String(style['background-repeat'] || 'no-repeat').toLowerCase();
    var size = String(style['background-size'] || '').trim().toLowerCase();
    var attrs = ['type="' + (repeat.indexOf('repeat') === 0 ? 'tile' : 'frame') + '"'];
    if (size === 'cover') attrs.push('aspect="atleast"');
    else if (size === 'contain') attrs.push('aspect="atmost"');
    else {
      var dims = size.split(/\s+/);
      if (dims.length === 2 && pxLength(dims[0]) && pxLength(dims[1])) {
        attrs.push('sizes="' + points(pxLength(dims[0])) + ',' + points(pxLength(dims[1])) + '"');
      }
    }
    var position = positionPair(style['background-position']);
    attrs.push('origin="' + position + '"');
    attrs.push('position="' + position + '"');
    attrs.push('src="' + attrEscape(imageUrl) + '"');
    if (color) attrs.push('color="' + color + '"');
    return attrs.join(' ');
  }

  // Old Outlook ignores CSS width on images and uses the file's own pixel size.
  // It also treats a percentage table width as a percentage of the page.
  // Pin both to the pixel size the editor is already showing.
  // Sections whose width is auto are measured in the editor. Outlook ignores
  // auto and would stretch them back to the column.
  function measureSectionHugs(editor) {
    var widths = [];
    try {
      var frame = editor && editor.Canvas && editor.Canvas.getFrameEl && editor.Canvas.getFrameEl();
      var doc = frame && frame.contentDocument;
      var win = doc && doc.defaultView;
      if (!doc || !win) return widths;
      var byId = {};
      function walk(node) {
        if (!node || !node.get) return;
        if (String(node.get('tagName') || '').toLowerCase() === 'table' && String((node.getAttributes() || {})['data-nl'] || '') === 'section') {
          byId[node.getId()] = node;
        }
        var kids = node.components && node.components();
        if (kids && kids.forEach) kids.forEach(walk);
      }
      if (editor.getWrapper && editor.getWrapper()) walk(editor.getWrapper());
      Array.prototype.forEach.call(doc.querySelectorAll('table[data-nl="section"]'), function (table) {
        var component = byId[table.id];
        var declared = String((component && component.getStyle && component.getStyle().width) || styleMap(table.getAttribute('style')).width || '').replace(/\s+/g, '').toLowerCase();
        if (declared && declared !== 'auto' && declared !== 'fit-content' && declared !== 'max-content') {
          widths.push(0);
          return;
        }
        var parent = table.parentElement;
        var parentW = parent ? parent.clientWidth : 0;
        var w = Math.round(table.getBoundingClientRect().width);
        // Smaller than the container: pin that measured width. As wide as the
        // container, including a long word that wrapped at the edge: -1 locks
        // the section to the container. 0 means it could not be measured.
        if (!(parentW > 0) || !(w > 0)) widths.push(0);
        else if (w < parentW - 1) widths.push(w);
        else widths.push(-1);
      });
    } catch (err) {
      return [];
    }
    return widths;
  }

  function autoWidth(value) {
    var width = String(value || '').replace(/\s+/g, '').toLowerCase();
    return !width || width === 'auto' || width === 'fit-content' || width === 'max-content';
  }

  // The section already fills its container. Hold it there so a long word wraps
  // inside the column instead of painting past the paper.
  function lockSectionFill(table) {
    var style = table.getAttribute('style') || '';
    var map = styleMap(style);
    if (!autoWidth(map.width)) return;
    if (!map['table-layout']) style = replaceDecl(style, 'table-layout', 'fixed');
    style = replaceDecl(style, 'width', '100%');
    table.setAttribute('style', style);
    var attr = String(table.getAttribute('width') || '').trim().toLowerCase();
    if (!attr || attr === 'auto') table.setAttribute('width', '100%');
  }

  function pinSectionHugs(root, hugs) {
    var index = 0;
    Array.prototype.forEach.call(root.querySelectorAll('table[data-nl="section"]'), function (table) {
      var px = hugs[index];
      if (px == null) px = 0;
      index += 1;
      table.removeAttribute('data-nl-hug');
      Array.prototype.forEach.call(table.querySelectorAll('[data-nl-col]'), function (el) {
        el.removeAttribute('data-nl-col');
      });
      if (px < 0) {
        lockSectionFill(table);
        return;
      }
      if (!(px > 0)) return;
      var style = table.getAttribute('style') || '';
      var width = String(styleMap(style).width || '').replace(/\s+/g, '').toLowerCase();
      if (width && width !== 'auto' && width !== 'fit-content' && width !== 'max-content') return;
      table.setAttribute('width', String(px));
      table.setAttribute('style', pinWidth(style, px));
    });
  }

  // Canvas CSS is not exported. anywhere lets a long word wrap inside a column
  // instead of widening the table. A normal word still breaks only when it
  // cannot fit. word-wrap is the same idea for Outlook, which ignores
  // overflow-wrap. Fixed layout keeps a split section on its column widths.
  // A hug has no fixed width, so it stays shrink-wrapped.
  function styleFont(el) {
    if (!el || !el.getAttribute) return { family: '', set: false };
    var map = styleMap(el.getAttribute('style'));
    var family = map['font-family'] || '';
    return { family: family, set: !!(family || map.font || el.getAttribute('face')) };
  }

  // The nearest real family, not a font shorthand. Used to repeat a chosen
  // face onto a nested cell. Outlook does not inherit a face into a table.
  function ancestorFamily(el) {
    var node = el.parentElement;
    while (node && node.id !== 'nl-root') {
      var found = styleFont(node).family;
      if (found) return found;
      node = node.parentElement;
    }
    return '';
  }

  function wrapLongText(root) {
    Array.prototype.forEach.call(root.querySelectorAll('td, th, p, div, a, h1, h2, h3, h4, h5, h6, li, span'), function (el) {
      if (!visibleText(el)) return;
      var style = el.getAttribute('style') || '';
      var map = styleMap(style);
      var space = String(map['white-space'] || '').replace(/\s+/g, '').toLowerCase();
      var locked = space === 'nowrap' || space === 'pre';
      if (!locked && !map['word-break'] && !map['overflow-wrap'] && !map['word-wrap']) {
        // word-wrap first. Outlook reads that and ignores overflow-wrap.
        // Anywhere is last so a modern client uses it: the two names are one
        // property, and the later one wins.
        style = replaceDecl(style, 'word-wrap', 'break-word');
        style = replaceDecl(style, 'overflow-wrap', 'anywhere');
      }
      // Parents are visited first. A cell with no face gets the parent's face,
      // or Arial. Other text only gets Arial when nothing above it chose one.
      var face = styleFont(el);
      if (!face.set) {
        var fromParent = ancestorFamily(el);
        var cell = el.tagName === 'TD' || el.tagName === 'TH';
        if (cell) style = replaceDecl(style, 'font-family', fromParent || EMAIL_FONT);
        else if (!fromParent) style = replaceDecl(style, 'font-family', EMAIL_FONT);
      }
      if (style !== (el.getAttribute('style') || '')) el.setAttribute('style', style);
    });
    Array.prototype.forEach.call(root.querySelectorAll('table[data-nl="section"]'), function (table) {
      var style = table.getAttribute('style') || '';
      var map = styleMap(style);
      if (map['table-layout']) return;
      if (table.getAttribute('data-nl-hug') === '1') return;
      if (autoWidth(map.width || table.getAttribute('width'))) return;
      table.setAttribute('style', replaceDecl(style, 'table-layout', 'fixed'));
    });
  }

  // Declarations split on ; outside quotes and brackets, so a data: URL stays whole.
  function declarations(style) {
    var parts = [];
    var current = '';
    var depth = 0;
    var quote = '';
    var text = String(style || '');
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth = Math.max(0, depth - 1);
      } else if (ch === ';' && !depth) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    parts.push(current);
    return parts.map(function (part) {
      var at = part.indexOf(':');
      if (at === -1) return '';
      var key = part.slice(0, at).trim();
      var value = part.slice(at + 1).trim();
      return key && value ? key + ':' + value : '';
    }).filter(Boolean);
  }

  // The canvas writes `a: b; c: d`, the export adds `;e:f`, and the attribute
  // order depends on which step set what. One form for both, so an email
  // pasted back and exported again comes out the same.
  function tidyAttributes(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[style], [class]'), function (el) {
      var style = el.getAttribute('style');
      var cls = el.getAttribute('class');
      if (cls != null) {
        el.removeAttribute('class');
        cls = cls.split(/\s+/).filter(Boolean).join(' ');
        if (cls) el.setAttribute('class', cls);
      }
      if (style != null) {
        el.removeAttribute('style');
        style = declarations(style).join(';');
        if (style) el.setAttribute('style', style);
      }
    });
  }

  function outlookSizes(html, editor) {
    var hugs = measureSectionHugs(editor);
    var parsed = new DOMParser().parseFromString('<!DOCTYPE html><html><body><div id="nl-root">' + html + '</div></body></html>', 'text/html');
    var root = parsed.getElementById('nl-root');
    if (!root) return { html: html, css: '' };
    tidyAttributes(root);
    wrapLongText(root);
    stretchTextCells(root);
    pinSectionHugs(root, hugs);
    Array.prototype.forEach.call(root.querySelectorAll('[data-nl="image-link"]'), function (el) {
      el.removeAttribute('data-nl');
    });
    Array.prototype.forEach.call(root.querySelectorAll('img[data-nl-href]'), function (img) {
      img.removeAttribute('data-nl-href');
    });
    var jobs = [];
    Array.prototype.forEach.call(root.querySelectorAll('table, td, th'), function (el) {
      var pct = ownPercentText(el);
      if (!pct) return;
      if (pxLength(styleMap(el.getAttribute('style')).width)) return;
      jobs.push({
        el: el,
        pct: pct,
        px: Math.max(1, Math.min(EMAIL_WIDTH, elementWidth(el)))
      });
    });
    var fluid = [];
    var fixed = [];
    jobs.forEach(function (job, index) {
      var cls = 'nl-ow' + (index + 1);
      var full = job.pct === '100%';
      // A pixel or partial percent the user set has to win. nl-full and the
      // fluid rule both force min-width:100% !important, which would erase it.
      var pinnedMin = explicitMinWidth(job.el.getAttribute('style'));
      var names = (elClass(job.el) + ' ' + cls + ' nl-pct' + (full && !pinnedMin ? ' nl-full' : '')).trim();
      job.el.setAttribute('class', names.replace(/\s+/g, ' '));
      if (full) {
        // Gmail on iOS shrinks a fixed pixel table to the words and parks it on the left.
        // Keep 100% for every other client. Outlook gets a pixel box around the table.
        job.el.setAttribute('width', '100%');
        job.el.setAttribute('style', pinFull(job.el.getAttribute('style'), job.px));
        if (job.el.tagName === 'TABLE') wrapOutlookBox(job.el, job.px);
        if (pinnedMin) fluid.push('.' + cls + '{width:100% !important;min-width:' + pinnedMin + ' !important;}');
        else fluid.push('.' + cls + '{width:100% !important;min-width:100% !important;}');
      } else {
        job.el.setAttribute('width', String(job.px));
        job.el.setAttribute('style', pinWidth(job.el.getAttribute('style'), job.px));
        fluid.push('.' + cls + '{width:' + job.pct + ' !important;}');
      }
      fixed.push('.' + cls + '{width:' + job.px + 'px !important;}');
    });
    fitImages(root, editor);
    return { html: root.innerHTML, css: widthCss(fluid, fixed) };
  }

  function elClass(el) {
    return el.getAttribute('class') || '';
  }

  function ownPercentText(el) {
    var style = styleMap(el.getAttribute('style'));
    var fromStyle = String(style.width || '').match(/^(\d+(?:\.\d+)?)%$/);
    if (fromStyle) return fromStyle[1] + '%';
    var fromAttr = String(el.getAttribute('width') || '').trim().match(/^(\d+(?:\.\d+)?)%$/);
    return fromAttr ? fromAttr[1] + '%' : '';
  }

  // A one-cell row collapses in Gmail for iOS, so the background paints only
  // behind the words and the line sits on the left. Stretch it. A cell that is
  // already 100% still needs the link color lifted onto the cell.
  function stretchTextCells(root) {
    Array.prototype.forEach.call(root.querySelectorAll('td, th'), function (cell) {
      if (isShrinkButton(cell)) return;
      // An auto section is only as wide as its blocks. Stretching this cell
      // back to 100% would open the old gap around a shorter block.
      var sectionTable = parentTable(cell);
      if (sectionTable && sectionTable.getAttribute('data-nl') === 'section') {
        var sectionWidth = String(styleMap(sectionTable.getAttribute('style')).width || '').replace(/\s+/g, '').toLowerCase();
        if (!sectionWidth || sectionWidth === 'auto' || sectionWidth === 'fit-content' || sectionWidth === 'max-content') return;
      }
      var row = cell.parentElement;
      if (!row || row.tagName !== 'TR') return;
      var cells = Array.prototype.filter.call(row.children, function (node) {
        return node.tagName === 'TD' || node.tagName === 'TH';
      });
      if (cells.length !== 1) return;
      var widthAttr = String(cell.getAttribute('width') || '').trim();
      var pct = ownPercentText(cell);
      var fixedPx = !pct && (digitLength(widthAttr) || pxLength(styleMap(cell.getAttribute('style')).width));
      if (fixedPx) return;
      if (pct && pct !== '100%') return;
      var style = cell.getAttribute('style') || '';
      if (!pct) {
        cell.setAttribute('width', '100%');
        style = replaceDecl(style, 'width', '100%');
      } else if (!/^100%$/.test(widthAttr)) {
        cell.setAttribute('width', '100%');
      }
      if (!/min-width\s*:/i.test(style)) style = replaceDecl(style, 'min-width', '100%');
      cell.setAttribute('style', style);
      if (!cell.getAttribute('align')) {
        var align = String(styleMap(style)['text-align'] || '').toLowerCase();
        if (align === 'left' || align === 'center' || align === 'right') cell.setAttribute('align', align);
      }
      liftLinkBackground(cell);
    });
  }

  function isShrinkButton(cell) {
    var table = cell.parentElement;
    while (table && table.tagName !== 'TABLE' && table.id !== 'nl-root') table = table.parentElement;
    if (!table || table.tagName !== 'TABLE') return false;
    if (table.getAttribute('width') || ownPercentText(table)) return false;
    var style = styleMap(table.getAttribute('style'));
    if (style.width) return false;
    var cellStyle = styleMap(cell.getAttribute('style'));
    return !!(cell.getAttribute('bgcolor') || cellStyle['background-color']);
  }

  function linkPaint(link) {
    var map = styleMap(link.getAttribute('style'));
    if (map['background-color']) return { value: map['background-color'], shorthand: false };
    var shorthand = String(map.background || '').trim();
    if (/^(#|rgb|hsl)/i.test(shorthand) && !/url\(/i.test(shorthand)) return { value: shorthand, shorthand: true };
    return null;
  }

  function liftLinkBackground(cell) {
    var cellStyle = styleMap(cell.getAttribute('style'));
    if (cellStyle['background-color'] || cell.getAttribute('bgcolor')) return;
    var links = cell.querySelectorAll('a');
    if (links.length !== 1) return;
    var link = links[0];
    // A button (or any link in a nested table) already paints its own cell.
    // This cell is only the column behind that table. Images add no text, so
    // the column's text matched the button label and the button color was
    // copied onto every column. SFMC and inboxes showed it. The editor did not.
    var nested = link.closest && link.closest('table');
    if (nested && nested !== parentTable(cell)) return;
    var linkText = (link.textContent || '').replace(/\s+/g, ' ').trim();
    var cellText = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    if (!linkText || linkText !== cellText) return;
    var paint = linkPaint(link);
    if (!paint) return;
    var hex = toHex(paint.value);
    if (hex) cell.setAttribute('bgcolor', hex);
    cell.setAttribute('style', replaceDecl(cell.getAttribute('style'), 'background-color', paint.value));
    var next = String(link.getAttribute('style') || '').replace(/(^|;)\s*background-color\s*:[^;]*/ig, '$1');
    if (paint.shorthand) next = next.replace(/(^|;)\s*background\s*:[^;]*/ig, '$1');
    next = next.replace(/^\s*;\s*/, '').replace(/;\s*;/g, ';').replace(/;\s*$/, '').trim();
    if (next) link.setAttribute('style', next);
    else link.removeAttribute('style');
  }

  // 100% is the normal full-width floor. Anything else was chosen on the section.
  function explicitMinWidth(styleText) {
    var value = String(styleMap(styleText)['min-width'] || '').replace(/\s+/g, '').toLowerCase();
    var match = value.match(/^(\d+(?:\.\d+)?)(px|%)$/);
    if (!match) return '';
    var n = parseFloat(match[1]);
    if (!(n > 0)) return '';
    if (match[2] === '%') {
      if (n >= 100) return '';
      return String(n) + '%';
    }
    return String(Math.round(n)) + 'px';
  }

  function pinFull(style, px) {
    var next = replaceDecl(style, 'width', '100%');
    if (!/min-width\s*:/i.test(next)) next = replaceDecl(next, 'min-width', '100%');
    if (!/mso-width-alt\s*:/i.test(next)) next = replaceDecl(next, 'mso-width-alt', String(px * 15));
    return next;
  }

  function wrapOutlookBox(el, px) {
    var parent = el.parentElement;
    if (!parent) return;
    var prev = el.previousSibling;
    // Only an open box right before means the table is already wrapped. The
    // closing comment of the previous table's box does not, and skipping on it
    // left every second full-width table in a row without its Outlook box.
    if (prev && prev.nodeType === 8 && /^\[if mso\]>\s*<table\b/i.test(prev.nodeValue || '')) return;
    var doc = el.ownerDocument;
    parent.insertBefore(doc.createComment(
      '[if mso]><table role="presentation" align="center" width="' + px +
      '" cellpadding="0" cellspacing="0" border="0" style="width:' + px +
      'px;"><tr><td width="' + px + '" style="width:' + px + 'px;"><![endif]'
    ), el);
    var close = doc.createComment('[if mso]></td></tr></table><![endif]');
    if (el.nextSibling) parent.insertBefore(close, el.nextSibling);
    else parent.appendChild(close);
  }

  function pinWidth(style, px) {
    var next = replaceDecl(style, 'width', px + 'px');
    if (!/mso-width-alt\s*:/i.test(next)) next = replaceDecl(next, 'mso-width-alt', String(px * 15));
    return next;
  }

  function replaceDecl(style, prop, value) {
    var source = String(style || '');
    var re = new RegExp('(^|;)\\s*' + prop + '\\s*:[^;]*', 'i');
    if (re.test(source)) return source.replace(re, '$1' + prop + ':' + value);
    var base = source.trim();
    if (base && !/;\s*$/.test(base)) base += ';';
    return base + prop + ':' + value;
  }

  function paddingX(style) {
    if (style['padding-left'] || style['padding-right']) {
      return pxLength(style['padding-left']) + pxLength(style['padding-right']);
    }
    var parts = String(style.padding || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 0;
    if (parts.length === 1) return pxLength(parts[0]) * 2;
    if (parts.length === 2 || parts.length === 3) return pxLength(parts[1]) * 2;
    return pxLength(parts[1]) + pxLength(parts[3]);
  }

  function imageContainer(img) {
    var node = img.parentElement;
    while (node && node.id !== 'nl-root') {
      if (node.tagName === 'TD' || node.tagName === 'TH') {
        return Math.max(1, elementWidth(node) - paddingX(styleMap(node.getAttribute('style'))));
      }
      node = node.parentElement;
    }
    return EMAIL_WIDTH;
  }

  function canvasImages(editor) {
    var boxes = [];
    try {
      var frame = editor && editor.Canvas && editor.Canvas.getFrameEl && editor.Canvas.getFrameEl();
      var doc = frame && frame.contentDocument;
      if (!doc) return boxes;
      var device = editor.getDevice ? editor.getDevice() : 'desktop';
      var desktop = !device || device === 'desktop' || device === 'Desktop';
      Array.prototype.forEach.call(doc.querySelectorAll('img'), function (img) {
        var rect = img.getBoundingClientRect();
        boxes.push({
          desktop: desktop,
          w: Math.round(rect.width) || 0,
          h: Math.round(rect.height) || 0,
          naturalW: img.naturalWidth || 0,
          naturalH: img.naturalHeight || 0
        });
      });
    } catch (err) {
      return [];
    }
    return boxes;
  }

  function imagePixels(img, box) {
    var style = styleMap(img.getAttribute('style'));
    var cssW = pxLength(style.width);
    var cssPct = percentRatio(style.width);
    var cssH = pxLength(style.height);
    var attrW = digitLength(img.getAttribute('width'));
    var attrH = digitLength(img.getAttribute('height'));
    var container = imageContainer(img);
    var displayW = 0;
    // A pixel width in the style is the size the style manager shows. Outlook
    // never reads it, so the width attribute has to repeat it.
    if (cssW) displayW = Math.min(cssW, EMAIL_WIDTH);
    else if (cssPct) displayW = Math.max(1, Math.min(EMAIL_WIDTH, Math.round(container * cssPct)));
    else if (box && box.desktop && box.w >= 2 && box.w <= EMAIL_WIDTH) displayW = box.w;
    else if (attrW && attrW <= container) displayW = attrW;
    else if (box && box.naturalW && box.naturalW <= container) displayW = box.naturalW;
    else displayW = Math.min(container, EMAIL_WIDTH);
    displayW = Math.max(1, displayW);
    // height:auto in the editor means "keep the file's aspect". A leftover height
    // attribute is often the file's old pixel height, which Outlook would honor.
    var displayH = 0;
    if (cssH) displayH = cssH;
    else if (box && box.naturalW && box.naturalH) displayH = Math.max(1, Math.round(box.naturalH * displayW / box.naturalW));
    else if (attrW && attrH && attrW !== displayW) displayH = Math.max(1, Math.round(attrH * displayW / attrW));
    return { w: displayW, h: displayH, lockHeight: !!cssH };
  }

  function fitImages(root, editor) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    var boxes = canvasImages(editor);
    var useBox = boxes.length === imgs.length;
    imgs.forEach(function (img, index) {
      var box = useBox ? boxes[index] : null;
      var size = imagePixels(img, box);
      var style = img.getAttribute('style') || '';
      var hadFixedHeight = pxLength(styleMap(style).height);
      img.setAttribute('width', String(size.w));
      if (size.h) img.setAttribute('height', String(size.h));
      else img.removeAttribute('height');
      if (!img.getAttribute('border')) img.setAttribute('border', '0');
      style = replaceDecl(style, 'width', size.w + 'px');
      style = replaceDecl(style, 'max-width', '100%');
      if (!hadFixedHeight) style = replaceDecl(style, 'height', 'auto');
      img.setAttribute('style', style);
    });
  }

  // Percentage rules stay hidden from Outlook. Outlook only receives the pixel widths.
  function widthCss(fluid, fixed) {
    if (!fluid.length) return '';
    return '<!--[if !mso]><!--><style type="text/css">' + fluid.join('') +
      '</style><!--<![endif]--><!--[if mso]><style type="text/css">' + fixed.join('') +
      '</style><![endif]-->';
  }

  function directCells(table) {
    var cells = [];
    Array.prototype.forEach.call(table.rows || [], function (row) {
      Array.prototype.forEach.call(row.cells || [], function (cell) { cells.push(cell); });
    });
    return cells;
  }

  // A 3/7 sitting in a section cell. The picture has to go on that cell:
  // the inner table has two cells, and Word will not paint one image across them.
  function nestedBackgroundCell(table) {
    if (!table || table.getAttribute('data-nl') !== 'section' || directCells(table).length < 2) return null;
    var cell = table.parentElement;
    while (cell && cell.id !== 'nl-root' && cell.tagName !== 'TD' && cell.tagName !== 'TH') cell = cell.parentElement;
    if (!cell || (cell.tagName !== 'TD' && cell.tagName !== 'TH')) return null;
    var owner = cell.parentElement;
    while (owner && owner.id !== 'nl-root' && owner.tagName !== 'TABLE') owner = owner.parentElement;
    if (!owner || owner.getAttribute('data-nl') !== 'section') return null;
    var cells = directCells(owner);
    for (var i = 0; i < cells.length; i++) if (cells[i] === cell) return cell;
    return null;
  }

  // A 1/2 or 1/3 section that is not inside another section's cell. Word will
  // not paint one picture across its cells, so the shape wraps the table.
  function wholeSectionBackground(table) {
    if (!table || table.getAttribute('data-nl') !== 'section' || directCells(table).length < 2) return false;
    return !nestedBackgroundCell(table) && !!table.parentNode;
  }

  function ancestorHasBackground(el) {
    var node = el && el.parentElement;
    while (node && node.id !== 'nl-root') {
      if (hasBackgroundImage(node)) {
        if (node.tagName === 'TD' || node.tagName === 'TH' || node.tagName === 'DIV') return true;
        if (node.tagName === 'TABLE' && (directCells(node).length === 1 || nestedBackgroundCell(node) || wholeSectionBackground(node))) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function usableImage(value) {
    var url = cssUrl(value);
    var raw = url || String(value || '').trim();
    if (/^(https?:|cid:|\/)/i.test(raw)) return raw;
    return '';
  }

  // Word fetches background="unset" and ignores CSS values it does not know.
  function scrubOutlookNoise(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[background], [style]'), function (el) {
      var background = el.getAttribute('background');
      if (background && !usableImage(background)) el.removeAttribute('background');
      var style = el.getAttribute('style');
      if (!style) return;
      var next = splitStyle(style).filter(function (part) {
        var splitAt = part.indexOf(':');
        if (splitAt === -1) return part.trim();
        var value = part.slice(splitAt + 1).trim().toLowerCase();
        return value !== 'unset' && value !== 'initial' && value !== 'revert';
      }).filter(function (part) { return part.trim(); }).join(';');
      if (next !== style) el.setAttribute('style', next);
    });
  }

  function visibleText(el) {
    return String(el.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function boxSides(value) {
    var parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { top: '0', right: '0', bottom: '0', left: '0' };
    if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }

  // The editor writes "margin:0;margin-left:auto" when a side is set on top of the
  // shorthand, so the declarations are read in order, last one winning.
  function marginSides(styleText) {
    var box = { top: '0', right: '0', bottom: '0', left: '0' };
    declarations(styleText).forEach(function (decl) {
      var index = decl.indexOf(':');
      var key = decl.slice(0, index).trim().toLowerCase();
      var value = decl.slice(index + 1).replace(/!important/i, '').trim().toLowerCase();
      if (key === 'margin') box = boxSides(value);
      else if (/^margin-(top|right|bottom|left)$/.test(key)) box[key.slice(7)] = value;
    });
    return box;
  }

  function sidePx(token) {
    if (!token || token === 'auto') return 0;
    return pxLength(token);
  }

  function anchorBorder(style) {
    var border = String(style.border || '').trim();
    if (border && border !== 'none' && /px/i.test(border) && !/^0(?:px)?(?:\s|$)/i.test(border)) return border;
    var width = String(style['border-width'] || '').trim().split(/\s+/)[0];
    var color = String(style['border-color'] || '').trim().split(/\s+/)[0];
    var line = String(style['border-style'] || 'solid').trim().split(/\s+/)[0];
    if (pxLength(width) && color && line && line !== 'none') return width + ' ' + line + ' ' + color;
    return '';
  }

  // Word stores a border as "solid #112233 2.25pt", not the CSS order.
  function msoBorderAlt(border) {
    var match = String(border || '').trim().match(/^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted|double)\s+(.+)$/i);
    if (!match) return border;
    var pt = Math.round(parseFloat(match[1]) * 75) / 100;
    var color = toHex(match[3].trim()) || match[3].trim();
    return match[2].toLowerCase() + ' ' + color + ' ' + pt + 'pt';
  }

  function styleFace(value) {
    return String(value || '').replace(/["\\]/g, '').trim();
  }

  function paddingValue(style) {
    if (style.padding) return style.padding;
    var top = style['padding-top'] || '0';
    var right = style['padding-right'] || '0';
    var bottom = style['padding-bottom'] || '0';
    var left = style['padding-left'] || '0';
    if (sidePx(top) + sidePx(right) + sidePx(bottom) + sidePx(left) === 0) return '0';
    return top + ' ' + right + ' ' + bottom + ' ' + left;
  }

  function isButtonAnchor(anchor) {
    var style = styleMap(anchor.getAttribute('style'));
    if (anchorBorder(style)) return true;
    var pad = boxSides(paddingValue(style));
    if (sidePx(pad.top) || sidePx(pad.right) || sidePx(pad.bottom) || sidePx(pad.left)) return true;
    if (style['background-color'] && /inline-block/i.test(style.display || '')) return true;
    return false;
  }

  // An empty preset shell keeps mso-padding-alt. Other clients collapse it.
  // Word paints the cell color, which is the orange square above the real control.
  function removeEmptyButtonShells(root) {
    Array.prototype.forEach.call(root.querySelectorAll('table'), function (table) {
      var cells = directCells(table);
      if (cells.length !== 1) return;
      var cell = cells[0];
      if (cell.querySelector('a, img, table')) return;
      if (visibleText(cell)) return;
      var style = styleMap(cell.getAttribute('style'));
      if (!style['background-color'] && !cell.getAttribute('bgcolor')) return;
      // A colored spacer or an empty section cell has neither of these.
      if (!style['mso-padding-alt'] && !style['border-radius']) return;
      var width = styleMap(table.getAttribute('style')).width || table.getAttribute('width') || '';
      if (width === '100%' || digitLength(width) >= EMAIL_WIDTH) return;
      if (table.parentNode) table.parentNode.removeChild(table);
    });
  }

  function parentTable(cell) {
    var row = cell.parentElement;
    if (!row || row.tagName !== 'TR') return null;
    var node = row.parentElement;
    if (!node) return null;
    if (node.tagName === 'TBODY' || node.tagName === 'THEAD' || node.tagName === 'TFOOT') node = node.parentElement;
    return node && node.tagName === 'TABLE' ? node : null;
  }

  // Word drops the first line in a cell when font-size is 0, and it ignores
  // mso-line-height-rule unless that property is written before line-height.
  // Matching line-height used to skip this repair, so a default spacer stayed broken.
  function spacerStyle(existing, height) {
    var skip = {
      'mso-line-height-rule': 1,
      'mso-line-height-alt': 1,
      height: 1,
      'line-height': 1,
      'font-size': 1
    };
    var kept = [];
    splitStyle(existing).forEach(function (part) {
      var splitAt = part.indexOf(':');
      if (splitAt === -1) {
        if (part.trim()) kept.push(part.trim());
        return;
      }
      var key = part.slice(0, splitAt).trim().toLowerCase();
      var value = part.slice(splitAt + 1).trim();
      if (!key || !value || skip[key]) return;
      kept.push(key + ':' + value);
    });
    var px = height + 'px';
    return [
      'mso-line-height-rule:exactly',
      'mso-line-height-alt:' + px,
      'height:' + px,
      'line-height:' + px,
      'font-size:' + px
    ].concat(kept).join(';');
  }

  function fixSpacerCells(root) {
    Array.prototype.forEach.call(root.querySelectorAll('td, th'), function (cell) {
      var table = parentTable(cell);
      if (table && directCells(table).indexOf(cell) !== -1) {
        if (table.getAttribute('data-nl') === 'section') return;
        if (/max-width\s*:\s*100%/i.test(table.getAttribute('style') || '')) return;
      }
      var style = styleMap(cell.getAttribute('style'));
      var height = pxLength(style.height) || digitLength(cell.getAttribute('height')) || pxLength(style['line-height']);
      if (height < 8) return;
      if (cell.querySelector('a, img, table, div, p, h1, h2, h3, h4, h5, h6, span')) return;
      if (visibleText(cell)) return;
      var row = cell.parentElement;
      if (row && row.tagName === 'TR' && row.cells && row.cells.length === 1) {
        height = Math.max(height, pxLength(styleMap(row.getAttribute('style')).height), digitLength(row.getAttribute('height')));
      }
      if (table && directCells(table).length === 1 && directCells(table)[0] === cell) {
        height = Math.max(height, pxLength(styleMap(table.getAttribute('style')).height), digitLength(table.getAttribute('height')));
      }
      if (height < 8) return;
      cell.setAttribute('style', spacerStyle(cell.getAttribute('style'), height));
      cell.setAttribute('height', String(height));
      if (row && row.tagName === 'TR' && row.cells && row.cells.length === 1) {
        row.setAttribute('height', String(height));
      }
      if (!String(cell.textContent || '').length) {
        cell.appendChild(cell.ownerDocument.createTextNode('\u00a0'));
      }
    });
  }

  function hideFromOutlook(el) {
    var doc = el.ownerDocument;
    var parent = el.parentNode;
    if (!parent) return;
    parent.insertBefore(doc.createComment('[if !mso]><!'), el);
    if (el.nextSibling) parent.insertBefore(doc.createComment('<![endif]'), el.nextSibling);
    else parent.appendChild(doc.createComment('<![endif]'));
  }

  function showOnlyInOutlook(el, html) {
    var doc = el.ownerDocument;
    var parent = el.parentNode;
    if (!parent) return;
    parent.insertBefore(doc.createComment('[if mso]>' + html + '<![endif]'), el);
    hideFromOutlook(el);
  }

  function fontWrap(html, color, face, size, weight) {
    var open = '<font';
    if (color) open += ' color="' + color + '"';
    if (face) open += ' face="' + attrEscape(face) + '"';
    var fontStyle = '';
    if (size) fontStyle += 'font-size:' + size + ';';
    if (color) fontStyle += 'color:' + color + ';';
    if (weight) fontStyle += 'font-weight:' + weight + ';';
    if (fontStyle) open += ' style="' + fontStyle + '"';
    open += '>';
    var inner = html;
    if (/^(bold|[6-9]00)$/i.test(String(weight || ''))) inner = '<b>' + inner + '</b>';
    return open + inner + '</font>';
  }

  function spacerRow(height, span) {
    var attrs = span > 1 ? ' colspan="' + span + '"' : '';
    return '<tr height="' + height + '"><td' + attrs + ' height="' + height +
      '" style="mso-line-height-rule:exactly;mso-line-height-alt:' + height +
      'px;height:' + height + 'px;line-height:' + height + 'px;font-size:' + height +
      'px;">&nbsp;</td></tr>';
  }

  // Word ignores padding, border, and background on a link, and draws the border
  // around the words only. The cell has to own the fill, the outline, and the padding.
  function outlookButtons(root) {
    Array.prototype.slice.call(root.querySelectorAll('a')).forEach(function (anchor) {
      if (!isButtonAnchor(anchor)) return;
      if (anchor.getAttribute('data-nl-ol')) return;
      var style = styleMap(anchor.getAttribute('style'));
      var border = anchorBorder(style);
      var borderAlt = border ? msoBorderAlt(border) : '';
      var color = toHex(style.color || '') || '#000000';
      var face = styleFace(style['font-family'] || 'Arial, Helvetica, sans-serif');
      var size = style['font-size'] || '15px';
      var weight = style['font-weight'] || '';
      var padding = paddingValue(style);
      var bg = toHex(style['background-color'] || '');
      var href = attrEscape(anchor.getAttribute('href') || '#');
      var label = fontWrap(anchor.innerHTML, color, face, size, weight);
      var parent = anchor.parentElement;
      var inCell = parent && (parent.tagName === 'TD' || parent.tagName === 'TH') &&
        parent.children.length === 1 && !visibleText(parent).replace(visibleText(anchor), '').trim();
      if (inCell) {
        var cellStyle = parent.getAttribute('style') || '';
        cellStyle = replaceDecl(cellStyle, 'mso-padding-alt', padding);
        if (borderAlt) cellStyle = replaceDecl(cellStyle, 'mso-border-alt', borderAlt);
        parent.setAttribute('style', cellStyle);
        if (bg && !parent.getAttribute('bgcolor')) parent.setAttribute('bgcolor', bg);
        if (!parent.getAttribute('align')) parent.setAttribute('align', 'center');
        var simple = '<a href="' + href + '" data-nl-ol="1" style="color:' + color +
          ';text-decoration:none;font-family:' + attrEscape(face) + ';font-size:' + size +
          (weight ? ';font-weight:' + weight : '') + ';">' + label + '</a>';
        parent.insertBefore(anchor.ownerDocument.createComment('[if mso]>' + simple + '<![endif]'), anchor);
        hideFromOutlook(anchor);
        return;
      }
      var margin = marginSides(anchor.getAttribute('style'));
      var top = sidePx(margin.top);
      var right = sidePx(margin.right);
      var bottom = sidePx(margin.bottom);
      var left = sidePx(margin.left);
      var columns = 1 + (left ? 1 : 0) + (right ? 1 : 0);
      // This cell exists only inside an Outlook comment, so Word can own the
      // border and the padding. A CSS border here does not reach other clients.
      var tdStyle = 'mso-padding-alt:' + padding + ';color:' + color + ';font-family:' + face + ';font-size:' + size + ';';
      if (borderAlt) tdStyle += 'border:' + borderAlt + ';mso-border-alt:' + borderAlt + ';';
      var buttonCell = '<td align="center"' + (bg ? ' bgcolor="' + bg + '"' : '') + ' style="' + tdStyle + '">' +
        '<a href="' + href + '" style="color:' + color + ';text-decoration:none;font-family:' + attrEscape(face) +
        ';font-size:' + size + (weight ? ';font-weight:' + weight : '') + ';">' + label + '</a></td>';
      var rows = '';
      if (top) rows += spacerRow(top, columns);
      rows += '<tr>';
      if (left) rows += '<td width="' + left + '" style="width:' + left + 'px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>';
      rows += buttonCell;
      if (right) rows += '<td width="' + right + '" style="width:' + right + 'px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>';
      rows += '</tr>';
      if (bottom) rows += spacerRow(bottom, columns);
      var align = margin.left === 'auto' && margin.right === 'auto' ? 'center' : 'left';
      var table = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="' + align +
        '"><tbody>' + rows + '</tbody></table>';
      showOnlyInOutlook(anchor, table);
    });
  }

  // The typography a line inherits in a browser, read from the inline styles
  // and <font> tags of its ancestors, nearest first.
  function inheritedType(node) {
    var found = { color: '', face: '', size: '', weight: '' };
    while (node && node.nodeType === 1 && node.id !== 'nl-root' && node.tagName !== 'BODY') {
      var style = styleMap(node.getAttribute('style'));
      if (!found.color) {
        found.color = toHex(style.color || '') ||
          (node.tagName === 'FONT' ? toHex(node.getAttribute('color') || '') : '');
      }
      if (!found.face) {
        found.face = styleFace(style['font-family'] || '') ||
          (node.tagName === 'FONT' ? styleFace(node.getAttribute('face') || '') : '');
      }
      if (!found.size && /^\d+(\.\d+)?(px|pt)$/i.test(String(style['font-size'] || '').trim())) found.size = style['font-size'];
      if (!found.weight && style['font-weight']) found.weight = style['font-weight'];
      if (found.color && found.face && found.size && found.weight) break;
      node = node.parentElement;
    }
    return found;
  }

  // The room a line has inside its cells. Word keeps a cell's padding, so an
  // Outlook copy as wide as the whole box pushed it wider (a hero with 32px side
  // padding grew to 664px in Old Outlook).
  function lineWidth(el) {
    var pad = 0;
    var node = el.parentElement;
    while (node && node.id !== 'nl-root') {
      if (iconTextCell(node)) break;
      var style = styleMap(node.getAttribute('style'));
      if (node.tagName === 'TD' || node.tagName === 'TH') {
        var sides = boxSides(paddingValue(style));
        pad += sidePx(sides.left) + sidePx(sides.right);
      }
      if (pxLength(style.width) || digitLength(node.getAttribute('width'))) break;
      node = node.parentElement;
    }
    return Math.max(1, elementWidth(el) - pad);
  }

  // Word drops margin and color on a div, and ignores text-align unless the cell has align.
  function outlookText(root) {
    Array.prototype.slice.call(root.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6')).forEach(function (el) {
      if (el.closest && el.closest('a')) return;
      var blocked = false;
      Array.prototype.forEach.call(el.children, function (child) {
        var name = child.tagName.toLowerCase();
        if (!/^(br|span|font|strong|b|em|i|u|small|sup|sub)$/.test(name)) blocked = true;
      });
      if (blocked || !visibleText(el)) return;
      var style = styleMap(el.getAttribute('style'));
      var margin = marginSides(el.getAttribute('style'));
      var top = sidePx(margin.top);
      var bottom = sidePx(margin.bottom);
      var pad = paddingValue(style);
      if (pad === '0') pad = '';
      var align = String(style['text-align'] || 'left').toLowerCase();
      if (align !== 'center' && align !== 'right' && align !== 'left') align = 'left';
      var color = toHex(style.color || '');
      var face = styleFace(style['font-family'] || '');
      var size = style['font-size'] || '';
      var weight = style['font-weight'] || '';
      var needs = top || bottom || color || align !== 'left' || sidePx(boxSides(pad).top) || sidePx(boxSides(pad).left);
      if (!needs) return;
      // The Outlook copy sits in its own table, and Word does not carry the
      // color or font of the text block around it into that table. A line that
      // was aligned on its own then turned black after a color change on the block.
      var inherited = inheritedType(el.parentElement);
      color = color || inherited.color;
      face = face || inherited.face;
      size = size || inherited.size;
      weight = weight || inherited.weight;
      var width = Math.min(EMAIL_WIDTH, lineWidth(el));
      // Word doubles the inset when a cell sets both padding and mso-padding-alt.
      var tdStyle = '';
      if (pad) tdStyle += 'mso-padding-alt:' + pad + ';';
      if (color) tdStyle += 'color:' + color + ';';
      if (face) tdStyle += 'font-family:' + face + ';';
      if (size) tdStyle += 'font-size:' + size + ';';
      if (weight) tdStyle += 'font-weight:' + weight + ';';
      var rows = '';
      if (top) rows += spacerRow(top, 1);
      rows += '<tr><td align="' + align + '" style="' + tdStyle + '">' +
        fontWrap(el.innerHTML, color, face, size, weight) + '</td></tr>';
      if (bottom) rows += spacerRow(bottom, 1);
      var table = '<table role="presentation" width="' + width + '" cellpadding="0" cellspacing="0" border="0" style="width:' +
        width + 'px;"><tbody>' + rows + '</tbody></table>';
      showOnlyInOutlook(el, table);
    });
  }

  // Word drops margin on a table. A pixel top or bottom becomes a spacer row.
  // A pixel left or right on a button becomes a spacer cell: Word ignores the
  // margin, and the Outlook mobile app also drops align, so the button sat on
  // the left. The CSS margin is removed so clients that already honor it do
  // not add the offset twice.
  function marginKeep(value, used) {
    if (used) return '';
    if (!value || value === '0' || value === '0px') return '';
    return value;
  }

  function styleWithoutMargins(styleText, keep) {
    var next = styleText || '';
    ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach(function (name) {
      next = dropDecl(next, name);
    });
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      if (keep[side]) next = replaceDecl(next, 'margin-' + side, keep[side]);
    });
    return next.trim();
  }

  function isButtonTableEl(table) {
    if (!table || table.tagName !== 'TABLE') return false;
    if (table.getAttribute('data-nl')) return false;
    var width = String(styleMap(table.getAttribute('style')).width || table.getAttribute('width') || '').replace(/\s+/g, '');
    if (width === '100%' || /%$/.test(width)) return false;
    if (/max-width\s*:\s*100%/i.test(table.getAttribute('style') || '')) return false;
    var cells = directCells(table);
    if (cells.length !== 1) return false;
    var cell = cells[0];
    if (cell.getAttribute('data-nl')) return false;
    if (/\bdivider\b/.test(cell.getAttribute('class') || '')) return false;
    var cellStyle = styleMap(cell.getAttribute('style'));
    if (!cell.getAttribute('bgcolor') && !cellStyle['background-color']) return false;
    // A colored box holding a headline, copy or a nested button is a section, not a button.
    if (cell.querySelector('table, img, h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote')) return false;
    return !!cell.querySelector('a');
  }

  // auto/auto stays centered. A length on the left pins the button there.
  // auto on the left and a length on the right pins it to the right.
  function horizontalPlan(box) {
    var left = String(box.left || '0').trim().toLowerCase();
    var right = String(box.right || '0').trim().toLowerCase();
    var leftAuto = left === 'auto';
    var rightAuto = right === 'auto';
    var leftPx = sidePx(box.left);
    var rightPx = sidePx(box.right);
    if (leftAuto && rightAuto) return { align: 'center', left: 0, right: 0 };
    if (leftAuto && rightPx) return { align: 'right', left: 0, right: rightPx };
    if (rightAuto && leftPx) return { align: 'left', left: leftPx, right: 0 };
    if (leftAuto) return { align: 'right', left: 0, right: 0 };
    if (rightAuto) return { align: 'left', left: 0, right: 0 };
    if (leftPx || rightPx) return { align: 'left', left: leftPx, right: rightPx };
    return { align: 'left', left: 0, right: 0 };
  }

  function gapCell(doc, px) {
    var td = doc.createElement('td');
    td.setAttribute('width', String(px));
    td.setAttribute('valign', 'top');
    td.setAttribute('style', 'width:' + px + 'px;font-size:0;line-height:0;');
    var inner = doc.createElement('table');
    inner.setAttribute('role', 'presentation');
    inner.setAttribute('width', String(px));
    inner.setAttribute('cellpadding', '0');
    inner.setAttribute('cellspacing', '0');
    inner.setAttribute('border', '0');
    inner.setAttribute('style', 'width:' + px + 'px;border-collapse:collapse;');
    inner.innerHTML = '<tbody><tr><td height="1" width="' + px +
      '" style="width:' + px + 'px;height:1px;font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td></tr></tbody>';
    td.appendChild(inner);
    return td;
  }

  function presentTable(doc) {
    var table = doc.createElement('table');
    table.setAttribute('role', 'presentation');
    table.setAttribute('cellpadding', '0');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('border', '0');
    return table;
  }

  function rowBody(doc, tr) {
    var body = doc.createElement('tbody');
    body.appendChild(tr);
    return body;
  }

  // The right-hand gap has to travel with the button. Word reads align, and
  // the Outlook app reads float after it strips align. The clear is hidden
  // from Word, which does not float the group.
  function pinButton(doc, table, plan) {
    table.setAttribute('align', plan.align);
    var shell = presentTable(doc);
    shell.setAttribute('width', '100%');
    shell.setAttribute('style', 'width:100%;border-collapse:collapse;');
    var hold = doc.createElement('td');
    var tr = doc.createElement('tr');
    if (plan.align === 'right') {
      hold.setAttribute('align', 'left');
      var group = presentTable(doc);
      group.setAttribute('align', 'right');
      group.setAttribute('style', 'float:right;border-collapse:collapse;');
      var groupRow = doc.createElement('tr');
      var buttonCell = doc.createElement('td');
      buttonCell.setAttribute('align', 'right');
      buttonCell.setAttribute('valign', 'top');
      buttonCell.appendChild(table);
      groupRow.appendChild(buttonCell);
      if (plan.right) groupRow.appendChild(gapCell(doc, plan.right));
      group.appendChild(rowBody(doc, groupRow));
      hold.appendChild(group);
      // createComment already writes <!-- and -->. Putting the closer in the
      // data emits a second --> as text, which shows up in the email as --&gt;.
      hold.appendChild(doc.createComment('[if !mso]><!'));
      var clear = doc.createElement('div');
      clear.setAttribute('style', 'clear:both;display:block;height:0;line-height:0;font-size:0;overflow:hidden;');
      hold.appendChild(clear);
      hold.appendChild(doc.createComment('<![endif]'));
    } else {
      hold.setAttribute('align', 'left');
      hold.setAttribute('style', 'text-align:left;');
      hold.setAttribute('valign', 'top');
      if (plan.left) tr.appendChild(gapCell(doc, plan.left));
      tr.appendChild(hold);
      if (plan.right) tr.appendChild(gapCell(doc, plan.right));
      hold.appendChild(table);
    }
    if (plan.align === 'right') tr.appendChild(hold);
    shell.appendChild(rowBody(doc, tr));
    return shell;
  }

  function gapTable(doc, height) {
    var table = doc.createElement('table');
    table.setAttribute('role', 'presentation');
    table.setAttribute('cellpadding', '0');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('border', '0');
    table.setAttribute('width', '100%');
    table.setAttribute('style', 'width:100%;border-collapse:collapse;');
    table.innerHTML = '<tbody>' + spacerRow(height, 1) + '</tbody>';
    return table;
  }

  // Word does not center with auto margins, ignores margins on tables and
  // images, and ignores the width of a div. A box narrower than its column,
  // centered or pushed right with margins, sat on the left in Outlook. The
  // margins stay for every other client. Outlook gets the same placement from
  // align: on a centered table directly, otherwise from an Outlook-only table
  // of the box's width inside a full-width cell aligned the same way.
  function alignPlan(styleText, allowPixels) {
    var box = marginSides(styleText);
    var left = String(box.left || '0').trim().toLowerCase();
    var right = String(box.right || '0').trim().toLowerCase();
    if (left !== 'auto' && right !== 'auto' && !allowPixels) return null;
    var plan = horizontalPlan(box);
    if (plan.align === 'left' && !plan.left) return null;
    return plan;
  }

  function boxPixels(el) {
    var style = styleMap(el.getAttribute('style'));
    var parent = el.parentElement;
    var column = parent ? elementWidth(parent) : EMAIL_WIDTH;
    var width = pxLength(style.width) || digitLength(el.getAttribute('width'));
    var portion = percentRatio(style.width) || percentRatio(el.getAttribute('width'));
    if (!width && portion) width = Math.round(column * portion);
    var max = pxLength(style['max-width']) || Math.round(column * (percentRatio(style['max-width']) || 0));
    if (max && (!width || max < width)) width = max;
    // min-width wins over width and max-width, so min-width:100% keeps it full.
    var min = pxLength(style['min-width']) || Math.round(column * (percentRatio(style['min-width']) || 0));
    if (min && width && min > width) width = min;
    return width && width < column ? width : 0;
  }

  function insideOutlookCopy(el) {
    return !!(el.closest && el.closest('a[data-nl-ol]'));
  }

  // ghost: also an Outlook-only table of the box's width around it, for a
  // picture or a div, which Word cannot place by an align of their own.
  function outlookAlignShell(el, plan, width, ghost) {
    var doc = el.ownerDocument;
    var parent = el.parentNode;
    if (!parent) return;
    var pad = plan.left ? 'padding-left:' + plan.left + 'px;' : (plan.right ? 'padding-right:' + plan.right + 'px;' : '');
    var inner = ghost
      ? '<table role="presentation" align="' + plan.align + '" width="' + width + '" cellpadding="0" cellspacing="0" border="0" style="width:' + width + 'px;">' +
        '<tr><td width="' + width + '" style="width:' + width + 'px;">'
      : '';
    parent.insertBefore(doc.createComment(
      '[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
      '<tr><td align="' + plan.align + '" style="text-align:' + plan.align + ';' + pad + '">' + inner + '<![endif]'
    ), el);
    var close = doc.createComment('[if mso]></td></tr></table>' + (ghost ? '</td></tr></table>' : '') + '<![endif]');
    if (el.nextSibling) parent.insertBefore(close, el.nextSibling);
    else parent.appendChild(close);
  }

  function outlookAlignment(root) {
    Array.prototype.slice.call(root.querySelectorAll('table, img, div')).forEach(function (el) {
      if (!el.parentNode || insideOutlookCopy(el)) return;
      var tag = el.tagName;
      if (tag === 'TABLE' && isButtonTableEl(el)) return;
      var style = styleMap(el.getAttribute('style'));
      // Margins only place a box. An inline picture sits on its line of words.
      if (/^inline/i.test(style.display || '')) return;
      if (tag === 'IMG' && !/^block$/i.test(style.display || '')) return;
      var plan = alignPlan(el.getAttribute('style'), tag !== 'DIV');
      if (!plan) {
        // Margins that put a table on the left win over an older align:
        // browsers follow the margins, so Word must not center it.
        var sides = marginSides(el.getAttribute('style'));
        if (tag === 'TABLE' && sides.right === 'auto' && sides.left !== 'auto' &&
            /^(center|right)$/i.test(el.getAttribute('align') || '') && boxPixels(el)) {
          el.setAttribute('data-nl-ol-was-align', el.getAttribute('align'));
          el.removeAttribute('align');
        }
        return;
      }
      var width = boxPixels(el);
      if (!width) return;
      if (tag === 'TABLE') {
        // The pattern classic Outlook places reliably: the box carries
        // align, a pixel width attribute and mso-width-alt, and sits in a
        // full-width cell aligned the same way (Outlook-only here, so the
        // cell's text keeps its own alignment elsewhere). float:none stops
        // browsers from floating a table with align="left" or "right".
        if (String(el.getAttribute('align') || '').toLowerCase() !== plan.align) {
          if (el.getAttribute('align')) el.setAttribute('data-nl-ol-was-align', el.getAttribute('align'));
          else el.setAttribute('data-nl-ol-align', '1');
          el.setAttribute('align', plan.align);
        }
        if (String(el.getAttribute('width') || '') !== String(width)) el.setAttribute('width', String(width));
        var tableStyle = el.getAttribute('style') || '';
        tableStyle = replaceDecl(tableStyle, 'float', 'none');
        // The sides as longhands, after any shorthand, as in the pattern
        // checked in classic Outlook: auto/auto centered, auto/0 on the right.
        if (plan.align === 'center' && !plan.left && !plan.right) {
          tableStyle = replaceDecl(tableStyle, 'margin-left', 'auto');
          tableStyle = replaceDecl(tableStyle, 'margin-right', 'auto');
        } else if (plan.align === 'right' && !plan.right) {
          tableStyle = replaceDecl(tableStyle, 'margin-left', 'auto');
          tableStyle = replaceDecl(tableStyle, 'margin-right', '0');
        }
        tableStyle = replaceDecl(tableStyle, 'mso-width-alt', String(width * 15));
        el.setAttribute('style', tableStyle);
        // Alone in a cell aligned the same way, the cell already places it.
        // An Icon + text box alone in an unaligned cell aligns that cell, the
        // pattern seen working in classic Outlook; its own cells keep
        // text-align:left, so nothing else in the cell moves.
        var holder = el.parentElement;
        if (holder && /^T[DH]$/.test(holder.tagName) && onlyElement(holder) === el && !plan.left && !plan.right) {
          var holderStyle = holder.getAttribute('style') || '';
          if (el.getAttribute('data-nl') === 'icon-text' && !holder.getAttribute('align') && !styleMap(holderStyle)['text-align']) {
            holder.setAttribute('align', plan.align);
            holder.setAttribute('style', replaceDecl(holderStyle, 'text-align', plan.align));
            holder.setAttribute('data-nl-ol-cell-align', '1');
          }
          if (String(holder.getAttribute('align') || '').toLowerCase() === plan.align) return;
        }
        outlookAlignShell(el, plan, width, false);
        return;
      }
      // A picture or a div gets a ghost table of its width as well.
      var box = el;
      if (tag === 'IMG' && el.parentElement && el.parentElement.tagName === 'A' && onlyElement(el.parentElement) === el) box = el.parentElement;
      outlookAlignShell(box, plan, width, true);
    });
  }

  function outlookTableMargins(root) {
    Array.prototype.slice.call(root.querySelectorAll('table')).forEach(function (table) {
      var styleText = table.getAttribute('style') || '';
      var box = marginSides(styleText);
      var top = sidePx(box.top);
      var bottom = sidePx(box.bottom);
      var plan = isButtonTableEl(table) ? horizontalPlan(box) : null;
      var shift = !!(plan && (plan.left || plan.right));
      if (!top && !bottom && !shift) {
        if (plan && String(table.getAttribute('align') || '').toLowerCase() !== plan.align) {
          table.setAttribute('align', plan.align);
        }
        return;
      }
      var next = styleWithoutMargins(styleText, {
        top: marginKeep(box.top, top),
        right: marginKeep(box.right, shift),
        bottom: marginKeep(box.bottom, bottom),
        left: marginKeep(box.left, shift)
      });
      if (next) table.setAttribute('style', next);
      else table.removeAttribute('style');
      var parent = table.parentNode;
      if (!parent) return;
      var doc = table.ownerDocument;
      var nextSibling = table.nextSibling;
      if (top) parent.insertBefore(gapTable(doc, top), table);
      var placed = table;
      if (shift) {
        placed = pinButton(doc, table, plan);
        if (nextSibling) parent.insertBefore(placed, nextSibling);
        else parent.appendChild(placed);
      }
      if (bottom) {
        var host = placed.parentNode;
        if (placed.nextSibling) host.insertBefore(gapTable(doc, bottom), placed.nextSibling);
        else host.appendChild(gapTable(doc, bottom));
      }
    });
  }

  function pinHeightAttr(el, height) {
    if (!el || !height || digitLength(el.getAttribute('height'))) return;
    el.setAttribute('height', String(height));
  }

  function lockValign(el) {
    var value = String(el.getAttribute('valign') || styleMap(el.getAttribute('style'))['vertical-align'] || 'top').toLowerCase();
    if (value === 'center') return 'middle';
    if (value === 'middle' || value === 'bottom' || value === 'top') return value;
    return 'top';
  }

  // Outlook reads a cell's valign; browsers read vertical-align and also the
  // valign attribute. A cell styled top, middle or bottom gets the matching
  // valign, so a value set in the Style Manager reaches Outlook too.
  function outlookValign(root) {
    Array.prototype.forEach.call(root.querySelectorAll('td, th'), function (cell) {
      var styled = String(styleMap(cell.getAttribute('style'))['vertical-align'] || '').trim().toLowerCase();
      if (styled === 'center') styled = 'middle';
      if (!/^(?:top|middle|bottom)$/.test(styled)) return;
      if (String(cell.getAttribute('valign') || '').toLowerCase() !== styled) cell.setAttribute('valign', styled);
    });
  }

  function heightLock(width, height, valign, html) {
    return '<table role="presentation" width="' + width + '" height="' + height +
      '" cellpadding="0" cellspacing="0" border="0" style="width:' + width + 'px;height:' + height +
      'px;border-collapse:collapse;"><tr><td height="' + height + '" valign="' + valign +
      '" style="height:' + height + 'px;vertical-align:' + (valign === 'middle' ? 'middle' : valign) +
      ';">' + html + '</td></tr></table>';
  }

  function outlookBackgrounds(html, measuredHeights) {
    if (typeof DOMParser === 'undefined') return html;
    var parsed = new DOMParser().parseFromString('<!DOCTYPE html><html><body><div id="nl-root">' + html + '</div></body></html>', 'text/html');
    var root = parsed.getElementById('nl-root');
    if (!root) return html;
    scrubOutlookNoise(root);
    outlookTableMargins(root);
    outlookAlignment(root);
    outlookValign(root);
    var measured = measuredHeights || [];
    var wholeShapes = false;
    // A pasted-back export still carries the marker. It is set again below
    // only where the shape wraps the table this time.
    Array.prototype.forEach.call(root.querySelectorAll('.nl-vbg'), function (el) {
      el.classList.remove('nl-vbg');
      if (!el.getAttribute('class')) el.removeAttribute('class');
    });
    var nodes = Array.prototype.slice.call(root.querySelectorAll('td, th, table, div')).filter(hasBackgroundImage);
    for (var index = nodes.length - 1; index >= 0; index--) {
      var el = nodes[index];
      // A descendant can have its own image. Only skip an element that is already wrapped.
      if (/^\s*<!--\[if gte mso 9\]>/i.test(el.innerHTML)) continue;
      // A picture on the outer cell already covers this column. A second VML
      // shape inside that one is dropped by Word and hides the outer picture.
      if (ancestorHasBackground(el)) continue;
      // A div around a table's tbody is invalid. The parser ejects it, and Word
      // then drops the cell's color, alignment, and margin.
      var measure = el;
      var target = el;
      if (el.tagName === 'TABLE') {
        var cells = directCells(el);
        if (cells.length === 1) {
          target = cells[0];
        } else if (wholeSectionBackground(el)) {
          // A top-level 1/2 or 1/3 has no single cell and no section cell
          // around it. The shape goes around the whole table, so every column
          // sits on one picture. The CSS stays on the table for Gmail.
          target = null;
        } else {
          // The nested 3/7 has no single cell. Paint the picture on the outer
          // section cell so both columns sit on it. Leave the CSS on this table
          // when the cell does not already have the picture, or Gmail paints it twice.
          target = nestedBackgroundCell(el);
          if (!target || hasBackgroundImage(target)) continue;
        }
        if (target && /^\s*<!--\[if gte mso 9\]>/i.test(target.innerHTML)) continue;
      }
      var style = styleMap(measure.getAttribute('style'));
      var imageUrl = usableImage(style['background-image']) || usableImage(style.background) || usableImage(measure.getAttribute('background'));
      if (!imageUrl) continue;
      // A percentage width is the whole Word page, not the cell. Pin the shape
      // and an Outlook-only table to the same pixel width, and never past 600.
      var width = Math.min(EMAIL_WIDTH, elementWidth(measure));
      var height = elementHeight(measure, style, imageUrl, measured[index] || 0);
      var color = toHex(style['background-color'] || measure.getAttribute('bgcolor') || '');
      var rect = 'width:' + width + 'px;';
      var textbox = 'inset="0,0,0,0"';
      if (height) rect += 'height:' + height + 'px;';
      else textbox = 'style="mso-fit-shape-to-text:true" inset="0,0,0,0"';
      var open = '<!--[if gte mso 9]><table role="presentation" align="center" width="' + width +
        '" cellpadding="0" cellspacing="0" border="0" style="width:' + width + 'px;"><tr><td width="' + width +
        '" style="width:' + width + 'px;"><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="' +
        rect + '"><v:fill ' + fillAttributes(style, imageUrl, color) + ' /><v:textbox ' + textbox + '><![endif]-->';
      var close = '<!--[if gte mso 9]></v:textbox></v:rect></td></tr></table><![endif]-->';
      if (!target) {
        // The table now sits inside the shape. Its own color would cover the
        // picture in Word, so Outlook gets that color from the fill instead.
        // Other clients still read the color and image from the table's CSS.
        if (color) measure.removeAttribute('bgcolor');
        measure.classList.add('nl-vbg');
        wholeShapes = true;
        if (height) pinHeightAttr(measure, height);
        var whole = measure.outerHTML;
        if (height) whole = heightLock(width, height, lockValign(measure), whole);
        measure.outerHTML = open + '<div style="margin:0;">' + whole + '</div>' + close;
        continue;
      }
      if (target !== measure && target.contains(measure)) {
        // The nested 3/7 sits inside the shape on the outer cell. Like the
        // whole-section case, its own color would cover the picture in Word,
        // so Outlook gets that color from the fill instead.
        if (color) measure.removeAttribute('bgcolor');
        measure.classList.add('nl-vbg');
        wholeShapes = true;
      }
      var inner = target.innerHTML;
      if (height) {
        pinHeightAttr(target, height);
        pinHeightAttr(measure, height);
        inner = heightLock(width, height, lockValign(target), inner);
      }
      target.innerHTML = open + '<div style="margin:0;">' + inner + '</div>' + close;
      // The image stays on the element that already has it. Copying a table
      // image onto the cell makes Gmail paint that image a second time.
      // Both attributes follow the CSS, so a picture or color changed after a
      // paste does not leave the old one behind for the clients that read them.
      if (target === measure) {
        target.setAttribute('background', imageUrl);
        if (color) target.setAttribute('bgcolor', color);
      }
    }
    removeEmptyButtonShells(root);
    fixSpacerCells(root);
    outlookButtons(root);
    outlookText(root);
    tidyAttributes(root);
    var out = stripLeakedClosers(root.innerHTML);
    if (wholeShapes) {
      out = '<!--[if mso]><style type="text/css">.nl-vbg{background:transparent !important;background-color:transparent !important;}</style><![endif]-->' + out;
    }
    return out;
  }

  // A conditional comment that was closed twice leaves --> between tags.
  // The serializer then writes that stray closer as --&gt; in the body.
  function stripLeakedClosers(html) {
    return String(html || '').replace(/>(\s*)(?:-->|--&gt;)(\s*)</g, '>$1$2<');
  }

  var INDENT_INLINE = {
    a: 1, abbr: 1, b: 1, bdo: 1, br: 1, cite: 1, code: 1, em: 1, font: 1, i: 1, img: 1,
    label: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1, u: 1, wbr: 1
  };
  var INDENT_VOID = {
    area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1,
    param: 1, source: 1, track: 1, wbr: 1, '!doctype': 1
  };

  function indentRepeat(count) {
    return new Array((count || 0) + 1).join('  ');
  }

  function indentName(tag) {
    var match = String(tag).match(/^<\/?\s*([^\s/>]+)/);
    return match ? match[1].toLowerCase() : '';
  }

  function indentClosing(tag) {
    return /^<\//.test(tag);
  }

  function indentSelfClose(tag) {
    return /\/>$/.test(tag) || !!INDENT_VOID[indentName(tag)];
  }

  function indentBlock(name) {
    return !!name && !INDENT_INLINE[name] && !INDENT_VOID[name];
  }

  function indentTokens(html) {
    var tokens = [];
    var index = 0;
    while (index < html.length) {
      if (html.substr(index, 4) === '<!--') {
        var commentEnd = html.indexOf('-->', index + 4);
        if (commentEnd === -1) {
          tokens.push({ type: 'text', value: html.slice(index) });
          break;
        }
        tokens.push({ type: 'comment', value: html.slice(index, commentEnd + 3) });
        index = commentEnd + 3;
        continue;
      }
      if (html.charAt(index) === '<') {
        var tagEnd = html.indexOf('>', index + 1);
        if (tagEnd === -1) {
          tokens.push({ type: 'text', value: html.slice(index) });
          break;
        }
        tokens.push({ type: 'tag', value: html.slice(index, tagEnd + 1) });
        index = tagEnd + 1;
        continue;
      }
      var next = html.indexOf('<', index);
      if (next === -1) next = html.length;
      tokens.push({ type: 'text', value: html.slice(index, next) });
      index = next;
    }
    return tokens;
  }

  function indentCss(css) {
    // Quoted strings and url() values are set aside first, so a ";" or "{"
    // inside content:"a;b" or a data URL never breaks the rule apart.
    var kept = [];
    var text = String(css || '').replace(/"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|url\([^)]*\)/gi, function (m) {
      kept.push(m);
      return '\u0001' + (kept.length - 1) + '\u0002';
    }).replace(/[ \t\r\n]+/g, ' ').trim();
    if (!text) return '';
    var broken = text.replace(/\s*\{\s*/g, ' {\n').replace(/;\s*/g, ';\n').replace(/\s*\}\s*/g, '\n}\n')
      .replace(/\u0001(\d+)\u0002/g, function (m, i) { return kept[+i]; });
    var pad = 0;
    var lines = [];
    broken.split('\n').forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.charAt(0) === '}') pad = Math.max(0, pad - 1);
      lines.push(indentRepeat(pad) + trimmed);
      if (/\{$/.test(trimmed)) pad += 1;
    });
    return lines.join('\n');
  }

  function joinInline(parts) {
    var line = parts[0];
    for (var i = 1; i < parts.length; i++) {
      var part = parts[i];
      if (part.charAt(0) === '<') {
        line += part;
        continue;
      }
      var lead = /^[ \t\r\n]/.test(part);
      var tail = /[ \t\r\n]$/.test(part);
      var core = part.replace(/[ \t\r\n]+/g, ' ').trim();
      if (!core) {
        if ((lead || tail) && line.charAt(line.length - 1) !== ' ') line += ' ';
        continue;
      }
      if (lead && line.charAt(line.length - 1) !== ' ') line += ' ';
      line += core;
      if (tail) line += ' ';
    }
    return line;
  }

  // A cell whose children are only text and inline tags stays on one line,
  // so indentation does not push spaces into the words Outlook would show.
  function collectInline(tokens, start) {
    var name = indentName(tokens[start].value);
    var depth = 1;
    var parts = [tokens[start].value];
    var index = start + 1;
    while (index < tokens.length && depth > 0) {
      var token = tokens[index];
      if (token.type === 'comment') return null;
      if (token.type === 'text') {
        parts.push(token.value);
        index++;
        continue;
      }
      var child = indentName(token.value);
      if (!indentClosing(token.value) && indentBlock(child)) return null;
      parts.push(token.value);
      if (indentClosing(token.value)) {
        if (child === name) depth--;
      } else if (!indentSelfClose(token.value) && child === name) {
        depth++;
      }
      index++;
    }
    if (depth !== 0) return null;
    return { text: joinInline(parts), next: index };
  }

  function formatComment(comment) {
    var match = comment.match(/^<!--\[if\s([^\]]+)\]>([\s\S]*)<!\[endif\]-->$/i);
    if (!match || match[2].indexOf('<') === -1) return comment;
    var inner = indentHtml(match[2].trim());
    return '<!--[if ' + match[1] + ']>\n' + inner.trim() + '\n<![endif]-->';
  }

  // Lines break between tags only. A line break inside an attribute value
  // (a long tracking link, say) is part of the value. Indenting it changed
  // the link, and each round trip pushed it further right.
  function splitRows(text) {
    var rows = [];
    var current = '';
    var inTag = false;
    var quote = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inTag) {
        if (quote) {
          if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          inTag = false;
        }
      } else if (ch === '<') {
        inTag = true;
      }
      if (ch === '\n' && !inTag) {
        rows.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    rows.push(current);
    return rows;
  }

  function indentHtml(source) {
    var html = String(source || '').replace(/\r\n/g, '\n').trim();
    if (!html) return '';
    var tokens = indentTokens(html);
    var depth = 0;
    var lines = [];
    var index = 0;
    function emit(text) {
      splitRows(String(text)).forEach(function (row) {
        if (!row.trim()) return;
        lines.push(indentRepeat(depth) + row.replace(/\s+$/, ''));
      });
    }
    while (index < tokens.length) {
      var token = tokens[index];
      if (token.type === 'text') {
        var words = token.value.replace(/[ \t\r\n]+/g, ' ').trim();
        if (words) emit(words);
        index++;
        continue;
      }
      if (token.type === 'comment') {
        emit(formatComment(token.value));
        index++;
        continue;
      }
      var name = indentName(token.value);
      if (indentClosing(token.value)) {
        depth = Math.max(0, depth - 1);
        emit(token.value);
        index++;
        continue;
      }
      if ((name === 'style' || name === 'script') && !indentSelfClose(token.value)) {
        var raw = [];
        var open = token.value;
        index++;
        while (index < tokens.length && !(tokens[index].type === 'tag' && indentClosing(tokens[index].value) && indentName(tokens[index].value) === name)) {
          raw.push(tokens[index].value);
          index++;
        }
        var closeTag = tokens[index] ? tokens[index].value : '</' + name + '>';
        if (tokens[index]) index++;
        emit(open);
        var inner = name === 'style' ? indentCss(raw.join('')) : raw.join('').trim();
        if (inner) {
          depth++;
          emit(inner);
          depth--;
        }
        emit(closeTag);
        continue;
      }
      if (!indentSelfClose(token.value) && indentBlock(name)) {
        var inline = collectInline(tokens, index);
        if (inline) {
          emit(inline.text);
          index = inline.next;
          continue;
        }
        emit(token.value);
        depth++;
        index++;
        continue;
      }
      emit(token.value);
      index++;
    }
    return lines.join('\n') + '\n';
  }

  function dedent(text) {
    var lines = String(text || '').split('\n');
    var min = null;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var lead = line.match(/^[ ]*/)[0].length;
      if (min === null || lead < min) min = lead;
    });
    if (!min) return lines.join('\n').trim();
    return lines.map(function (line) {
      return line.slice(Math.min(min, (line.match(/^[ ]*/) || [''])[0].length));
    }).join('\n').trim();
  }

  function exportBody(editor) {
    var html = exportHtml(editor);
    var match = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
    return match ? dedent(match[1]) + '\n' : '';
  }

  // The editor canvas adds `* { box-sizing: border-box }`. It is not part of the email.
  function stripEditorBoxSizing(html) {
    return html.replace(/\sstyle=(['"])([\s\S]*?)\1/gi, function (_, quote, style) {
      var cleaned = style
        .replace(/(^|;)\s*box-sizing\s*:\s*border-box\s*;?/gi, '$1')
        .replace(/^\s*;\s*/, '')
        .replace(/;\s*;/g, ';')
        .replace(/;\s*$/, '')
        .trim();
      if (!cleaned) return '';
      return ' style=' + quote + cleaned + quote;
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  function widen() {
    var dialog = document.querySelector('.ez-mdl-dialog');
    if (dialog) dialog.style.width = 'min(760px, 94vw)';
  }

  function openPaste(editor) {
    var root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    var help = document.createElement('p');
    help.style.cssText = 'margin:0;font:13px/1.45 Arial,Helvetica,sans-serif;';
    help.textContent = 'Paste an email’s HTML. Styles on the elements stay, and a style block is applied too, so buttons keep their color and padding. Linked stylesheets are not loaded. Scripts are removed.';
    var area = document.createElement('textarea');
    area.rows = 16;
    area.placeholder = '<table>...</table>';
    area.className = 'nl-field';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Load onto canvas';
    button.className = 'nl-btn';
    var status = document.createElement('span');
    status.style.cssText = 'font:13px/1.4 Arial,Helvetica,sans-serif;';
    button.addEventListener('click', function () {
      var result = importHtml(editor, area.value);
      if (result.error) {
        status.textContent = result.error;
        return;
      }
      if (result.cancelled) return;
      editor.Modal.close();
    });
    row.appendChild(button);
    row.appendChild(status);
    root.appendChild(help);
    root.appendChild(area);
    root.appendChild(row);
    editor.Modal.open({ title: 'Paste HTML', content: root });
    widen();
    area.focus();
  }

  // Commands are called as run(editor, sender, options). The sender is the
  // editor when the code button has no sender, and that object has an html
  // function. Only a plain preset, the one Copy body passes, supplies HTML.
  function copyPreset(value) {
    if (!value || typeof value.html !== 'string') return null;
    if (typeof value.get === 'function' || value.Commands) return null;
    return value;
  }

  function openCopy(editor, senderOrPreset, opts) {
    var preset = copyPreset(senderOrPreset) || copyPreset(opts) || {};
    var html = preset.html || exportHtml(editor);
    var root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    var help = document.createElement('p');
    help.style.cssText = 'margin:0;font:13px/1.45 Arial,Helvetica,sans-serif;';
    help.textContent = preset.help || 'HTML only, with styles written onto the elements, in a 600px email column. Paste this into the other platform.';
    var area = document.createElement('textarea');
    area.rows = 16;
    area.readOnly = true;
    area.wrap = 'off';
    area.value = html;
    area.className = 'nl-field';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Copy HTML';
    button.className = 'nl-btn';
    var status = document.createElement('span');
    status.style.cssText = 'font:13px/1.4 Arial,Helvetica,sans-serif;';
    button.addEventListener('click', function () {
      area.focus();
      area.select();
      copyText(html).then(function (ok) {
        status.textContent = ok ? 'Copied.' : 'Clipboard was blocked. The HTML is selected — press Ctrl+C.';
      });
    });
    row.appendChild(button);
    row.appendChild(status);
    root.appendChild(help);
    root.appendChild(area);
    root.appendChild(row);
    editor.Modal.open({ title: preset.title || 'Copy HTML', content: root });
    widen();
    area.focus();
    area.select();
  }

  function copyBody(editor, button) {
    var html = exportBody(editor);
    var original = button ? button.textContent : '';
    copyText(html).then(function (ok) {
      if (ok && button) {
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = original; }, 1400);
        return;
      }
      openCopy(editor, {
        html: html,
        title: 'Copy body',
        help: 'This is only what sits inside the body tag. Styles are on the elements. The document head is not included.'
      });
    });
  }

  // The side preview shows the same Outlook HTML Copy body builds. Conditional
  // comments are resolved the way Word resolves them, VML backgrounds become a
  // picture Edge can paint, and corners are square. The export itself is untouched.
  function msoKeep(cond) {
    var text = String(cond || '').replace(/^\[if\s*/i, '').replace(/\]$/, '').trim();
    if (/!\s*mso/i.test(text) || /^!/.test(text)) return false;
    return /mso/i.test(text);
  }

  function indexOfEndif(html, lower, from) {
    var depth = 1;
    var i = from;
    while (i < html.length) {
      var nextIf = lower.indexOf('<!--[if', i);
      var nextEnd = lower.indexOf('<![endif]-->', i);
      if (nextEnd === -1) return null;
      if (nextIf !== -1 && nextIf < nextEnd) {
        depth++;
        i = nextIf + 7;
        continue;
      }
      depth--;
      if (depth === 0) {
        var contentEnd = nextEnd;
        if (html.slice(nextEnd - 4, nextEnd) === '<!--') contentEnd = nextEnd - 4;
        return { contentEnd: contentEnd, end: nextEnd + '<![endif]-->'.length };
      }
      i = nextEnd + 12;
    }
    return null;
  }

  function resolveMso(html) {
    var source = String(html || '');
    var lower = source.toLowerCase();
    var out = '';
    var i = 0;
    while (i < source.length) {
      var start = lower.indexOf('<!--[if', i);
      if (start === -1) {
        out += source.slice(i);
        break;
      }
      out += source.slice(i, start);
      var endCond = source.indexOf(']>', start);
      if (endCond === -1) {
        out += source.slice(start);
        break;
      }
      var cond = source.slice(start + 4, endCond + 1);
      var cursor = endCond + 2;
      var revealed = source.slice(cursor, cursor + 12).match(/^\s*<!-->/);
      if (revealed) cursor += revealed[0].length;
      var close = indexOfEndif(source, lower, cursor);
      if (!close) {
        out += source.slice(start);
        break;
      }
      if (msoKeep(cond)) out += source.slice(cursor, close.contentEnd);
      i = close.end;
    }
    return out;
  }

  function decodeAttr(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function attrValue(source, name) {
    var match = String(source || '').match(new RegExp('\\b' + name + '\\s*=\\s*("|\')([\\s\\S]*?)\\1', 'i'));
    return match ? decodeAttr(match[2]) : '';
  }

  function cssUrlValue(url) {
    return "url('" + String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "')";
  }

  function vmlPosition(token) {
    var parts = String(token || '0.5,0.5').split(',');
    function axis(value) {
      var n = parseFloat(value);
      if (isNaN(n)) return '50%';
      return Math.round(Math.max(0, Math.min(1, n)) * 100) + '%';
    }
    return axis(parts[0]) + ' ' + axis(parts[1] || parts[0]);
  }

  // A VML shape is an inline object in Word: it takes the width in its own
  // style and sits where the paragraph around it is aligned, or where an
  // aligned table around it puts it. It is drawn as an inline-block, so a
  // shape without an aligned holder stays on the left like in Word.
  // v:roundrect takes its corner from arcsize (a share of the shorter side).
  function paintVml(html) {
    return String(html || '').replace(/<v:(rect|roundrect)\b([^>]*)>([\s\S]*?)<\/v:\1>/gi, function (_, kind, attrs, inner) {
      var fill = (String(inner).match(/<v:fill\b([^>]*?)\/?\s*>/i) || [])[1] || '';
      var src = attrValue(fill, 'src');
      var color = attrValue(fill, 'color') || (/^(?:false|f)$/i.test(attrValue(attrs, 'filled')) ? '' : attrValue(attrs, 'fillcolor'));
      var aspect = attrValue(fill, 'aspect');
      var sizes = attrValue(fill, 'sizes');
      var position = vmlPosition(attrValue(fill, 'position') || attrValue(fill, 'origin'));
      var size = '100% 100%';
      if (/atleast/i.test(aspect)) size = 'cover';
      else if (/atmost/i.test(aspect)) size = 'contain';
      else if (sizes) size = sizes.replace(',', ' ');
      var style = attrValue(attrs, 'style');
      if (style && !/;\s*$/.test(style)) style += ';';
      style += 'display:inline-block;vertical-align:top;box-sizing:border-box;';
      if (kind.toLowerCase() === 'roundrect') {
        var arc = parseFloat(attrValue(attrs, 'arcsize')) || 0;
        var w = pxLength(styleMap(style).width) || 0;
        var h = pxLength(styleMap(style).height) || 0;
        var side = Math.min(w || h, h || w);
        if (arc && side) style += 'border-radius:' + Math.round(side * arc / 100 / 2) + 'px;';
      }
      if (color) style += 'background-color:' + color + ';';
      if (src) {
        style += 'background-image:' + cssUrlValue(src) + ';background-repeat:no-repeat;background-position:' +
          position + ';background-size:' + size + ';';
      }
      var body = String(inner)
        .replace(/<v:fill\b[^>]*?\/?\s*>/gi, '')
        .replace(/<\/?v:textbox\b[^>]*>/gi, '');
      return '<div class="nl-ol-vml" style="' + style.replace(/"/g, '&quot;') + '">' + body + '</div>';
    });
  }

  function dropDecl(style, prop) {
    return String(style || '')
      .replace(new RegExp('(^|;)\\s*' + prop + '\\s*:[^;]*', 'ig'), '$1')
      .replace(/^\s*;\s*/, '')
      .replace(/;\s*;/g, ';')
      .replace(/;\s*$/, '')
      .trim();
  }

  function wordBorderToCss(value) {
    var match = String(value || '').trim().match(/^(solid|dashed|dotted|double)\s+(\S+)\s+(\d+(?:\.\d+)?)pt$/i);
    if (!match) return '';
    return match[3] + 'pt ' + match[1].toLowerCase() + ' ' + match[2];
  }

  function isWordBorder(value) {
    return /^(solid|dashed|dotted|double)\s+\S+\s+\d+(?:\.\d+)?pt$/i.test(String(value || '').trim());
  }

  function applyWordChrome(doc) {
    Array.prototype.forEach.call(doc.querySelectorAll('[style]'), function (el) {
      if (!el.getAttribute || el.tagName === 'STYLE') return;
      var style = styleMap(el.getAttribute('style'));
      var next = el.getAttribute('style') || '';
      var vml = el.classList && el.classList.contains('nl-ol-vml');
      if (!vml) {
        next = dropDecl(next, 'background-image');
        next = dropDecl(next, 'background-repeat');
        next = dropDecl(next, 'background-position');
        next = dropDecl(next, 'background-size');
        if (/url\s*\(/i.test(style.background || '')) next = dropDecl(next, 'background');
      }
      if (style['mso-padding-alt']) {
        next = dropDecl(next, 'padding');
        next = dropDecl(next, 'padding-top');
        next = dropDecl(next, 'padding-right');
        next = dropDecl(next, 'padding-bottom');
        next = dropDecl(next, 'padding-left');
        next = replaceDecl(next, 'padding', style['mso-padding-alt']);
      }
      var border = '';
      if (style['mso-border-alt']) border = wordBorderToCss(style['mso-border-alt']);
      if (!border && isWordBorder(style.border)) border = wordBorderToCss(style.border);
      if (border) next = replaceDecl(next, 'border', border);
      next = dropDecl(next, 'box-shadow');
      next = wordMargins(el, next);
      if (next) el.setAttribute('style', next);
      else el.removeAttribute('style');
    });
    // A cell's align lines up its text, pictures and VML shapes in Word. A
    // table inside the cell goes by its own align. A browser would also center
    // a nested table from the cell's align, so the preview writes it as plain
    // text-align, which leaves tables alone.
    Array.prototype.forEach.call(doc.querySelectorAll('td[align], th[align]'), function (cell) {
      var align = String(cell.getAttribute('align') || '').toLowerCase();
      if (!/^(left|center|right)$/.test(align)) return;
      var style = cell.getAttribute('style') || '';
      if (!styleMap(style)['text-align']) cell.setAttribute('style', replaceDecl(style, 'text-align', align));
    });
  }

  // Word has no auto margins, drops every margin of a table and the side
  // margins of an image.
  // It also ignores width and max-width on a div. The preview does the same,
  // so a box that only CSS margins centered shows where Outlook puts it.
  function wordMargins(el, styleText) {
    var tag = el.tagName;
    if (tag !== 'TABLE' && tag !== 'IMG' && tag !== 'DIV') return styleText;
    var box = marginSides(styleText);
    var next = styleText;
    ['margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom'].forEach(function (name) { next = dropDecl(next, name); });
    var keepSides = tag === 'DIV';
    var left = keepSides && box.left !== 'auto' ? box.left : '0';
    var right = keepSides && box.right !== 'auto' ? box.right : '0';
    // align is what Word places a table with. A browser maps it to auto
    // margins or a float, and an inline margin or float:none cancels that.
    var tableAlign = tag === 'TABLE' ? String(el.getAttribute('align') || '').toLowerCase() : '';
    if (tableAlign === 'center') left = right = 'auto';
    if (tableAlign === 'right') left = 'auto';
    var top = tag === 'TABLE' || box.top === 'auto' ? '0' : box.top;
    var bottom = tag === 'TABLE' || box.bottom === 'auto' ? '0' : box.bottom;
    next = replaceDecl(next, 'margin', [top, right, bottom, left].join(' '));
    if (tag === 'DIV') {
      next = dropDecl(next, 'width');
      next = dropDecl(next, 'max-width');
    }
    return next;
  }

  function previewCss(zoom) {
    var scale = zoom > 0 ? zoom : 1;
    return 'html{zoom:' + scale + ';background:#d5d5d5;}' +
      'body{width:600px !important;max-width:600px !important;margin-left:auto !important;margin-right:auto !important;}' +
      '*{border-radius:0 !important;box-shadow:none !important;}' +
      '.nl-ol-vml{display:block;overflow:hidden;}';
  }

  function outlookPreviewHtml(documentHtml, zoom) {
    var resolved = resolveMso(documentHtml);
    resolved = resolved.replace(/<xml\b[\s\S]*?<\/xml>/gi, '');
    resolved = resolved.replace(/<style\b[^>]*>[^<]*behavior:\s*url\(#default#VML\)[^<]*<\/style>/gi, '');
    resolved = resolved.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    resolved = paintVml(resolved);
    var parsed = new DOMParser().parseFromString(resolved, 'text/html');
    applyWordChrome(parsed);
    var style = parsed.createElement('style');
    style.id = 'nl-ol-preview';
    style.textContent = previewCss(zoom);
    if (parsed.head) parsed.head.appendChild(style);
    return '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
  }

  function bindOutlookPreview(editor) {
    if (editor.__nlOutlookPane) return;
    var button = document.getElementById('nl-outlook');
    var pane = document.getElementById('nl-outlook-pane');
    var frame = document.getElementById('nl-outlook-frame');
    var close = document.getElementById('nl-outlook-close');
    if (!button || !pane || !frame) return;
    editor.__nlOutlookPane = true;
    var open = false;
    var timer = 0;
    var lastHtml = '';

    function zoomForFrame() {
      var width = frame.getBoundingClientRect().width;
      if (!(width > 40)) width = pane.getBoundingClientRect().width || 420;
      return Math.round(Math.max(0.45, Math.min(1, (width - 12) / 600)) * 100) / 100;
    }

    function render() {
      if (!open) return;
      var html = '';
      try {
        html = outlookPreviewHtml(exportHtml(editor), zoomForFrame());
      } catch (err) {
        html = '<!DOCTYPE html><html><body style="font:14px Arial,sans-serif;padding:16px;">The Old Outlook preview could not be built from this email.</body></html>';
      }
      if (!open || html === lastHtml) return;
      lastHtml = html;
      frame.srcdoc = html;
    }

    function schedule() {
      if (!open) return;
      clearTimeout(timer);
      timer = setTimeout(render, 400);
    }

    function relayout() {
      requestAnimationFrame(function () {
        if (editor.refresh) editor.refresh();
      });
    }

    function setOpen(next) {
      open = !!next;
      pane.hidden = !open;
      button.classList.toggle('is-on', open);
      button.setAttribute('aria-pressed', open ? 'true' : 'false');
      if (!open) {
        clearTimeout(timer);
        lastHtml = '';
        relayout();
        return;
      }
      lastHtml = '';
      requestAnimationFrame(function () {
        render();
        relayout();
      });
    }

    // The preview is a picture of the email: a click on a link must not load
    // the linked page inside the pane.
    frame.addEventListener('load', function () {
      var d = frame.contentDocument;
      if (!d) return;
      d.addEventListener('click', function (event) {
        var node = event.target;
        if (node && node.nodeType === 3) node = node.parentElement;
        if (node && node.closest && node.closest('a[href], area[href], form')) event.preventDefault();
      }, true);
    });
    button.addEventListener('click', function () { setOpen(!open); });
    if (close) close.addEventListener('click', function () { setOpen(false); });
    window.addEventListener('resize', function () {
      if (!open) return;
      schedule();
    });
    editor.on('update', schedule);
    editor.on('component:add', schedule);
    editor.on('component:remove', schedule);
    editor.on('component:update', schedule);
    editor.on('nl-email-settings', schedule);
  }

  // The image toggle swaps every src for ## and keeps the picture in src_bkp.
  // Copy HTML, Copy body, My blocks and the saved project use the real one,
  // so an export or a reload while images are hidden keeps the pictures.
  function realImageSources(editor) {
    if (!editor.Components || !editor.Components.getType) return;
    var type = editor.Components.getType('image');
    var proto = type && type.model && type.model.prototype;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'getAttrToHTML')) proto = Object.getPrototypeOf(proto);
    if (!proto || proto.__nlRealSrc) return;
    var attrsToHtml = proto.getAttrToHTML;
    var toJSON = proto.toJSON;
    proto.getAttrToHTML = function () {
      var attrs = attrsToHtml.apply(this, arguments);
      var backup = this.get('src_bkp');
      if (attrs && attrs.src === '##' && backup) attrs.src = backup;
      return attrs;
    };
    proto.toJSON = function () {
      var json = toJSON.apply(this, arguments);
      var backup = this.get('src_bkp');
      if (json && backup) {
        if (json.src === '##') json.src = backup;
        if (json.attributes && json.attributes.src === '##') json.attributes.src = backup;
        delete json.src_bkp;
      }
      return json;
    };
    proto.__nlRealSrc = true;
  }

  function register(editor) {
    editor.Commands.add('nl-paste-html', { run: openPaste });
    realImageSources(editor);
    editor.Commands.add('nl-copy-html', { run: openCopy });
    editor.Commands.add('nl-copy-body', { run: function () { copyBody(editor, document.getElementById('nl-copy-body')); } });
    editor.Commands.add('ez-open-import-template', { run: openPaste });
    editor.Commands.add('export-template', { run: openCopy });

    var pasteBtn = document.getElementById('nl-paste');
    var copyBtn = document.getElementById('nl-copy');
    var bodyBtn = document.getElementById('nl-copy-body');
    if (pasteBtn) pasteBtn.addEventListener('click', function () { openPaste(editor); });
    if (copyBtn) copyBtn.addEventListener('click', function () { openCopy(editor); });
    if (bodyBtn) bodyBtn.addEventListener('click', function () { copyBody(editor, bodyBtn); });
    bindOutlookPreview(editor);
    bindEmailSettings(editor);

    // The code button's tooltip comes from the i18n title, which wins over its
    // attributes. Rename it there so it stays Copy HTML after every render.
    var titles = { 'export-template': 'Copy HTML' };
    var locale = (editor.I18n && editor.I18n.getLocale && editor.I18n.getLocale()) || 'en';
    var messages = {};
    messages[locale] = { panels: { buttons: { titles: titles } } };
    if (editor.I18n && editor.I18n.addMessages) editor.I18n.addMessages(messages);

    var importButton = editor.Panels.getButton('options', 'ez-open-import-template');
    if (importButton) importButton.set('attributes', { title: 'Paste HTML' });
    var exportButton = editor.Panels.getButton('options', 'export-template');
    if (exportButton) exportButton.set('attributes', { title: 'Copy HTML' });
  }

  window.NewsletterHtmlIO = {
    register: register,
    split: split,
    importHtml: importHtml,
    exportHtml: exportHtml,
    exportBody: exportBody,
    outlookPreviewHtml: outlookPreviewHtml
  };
})();
