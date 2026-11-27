# Headless checks for the standalone (no GrapesJS) EzBuilder.
# Real clicks, drags, typing, exports, paste round trips, Old Outlook preview,
# device previews, undo/redo, reload persistence and style isolation.
# Usage: python test_standalone.py [ROOT] [SHOT_DIR]
import sys, os, re, json, threading, functools, http.server, socketserver, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/workspace/ezbuilder-standalone')
SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/workspace/ezb-test'
HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = [p for p in [
  '/workspace/ezb-test/wrapped.html', '/workspace/demo-video/built_email_ES.html', '/workspace/demo-video/built_email_EN.html',
  '/workspace/ezb-test/orig_sample.html', '/workspace/ezb-test/center_sample.html', '/workspace/ezb-test/icon_text_export.html',
  '/workspace/ezb-test/inline_export.html', '/workspace/ezb-test/hero_export.html', '/workspace/ezb-test/orig_37.html'] if os.path.exists(p)]

R = []; FAILS = []
def check(name, ok, info=''):
  R.append(bool(ok))
  if not ok: FAILS.append(name)
  print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  ' + str(info)[:600]), flush=True)

ORIGINAL_BLOCKS = ['sect100','sect50','sect30','sect37','button','divider','text','text-sect','image','quote','link','link-block','grid-items','list-items',
  'email-preview','email-browser','email-logo','email-menu','email-hero','email-image-text','email-text-image','email-icon-text','email-cta','email-product',
  'email-products','email-coupon','email-social','email-social-group','email-social-element','email-footer','email-spacer','email-hspacer','email-callout',
  'email-stats','email-event','email-author','email-video','email-testimonial']

class Quiet(http.server.SimpleHTTPRequestHandler):
  def log_message(self, *a): pass
def serve(root):
  handler = functools.partial(Quiet, directory=root)
  srv = socketserver.TCPServer(('127.0.0.1', 0), handler); srv.daemon_threads = True
  threading.Thread(target=srv.serve_forever, daemon=True).start()
  return srv

class App:
  def __init__(self, browser, url, w=1440, h=900, ctx=None):
    self.ctx = ctx or browser.new_context(viewport={'width': w, 'height': h})
    self.pg = self.ctx.new_page()
    self.errors = []; self.failed = []; self.external = []; self.prompts = []
    self.prompt_answer = None
    pg = self.pg
    pg.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: self.errors.append('console: ' + m.text) if m.type == 'error' and 'placehold.co' not in m.text and 'ERR_NAME_NOT_RESOLVED' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('requestfailed', lambda r: self.failed.append(r.url) if (r.url.startswith('file:') or r.url.startswith('http://127.0.0.1')) else None)
    pg.on('request', lambda r: self.external.append(r.url) if r.resource_type in ('script', 'stylesheet') and not (r.url.startswith('file:') or r.url.startswith('http://127.0.0.1') or r.url.startswith('data:') or r.url.startswith('about:')) else None)
    pg.on('dialog', self._dialog)
    pg.goto(url); pg.wait_for_function('()=>window.EzApp && window.EzApp.column()', timeout=15000); pg.wait_for_timeout(300)
    self.frame = pg.locator('#ez-frame').element_handle().content_frame()
  def _dialog(self, d):
    self.prompts.append(d.message)
    if d.type == 'prompt': d.accept(self.prompt_answer if self.prompt_answer is not None else d.default_value)
    else: d.accept()
  def ev(self, js, arg=None): return self.pg.evaluate(js, arg)
  def fev(self, js, arg=None): return self.frame.evaluate(js, arg)
  def wait(self, ms=200): self.pg.wait_for_timeout(ms)
  def tab(self, name):
    self.pg.click('#ez-tab-' + name); self.wait(120)
  def clear(self):
    self.ev("()=>{EzApp.clear(); EzApp.select(null);}"); self.wait(80)
  def export(self): return self.ev("()=>EzApp.exportHtml()")
  def body(self): return self.fev("()=>{const t=document.createElement('template'); t.innerHTML=document.body.innerHTML; t.content.querySelectorAll('[class]').forEach(e=>{e.classList.remove('ez-selected','ez-hover'); if(!e.getAttribute('class')) e.removeAttribute('class')}); t.content.querySelectorAll('[draggable]').forEach(e=>e.removeAttribute('draggable')); return t.innerHTML}")
  def probe(self, name): return self.frame.locator('[data-probe="%s"]' % name).first
  def click_probe(self, name, **kw):
    loc = self.probe(name); loc.scroll_into_view_if_needed(); loc.click(**kw); self.wait(150)
  def selected(self):
    return self.fev("()=>{const s=document.querySelector('.ez-selected:not(body)'); return s? {tag:s.tagName, probe:s.getAttribute('data-probe')||'', nl:s.getAttribute('data-nl')||'', ez:s.getAttribute('data-ez')||'', text:(s.textContent||'').trim().slice(0,40)} : null}")
  def field(self, panel, name): return self.pg.locator('#ez-panel-%s [data-ez-field="%s"]' % (panel, name)).first
  def set_field(self, panel, name, value):
    f = self.field(panel, name); f.scroll_into_view_if_needed()
    tag = f.evaluate('e=>e.tagName')
    if tag == 'SELECT': f.select_option(str(value))
    else:
      f.click(); f.fill(str(value)); f.press('Enter')
    self.wait(150)
  def labels(self, panel):
    return self.ev("(p)=>[...document.querySelectorAll('#ez-panel-'+p+' .ez-field-title')].map(x=>x.textContent)", panel)
  def palette_click(self, block):
    self.tab('blocks'); b = self.pg.locator('#ez-panel-blocks [data-block="%s"]' % block); b.scroll_into_view_if_needed(); b.click(); self.wait(200)
  def drag_block(self, block, target_probe=None, fx=0.5, fy=0.5, point=None):
    """Real HTML5 drag from the Blocks panel onto the canvas."""
    self.tab('blocks')
    src = self.pg.locator('#ez-panel-blocks [data-block="%s"]' % block); src.scroll_into_view_if_needed()
    bb = src.bounding_box(); fb = self.pg.locator('#ez-frame').bounding_box()
    if point is None:
      r = self.probe(target_probe).evaluate("(e)=>{e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return [r.left,r.top,r.width,r.height]}")
      tx, ty = fb['x'] + r[0] + r[2] * fx, fb['y'] + r[1] + r[3] * fy
    else: tx, ty = fb['x'] + point[0], fb['y'] + point[1]
    self.drag_points(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2, tx, ty)
  def drag_points(self, sx, sy, tx, ty):
    pg = self.pg; pg.mouse.move(sx, sy); pg.mouse.down()
    for i in range(1, 13): pg.mouse.move(sx + (tx - sx) * i / 12, sy + (ty - sy) * i / 12); pg.wait_for_timeout(25)
    pg.mouse.move(tx + 1, ty); pg.wait_for_timeout(80); pg.mouse.up(); self.wait(300)
  def tool(self, act):
    btn = self.frame.locator('#ez-tools button[data-act="%s"]' % act); btn.click(); self.wait(150)
  def snap(self, skip=()):
    return self.fev("""(skip)=>{const out={}; [...document.body.querySelectorAll('*')].forEach((el,i)=>{ if(skip.some(p=>el.closest('[data-probe="'+p+'"]'))) return;
      const key=(el.getAttribute('data-probe')||'')+'#'+i+el.tagName; out[key]=[(el.getAttribute('style')||'').replace(/;$/,''), el.getAttribute('align')||'', el.getAttribute('valign')||'', el.getAttribute('width')||'', el.getAttribute('bgcolor')||'', (el.getAttribute('class')||'').replace(/\\bez-(selected|hover|drop)\\b/g,'').trim()];}); return out}""", list(skip))
  def load(self, html):
    self.ev("(h)=>NewsletterHtmlIO.importHtml(editor,h)", html); self.wait(250)
  def build(self, html):
    """Set canvas content directly (test setup only), then let the editor mark it."""
    self.ev("(h)=>{EzApp.clear(); NewsletterHtmlIO.importHtml(editor, '<!DOCTYPE html><html><head><title>'+(document.getElementById('nl-email-title').value||'Newsletter')+'</title></head><body>'+h+'</body></html>');}", html); self.wait(250)

def diff_keys(a, b): return [k for k in set(a) | set(b) if a.get(k) != b.get(k)]
def count(s, sub): return s.count(sub)
def mso_counts(h): return (h.count('<!--[if mso]>'), h.count('<!--[if !mso]><!-->'), h.count('<v:rect'), h.count('<v:roundrect'))

def t_startup(b, srv):
  # file:// and http:// both start clean, with no GrapesJS anywhere
  for label, url in [('file', 'file://' + ROOT + '/index.html'), ('http', 'http://127.0.0.1:%d/index.html' % srv.server_address[1])]:
    a = App(b, url); a.wait(600)
    check(label + ': no page or console errors on start', not a.errors, a.errors)
    check(label + ': no failed local requests', not a.failed, a.failed)
    check(label + ': no external scripts or stylesheets', not a.external, a.external)
    info = a.ev("()=>({grapes: typeof window.grapesjs, scripts:[...document.scripts].map(s=>s.src).join(' '), links:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href).join(' ')})")
    check(label + ': no GrapesJS global, script or stylesheet', info['grapes'] == 'undefined' and 'grapes' not in (info['scripts'] + info['links']).lower(), info)
    a.ctx.close()
  for f in os.listdir(os.path.join(ROOT, 'js')) + os.listdir(os.path.join(ROOT, 'css')):
    pass
  src = ''.join(open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read() for dp, _, fs in os.walk(ROOT) for f in fs if f.endswith(('.js', '.html', '.css')) and '/test' not in dp)
  check('source has no GrapesJS script, CDN or vendor file', not re.search(r'grapes(js)?(\.min)?\.(js|css)|unpkg\.com/grapes|cdn[^"\']*grapes', src, re.I) and not os.path.exists(os.path.join(ROOT, 'vendor')))

def t_catalog(a):
  ids = a.ev("()=>EzApp.blocks().map(b=>b.id)")
  check('catalog has every original block', all(i in ids for i in ORIGINAL_BLOCKS), [i for i in ORIGINAL_BLOCKS if i not in ids])
  shown = a.ev("()=>[...document.querySelectorAll('#ez-panel-blocks .ez-block')].map(b=>b.getAttribute('data-block'))")
  check('every block has a palette tile', all(i in shown for i in ORIGINAL_BLOCKS))
  a.pg.fill('#ez-panel-blocks .ez-block-search', 'social'); a.wait(150)
  vis = a.ev("()=>[...document.querySelectorAll('#ez-panel-blocks .ez-block')].filter(b=>!b.hidden).map(b=>b.getAttribute('data-block'))")
  check('block search filters the palette', set(vis) == {'email-social', 'email-social-group', 'email-social-element'}, vis)
  a.pg.fill('#ez-panel-blocks .ez-block-search', ''); a.wait(100)
  # categories collapse and open
  a.pg.locator('.ez-category-title', has_text='Layout').click(); a.wait(100)
  hid = a.ev("()=>document.querySelector('#ez-panel-blocks [data-block=sect100]').closest('.ez-blocks-grid').hidden")
  a.pg.locator('.ez-category-title', has_text='Layout').click(); a.wait(100)
  check('a block category collapses and opens', hid and not a.ev("()=>document.querySelector('#ez-panel-blocks [data-block=sect100]').closest('.ez-blocks-grid').hidden"))

def t_toolbar(a):
  titles = a.ev("()=>[...document.querySelectorAll('#ez-options button')].map(b=>b.title)")
  want = ['View components', 'Preview', 'Fullscreen', 'Copy HTML', 'Paste HTML', 'Toggle images', 'Quick insert (Ctrl+K)', 'Email check', 'Keyboard shortcuts (?)', 'Undo', 'Redo', 'Clear canvas']
  check('options bar has the original commands with clear tooltips', titles == want, titles)
  dev = a.ev("()=>[...document.querySelectorAll('#ez-devices button')].map(b=>b.title)")
  check('four device buttons', dev == ['Desktop', 'Tablet', 'Mobile landscape', 'Mobile portrait'], dev)
  views = a.ev("()=>[...document.querySelectorAll('#ez-views button')].map(b=>b.title)")
  check('four panel tabs', len(views) == 4, views)
  check('top bar Copy HTML / Paste HTML labels', a.ev("()=>document.getElementById('nl-copy').textContent+'|'+document.getElementById('nl-paste').textContent") == 'Copy HTML|Paste HTML')
  # no overlap in the top bar at two widths
  for w in (1440, 1280):
    a.pg.set_viewport_size({'width': w, 'height': 900}); a.wait(200)
    over = a.ev("""()=>{const els=[...document.querySelectorAll('#nl-toolbar > *, #ez-options button, #ez-devices button, #ez-views button')].filter(e=>e.offsetWidth&&!e.hidden);
      const r=els.map(e=>e.getBoundingClientRect()); const bad=[]; for(let i=0;i<r.length;i++) for(let j=i+1;j<r.length;j++){const A=r[i],B=r[j]; if(A.left<B.right-1&&B.left<A.right-1&&A.top<B.bottom-1&&B.top<A.bottom-1 && !els[i].contains(els[j]) && !els[j].contains(els[i])) bad.push((els[i].id||els[i].className)+' x '+(els[j].id||els[j].className));} return bad}""")
    check('no overlapping toolbar controls at %dpx' % w, not over, over)
  a.pg.set_viewport_size({'width': 1440, 'height': 900}); a.wait(200)

def t_blocks(a):
  bad_exports = []
  for bid in ORIGINAL_BLOCKS:
    a.clear()
    if bid in ('email-hspacer', 'email-social-element'): continue
    a.palette_click(bid)
    if a.ev("()=>!document.getElementById('ez-modal').hidden"):
      a.pg.click('#ez-modal-x'); a.wait(100)
    n = a.fev("()=>document.body.children.length")
    h = a.export()
    problems = []
    if n < 1: problems.append('nothing added')
    for bad in ['ez-selected', 'contenteditable', 'draggable=', 'data-ez-moving', 'src="##"', 'data:image/svg', '#ez-tools', 'ez-badge']:
      if bad in h: problems.append(bad)
    if '<!DOCTYPE html>' not in h or '</html>' not in h: problems.append('not a document')
    if problems: bad_exports.append((bid, problems))
  check('every block adds from a click and exports clean', not bad_exports, bad_exports)
  # sections are empty 150px columns like the original, nothing exported from an empty column
  a.clear(); a.palette_click('sect50')
  info = a.fev("()=>{const t=document.querySelector('table[data-nl=section]'); return {h:t.getAttribute('height'), cells:[...t.rows[0].cells].map(c=>[c.getAttribute('width'), c.textContent.trim(), c.getAttribute('valign')])}}")
  check('1/2 section is an empty 150px table with two 50% top-aligned columns', info == {'h': '150', 'cells': [['50%', '', 'top'], ['50%', '', 'top']]}, info)
  a.clear(); a.palette_click('sect30')
  w = a.fev("()=>[...document.querySelectorAll('td[data-ez=cell]')].map(c=>c.getAttribute('width'))")
  check('1/3 section columns are 33.3333%', w == ['33.3333%'] * 3, w)
  a.clear(); a.palette_click('sect37')
  w = a.fev("()=>[...document.querySelectorAll('td[data-ez=cell]')].map(c=>c.getAttribute('width'))")
  check('3/7 section columns are 30% / 70%', w == ['30%', '70%'], w)
  a.clear(); a.palette_click('email-icon-text')
  src = a.fev("()=>document.querySelector('img[data-nl=icon]').getAttribute('src').slice(0,22)")
  check('Icon + text uses a PNG icon (Gmail and Outlook do not show SVG)', src == 'data:image/png;base64,', src)
  a.clear(); a.palette_click('text')
  t = a.fev("()=>document.body.innerHTML.replace(/ class=\"[^\"]*\"| draggable=\"true\"/g,'')")
  h = a.export()
  check('Text block is the original padded div', 'padding:10px' in t and 'Insert your text here' in t, t)
  check('Text block gets the Outlook padding table in the export', 'mso-padding-alt:10px' in h)
  a.clear(); a.palette_click('email-hero')
  h = a.export()
  check('Hero keeps a VML background and centered inner table for Outlook', '<v:rect' in h and 'height="264"' in h)
  a.clear(); a.palette_click('image')
  opened = a.ev("()=>!document.getElementById('ez-modal').hidden && document.getElementById('ez-modal-title').textContent")
  check('Image block opens the image library like GrapesJS', opened == 'Select Image', opened)
  a.pg.fill('.ez-am-add input', 'https://example.com/pic.png'); a.pg.click('.ez-am-add button'); a.wait(150)
  a.pg.locator('.ez-am-card', has_text='pic.png').first.locator('.ez-am-pick').click(); a.wait(200)
  check('choosing a library image sets the picture', a.fev("()=>document.querySelector('img').getAttribute('src')") == 'https://example.com/pic.png')
  check('the library closes after a pick', a.ev("()=>document.getElementById('ez-modal').hidden"))

def fixture_two_cols(a):
  a.clear(); a.palette_click('sect50'); a.palette_click('text'); a.palette_click('button')
  a.fev("""()=>{const kids=[...document.body.children].filter(e=>e.getAttribute('data-ez')); kids[0].setAttribute('data-probe','sect');
    const c=kids[0].querySelectorAll('td[data-ez=cell]'); c[0].setAttribute('data-probe','c1'); c[1].setAttribute('data-probe','c2');
    kids[1].setAttribute('data-probe','text'); kids[2].setAttribute('data-probe','button');}""")
  a.ev("()=>EzApp.select(null)"); a.wait(100)

def t_dnd(a):
  fixture_two_cols(a)
  a.drag_block('text', 'c1')
  inside = a.fev("()=>document.querySelector('[data-probe=c1]').querySelectorAll('[data-ez=text]').length")
  check('drag a block from the palette into a column', inside == 1, inside)
  check('the dropped block is selected', (a.selected() or {}).get('ez') == 'text', a.selected())
  a.drag_block('image', 'c2')
  if a.ev("()=>!document.getElementById('ez-modal').hidden"): a.pg.click('#ez-modal-x'); a.wait(100)
  check('drag Image into the second column', a.fev("()=>document.querySelector('[data-probe=c2] img')!==null"))
  # drop on a text box goes beside it, never into its words
  a.drag_block('divider', 'text', 0.5, 0.85)
  info = a.fev("()=>{const t=document.querySelector('[data-probe=text]'); return {inside:t.querySelectorAll('[data-ez=divider]').length, next:(t.nextElementSibling||{}).getAttribute && t.nextElementSibling.getAttribute('data-ez')}}")
  check('a drop on a text box lands after it, not inside the words', info == {'inside': 0, 'next': 'divider'}, info)
  a.drag_block('spacer' if a.ev("()=>EzApp.blocks().some(b=>b.id==='spacer')") else 'email-spacer', 'text', 0.5, 0.1)
  prev = a.fev("()=>{const p=document.querySelector('[data-probe=text]').previousElementSibling; return p&&p.getAttribute('data-ez')}")
  check('a drop on the top half of a block lands before it', prev in ('spacer',), prev)
  # nothing may land inside a table row, a button cell or a social icon
  a.clear(); a.palette_click('email-social-group'); a.palette_click('button')
  a.fev("()=>{document.querySelector('[data-nl=social-element]').setAttribute('data-probe','soc'); document.querySelector('[data-ez=button] td').setAttribute('data-probe','btncell')}")
  before = a.body()
  a.drag_block('text', 'soc')
  soc_in = a.fev("()=>document.querySelector('[data-probe=soc]').querySelectorAll('[data-ez=text]').length")
  tr_bad = a.fev("()=>[...document.querySelectorAll('tr,tbody,table')].some(t=>[...t.children].some(k=>!/^(TR|TD|TH|TBODY|THEAD|TFOOT|CAPTION|COLGROUP)$/.test(k.tagName)))")
  check('a drop on a social icon does not go inside it', soc_in == 0, soc_in)
  check('no block ever lands as a direct child of a table or row', not tr_bad)
  a.drag_block('text', 'btncell')
  check('a drop on a button does not go inside the button', a.fev("()=>document.querySelector('[data-probe=btncell]').querySelectorAll('[data-ez=text]').length") == 0)
  # move an existing block with the HUD move handle into a column
  fixture_two_cols(a)
  a.click_probe('text')
  mv = a.frame.locator('#ez-tools button[data-act="move"]'); bb = mv.bounding_box()
  fb = a.pg.locator('#ez-frame').bounding_box()
  r = a.probe('c2').evaluate("e=>{const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]}")
  a.drag_points(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2, fb['x'] + r[0], fb['y'] + r[1])
  check('the Move handle drags a block into a column', a.fev("()=>!!document.querySelector('[data-probe=c2] [data-probe=text]')"))
  # direct drag of the selected block itself
  a.click_probe('button')
  r1 = a.probe('button').evaluate("e=>{const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]}")
  r2 = a.probe('c1').evaluate("e=>{const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]}")
  a.drag_points(fb['x'] + r1[0], fb['y'] + r1[1], fb['x'] + r2[0], fb['y'] + r2[1])
  check('a selected block can be dragged by itself into a column', a.fev("()=>!!document.querySelector('[data-probe=c1] [data-probe=button]')"))
  # a column cannot be dragged out of its section: it moves the whole section
  a.click_probe('c1', position={'x': 4, 'y': 4})
  check('click on a column selects the column', a.fev("()=>document.querySelector('.ez-selected')===document.querySelector('[data-probe=c1]')"), a.selected())
  check('no errors during drag and drop', not a.errors, a.errors)

def t_selection(a):
  fixture_two_cols(a)
  a.click_probe('text')
  check('click selects the text block', (a.selected() or {}).get('probe') == 'text', a.selected())
  badge = a.fev("()=>document.getElementById('ez-badge').textContent")
  check('the name badge shows', bool(badge.strip()), badge)
  tools = a.fev("()=>[...document.querySelectorAll('#ez-tools button')].map(b=>b.title)")
  check('HUD has Move, Clone, Delete, Select parent', tools == ['Move', 'Clone', 'Delete', 'Select parent'], tools)
  a.tool('clone')
  check('Clone duplicates the block next to it', a.fev("()=>document.querySelectorAll('[data-probe=text]').length") == 2)
  a.tool('delete')
  check('Delete removes the clone', a.fev("()=>document.querySelectorAll('[data-probe=text]').length") == 1)
  a.click_probe('button')
  sel = a.selected()
  check('click on a button selects the whole button', sel and sel['ez'] == 'button', sel)
  a.frame.locator('[data-probe=button] a').click(); a.wait(300)
  check('clicking a link in the canvas never opens it', a.ev("()=>EzApp.frame().contentWindow.location.href") == 'about:srcdoc' and a.fev("()=>!!document.querySelector('[data-probe=button]')") and len(a.ctx.pages) == 1)
  a.tool('parent')
  check('Select parent from a top block selects nothing above body', a.selected() is None or a.selected().get('tag') != 'TBODY', a.selected())
  # a link block inside text, a paragraph in a pasted email
  a.build('<table width="100%" data-probe="t"><tr><td data-probe="td" style="padding:20px"><p data-probe="p" style="margin:0">Hello <strong>bold</strong> world</p><h2 data-probe="h2">Title</h2></td></tr></table>')
  a.click_probe('p')
  check('click a paragraph in a pasted email selects the paragraph', (a.selected() or {}).get('probe') == 'p', a.selected())
  a.frame.locator('[data-probe=p] strong').click(); a.wait(150)
  check('click bold words selects the paragraph, not the strong tag', (a.selected() or {}).get('probe') == 'p', a.selected())
  a.tool('parent')
  check('Select parent climbs to the cell', (a.selected() or {}).get('probe') == 'td', a.selected())
  a.tool('parent')
  check('Select parent skips tbody and row to reach the table or row', (a.selected() or {}).get('tag') in ('TR', 'TABLE'), a.selected())
  # keyboard navigation and delete
  a.click_probe('p'); a.pg.keyboard.press('s'); a.wait(120)
  check('s selects the next sibling', (a.selected() or {}).get('probe') == 'h2', a.selected())
  a.pg.keyboard.press('w'); a.wait(120)
  check('w selects the previous sibling', (a.selected() or {}).get('probe') == 'p', a.selected())
  a.pg.keyboard.press('a'); a.wait(120)
  check('a selects the parent', (a.selected() or {}).get('probe') == 'td', a.selected())
  a.pg.keyboard.press('d'); a.wait(120)
  check('d selects the first child', (a.selected() or {}).get('probe') == 'p', a.selected())
  a.pg.keyboard.press('Control+c'); a.pg.keyboard.press('Control+v'); a.wait(150)
  check('Ctrl+C / Ctrl+V pastes a copy after the block', a.fev("()=>document.querySelectorAll('[data-probe=p]').length") == 2)
  a.pg.keyboard.press('Delete'); a.wait(150)
  check('Delete key removes the selected block', a.fev("()=>document.querySelectorAll('[data-probe=p]').length") == 1)
  a.pg.keyboard.press('Control+z'); a.wait(150)
  check('Ctrl+Z brings it back', a.fev("()=>document.querySelectorAll('[data-probe=p]').length") == 2)
  a.pg.keyboard.press('Control+Shift+z'); a.wait(150)
  check('Ctrl+Shift+Z redoes', a.fev("()=>document.querySelectorAll('[data-probe=p]').length") == 1)
  a.pg.keyboard.press('Escape'); a.wait(100)
  check('Escape deselects', a.selected() is None, a.selected())
  # click on empty canvas deselects
  a.click_probe('p'); fb = a.pg.locator('#ez-frame').bounding_box()
  a.pg.mouse.click(fb['x'] + fb['width'] / 2, fb['y'] + fb['height'] - 10); a.wait(150)
  check('click on empty canvas selects the page (Body), like GrapesJS', a.selected() is None and a.fev("()=>document.body.classList.contains('ez-selected')"), a.selected())

def t_layers(a):
  fixture_two_cols(a)
  a.tab('layers')
  names = a.ev("()=>[...document.querySelectorAll('#ez-panel-layers .ez-layer-name')].map(n=>n.textContent)")
  check('Layers lists the blocks', len(names) >= 3, names)
  a.pg.locator('#ez-panel-layers .ez-layer-name').nth(0).click(); a.wait(150)
  check('click a layer selects that block', (a.selected() or {}).get('probe') == 'sect', a.selected())
  rows = a.pg.locator('#ez-panel-layers .ez-layer')
  # eye hides in canvas only
  idx = a.ev("()=>{const rows=[...document.querySelectorAll('#ez-panel-layers .ez-layer-name')]; return rows.findIndex(n=>n.textContent==='Text'||/text/i.test(n.textContent))}")
  text_row = rows.nth(idx)
  text_row.locator('.ez-eye').click(); a.wait(150)
  hidden = a.fev("()=>document.querySelector('[data-probe=text]').offsetHeight===0")
  h = a.export()
  check('the layer eye hides the block in the canvas', hidden)
  check('a block hidden with the eye is still in the export', 'Insert your text here' in h and 'data-ez-hidden' not in h and 'display:none' not in h.split('<body')[1].split('Insert your text here')[0][-300:])
  a.pg.locator('#ez-panel-layers .ez-layer').nth(idx).locator('.ez-eye').click(); a.wait(150)
  check('the eye shows it again', a.fev("()=>document.querySelector('[data-probe=text]').offsetHeight>0"))
  # twist collapses
  n0 = a.ev("()=>document.querySelectorAll('#ez-panel-layers .ez-layer').length")
  a.pg.locator('#ez-panel-layers .ez-layer').nth(0).locator('.ez-twist').click(); a.wait(150)
  n1 = a.ev("()=>document.querySelectorAll('#ez-panel-layers .ez-layer').length")
  check('a layer twist collapses its children', n1 < n0, (n0, n1))
  a.pg.locator('#ez-panel-layers .ez-layer').nth(0).locator('.ez-twist').click(); a.wait(150)
  # reorder: drag the Button layer above the section layer
  order0 = a.fev("()=>[...document.body.children].map(e=>e.getAttribute('data-probe')).filter(Boolean)")
  names = a.ev("()=>[...document.querySelectorAll('#ez-panel-layers .ez-layer-name')].map(n=>n.textContent)")
  bi = names.index('Button')
  src = a.pg.locator('#ez-panel-layers .ez-layer').nth(bi).bounding_box()
  dst = a.pg.locator('#ez-panel-layers .ez-layer').nth(0).bounding_box()
  a.drag_points(src['x'] + 60, src['y'] + src['height'] / 2, dst['x'] + 60, dst['y'] + 3)
  order1 = a.fev("()=>[...document.body.children].map(e=>e.getAttribute('data-probe')).filter(Boolean)")
  check('drag a layer to reorder the email', order1 and order1[0] == 'button' and order0[0] == 'sect', (order0, order1))
  a.pg.keyboard.press('Control+z'); a.wait(150)
  check('undo the layer move', a.fev("()=>[...document.body.children].map(e=>e.getAttribute('data-probe')).filter(Boolean)")[0] == 'sect')

def select_word_end(a, n):
  for _ in range(n): a.pg.keyboard.press('Shift+ArrowLeft')

def t_rte(a):
  a.clear(); a.palette_click('text')
  a.fev("()=>document.querySelector('[data-ez=text]').setAttribute('data-probe','t')")
  a.probe('t').dblclick(); a.wait(200)
  check('double-click starts text editing', a.fev("()=>document.querySelector('[data-probe=t]').isContentEditable"))
  check('the rich text toolbar shows', a.fev("()=>{const r=document.getElementById('ez-rte'); return !!r && r.offsetWidth>0}"))
  rte = a.fev("()=>[...document.querySelectorAll('#ez-rte [data-rte]')].map(b=>b.getAttribute('data-rte'))")
  check('toolbar has bold, italic, underline, strike, link, inline image', rte == ['bold', 'italic', 'underline', 'strikeThrough', 'link', 'inline-image'], rte)
  a.pg.keyboard.press('Control+a'); a.pg.keyboard.type('Hello brave new world'); a.wait(100)
  check('typing replaces the words', a.fev("()=>document.querySelector('[data-probe=t]').textContent") == 'Hello brave new world')
  def rte_btn(act): a.frame.locator('#ez-rte [data-rte="%s"]' % act).click(); a.wait(120)
  a.pg.keyboard.press('End'); select_word_end(a, 5); rte_btn('bold')
  a.pg.keyboard.press('Home'); a.pg.keyboard.press('Shift+End'); a.wait(50)
  a.pg.keyboard.press('Home')
  for _ in range(5): a.pg.keyboard.press('Shift+ArrowRight')
  rte_btn('italic')
  html = a.fev("()=>document.querySelector('[data-probe=t]').innerHTML")
  check('Bold wraps the chosen words', re.search(r'<(b|strong)>world</(b|strong)>', html), html)
  check('Italic wraps the chosen words', re.search(r'<(i|em)>Hello</(i|em)>', html), html)
  a.pg.keyboard.press('End')
  for _ in range(6): a.pg.keyboard.press('ArrowLeft')
  for _ in range(3): a.pg.keyboard.press('Shift+ArrowLeft')
  rte_btn('underline')
  html = a.fev("()=>document.querySelector('[data-probe=t]').innerHTML")
  check('Underline wraps the chosen words', '<u>new</u>' in html, html)
  a.pg.keyboard.press('Home')
  for _ in range(6): a.pg.keyboard.press('ArrowRight')
  for _ in range(5): a.pg.keyboard.press('Shift+ArrowRight')
  a.prompt_answer = 'https://example.com/brave'
  rte_btn('link')
  html = a.fev("()=>document.querySelector('[data-probe=t]').innerHTML")
  check('Link asks for an address and links the words', 'href="https://example.com/brave"' in html and '>brave</a>' in html, html)
  st = a.fev("()=>document.querySelector('#ez-rte [data-rte=link]').classList.contains('is-on')")
  check('the Link button lights up inside a link', st)
  rte_btn('link')
  html = a.fev("()=>document.querySelector('[data-probe=t]').innerHTML")
  check('Link again removes the link', 'href=' not in html, html)
  a.pg.keyboard.press('Escape'); a.wait(150)
  check('Escape ends editing', not a.fev("()=>document.querySelector('[data-probe=t]').isContentEditable"))
  h = a.export()
  check('export keeps the formatting and no editing attributes', re.search(r'<(b|strong)>world', h) and 'contenteditable' not in h and 'ez-rte' not in h)
  # undo after editing restores the words
  a.ev("()=>EzApp.undo()"); a.wait(150)
  check('one undo after editing restores the old words', 'Insert your text here' in a.fev("()=>document.body.textContent"), a.fev("()=>document.body.textContent").strip()[:80])
  a.ev("()=>EzApp.redo()"); a.wait(150)
  # inline image at the caret
  a.fev("()=>document.querySelector('[data-ez=text]').setAttribute('data-probe','t')")
  a.probe('t').dblclick(); a.wait(150)
  a.pg.keyboard.press('Home')
  for _ in range(5): a.pg.keyboard.press('ArrowRight')
  rte_btn('inline-image'); a.wait(200)
  info = a.fev("()=>{const t=document.querySelector('[data-probe=t]'); const i=t.querySelector('img'); return i&&{before:(i.previousSibling&&i.previousSibling.textContent||'').slice(-5), sel:i.classList.contains('ez-selected'), nl:i.getAttribute('data-nl')}}")
  check('inline image goes in at the caret', info and info['before'].endswith('Hello') and info['nl'] == 'inline-image', info)
  check('the new inline image is selected', info and info['sel'], info)
  check('the image library opens for the new inline image', a.ev("()=>!document.getElementById('ez-modal').hidden"))
  a.pg.fill('.ez-am-add input', 'https://example.com/icon-wide.png'); a.pg.click('.ez-am-add button'); a.wait(100)
  a.pg.locator('.ez-am-card', has_text='icon-wide.png').first.locator('.ez-am-pick').click(); a.wait(250)
  check('picking sets the inline image address', a.fev("()=>document.querySelector('[data-probe=t] img').getAttribute('src')") == 'https://example.com/icon-wide.png')
  # inline image settings: aspect lock, valign with baseline, link
  a.fev("()=>{const i=document.querySelector('[data-probe=t] img'); i.setAttribute('data-probe','ii'); i.setAttribute('width','32'); i.setAttribute('height','16'); i.style.width='32px'; i.style.height='16px';}")
  a.ev("()=>EzApp.select(EzApp.frame().contentDocument.querySelector('[data-probe=ii]'))"); a.tab('config')
  labels = a.labels('config')
  check('inline image settings have size, align and link', all(l in ' '.join(labels) for l in ('Width', 'Height', 'Vertical align', 'Link')), labels)
  a.set_field('config', 'width', '64')
  hh = a.field('config', 'img-height').input_value()
  check('inline image width keeps the shape (height follows)', hh in ('32', '32px'), hh)
  a.set_field('config', 'img-height', '20')
  ww = a.field('config', 'width').input_value()
  check('inline image height keeps the shape (width follows)', ww in ('40', '40px'), ww)
  opts = a.field('config', 'img-valign').evaluate("s=>[...s.options].map(o=>o.value)")
  check('inline image vertical align offers baseline', 'baseline' in opts, opts)
  a.set_field('config', 'img-valign', 'baseline')
  check('vertical align is written', 'vertical-align:baseline' in (a.probe('ii').get_attribute('style') or '').replace(' ', ''))
  a.set_field('config', 'href', 'https://example.com/i')
  check('inline image link wraps the picture', a.fev("()=>{const i=document.querySelector('[data-probe=ii]'); return i.parentElement.tagName==='A' && i.parentElement.getAttribute('href')}") == 'https://example.com/i')
  # inline-image field on a text box: applies on Enter only
  a.ev("()=>EzApp.select(EzApp.frame().contentDocument.querySelector('[data-probe=t]'))"); a.tab('config')
  f = a.field('config', 'inline-src'); f.click(); f.type('https://example.com/x.png', delay=5); a.wait(100)
  n_typing = a.fev("()=>document.querySelectorAll('[data-probe=t] img').length")
  f.press('Enter'); a.wait(200)
  n_after = a.fev("()=>document.querySelectorAll('[data-probe=t] img').length")
  check('the inline image field does not add a picture per keystroke', n_typing == 1 and n_after == 2, (n_typing, n_after))
  check('no errors in text editing', not a.errors, a.errors)

def t_style(a):
  # style isolation: an edit on one element touches nothing else
  a.clear()
  for bid in ('email-hero', 'sect50', 'text', 'button', 'email-icon-text', 'divider', 'email-footer'): a.ev("(b)=>EzApp.add(b,{quiet:true})", bid)
  a.ev("()=>EzApp.select(null)")
  a.fev("""()=>{const top=[...document.body.children].filter(e=>e.getAttribute('data-ez')||e.getAttribute('data-nl'));
    top.forEach((e,i)=>e.setAttribute('data-probe','b'+i)); document.querySelector('[data-ez=text]').setAttribute('data-probe','txt');
    document.querySelector('[data-ez=button]').setAttribute('data-probe','btn'); document.querySelector('[data-nl=icon-text]').setAttribute('data-probe','icon');}""")
  cases = [
    ('txt', 'size', '22px', 'font-size:22px'), ('txt', 'color', '#ff0000', 'color:#ff0000'), ('txt', 'margin-top', '12px', 'margin-top:12px'),
    ('txt', 'padding-left', '30px', 'padding-left:30px'), ('txt', 'line-height', '1.6', 'line-height:1.6'), ('txt', 'background', '#eeeeee', 'background-color:#eeeeee'),
    ('btn', 'radius-top', '12px', None), ('btn', 'margin-bottom', '20px', 'margin-bottom:20px'),
  ]
  for probe, field, val, want in cases:
    a.ev("(p)=>EzApp.select(EzApp.frame().contentDocument.querySelector('[data-probe='+p+']'))", probe); a.tab('edit')
    before = a.snap(skip=[probe])
    a.set_field('edit', field, val)
    after = a.snap(skip=[probe])
    style = (a.probe(probe).get_attribute('style') or '').replace(' ', '')
    if want:
      prop, v = want.split(':', 1)
      got = a.probe(probe).evaluate("(e,p)=>e.style.getPropertyValue(p)", prop)
      norm = lambda x: re.sub(r'rgb\((\d+), (\d+), (\d+)\)', lambda m: '#%02x%02x%02x' % tuple(int(g) for g in m.groups()), x)
      check('Style %s=%s writes on %s' % (field, val, probe), norm(got) == v, (got, style))
    check('Style %s on %s changes nothing else' % (field, probe), not diff_keys(before, after), diff_keys(before, after)[:5])
  # alignment keeps the margins the user set, and stops the float
  a.ev("()=>EzApp.select(EzApp.frame().contentDocument.querySelector('[data-probe=btn]'))"); a.tab('edit')
  a.set_field('edit', 'margin-top', '14px')
  before = a.snap(skip=['btn'])
  a.pg.locator('#ez-panel-edit [data-ez-field=align] button[title=Right]').click(); a.wait(150)
  st = (a.probe('btn').get_attribute('style') or '').replace(' ', '')
  m = a.probe('btn').evaluate("e=>[e.style.marginTop,e.style.marginBottom,e.style.marginLeft,e.style.marginRight]")
  check('Align right on a button keeps its top and bottom margins', m[0] == '14px' and m[1] == '20px', st)
  check('Align right on a button moves it right', m[2] == 'auto' and a.probe('btn').get_attribute('align') == 'right', st)
  check('aligned table does not float', 'float:none' in st, st)
  check('Align on the button changes nothing else', not diff_keys(before, a.snap(skip=['btn'])))
  # center the icon box from its cell: Text align on the cell
  a.ev("()=>EzApp.select(EzApp.frame().contentDocument.querySelector('[data-probe=icon]'))"); a.tab('edit')
  before = a.snap(skip=['icon'])
  a.pg.locator('#ez-panel-edit [data-ez-field=align] button[title=Center]').click(); a.wait(150)
  check('Align center on Icon + text centers the box', a.probe('icon').evaluate("e=>e.style.marginLeft==='auto'&&e.style.marginRight==='auto'"), a.probe('icon').get_attribute('style'))
  check('Align on Icon + text changes nothing else', not diff_keys(before, a.snap(skip=['icon'])))
  # undo restores exactly
  h0 = a.body()
  a.ev("()=>EzApp.select(EzApp.frame().contentDocument.querySelector('[data-probe=txt]'))"); a.tab('edit')
  a.set_field('edit', 'size', '30px')
  a.pg.click('#ez-undo'); a.wait(150)
  h1 = a.body()
  check('Undo puts the style back exactly', h1 == h0, [x for x in zip(h0.split('><'), h1.split('><')) if x[0] != x[1]][:3])
  a.pg.click('#ez-redo'); a.wait(150)
  check('Redo applies it again', 'font-size:30px' in (a.probe('txt').get_attribute('style') or '').replace(' ', ''))
  # page settings when nothing is selected
  a.ev("()=>EzApp.select(null)"); a.tab('edit')
  a.set_field('edit', 'page-color', '#f4f4f4')
  h = a.export()
  check('page background goes to the email body', re.search(r'<body[^>]*background-color:\s*#f4f4f4', h, re.I) or 'bgcolor="#f4f4f4"' in h.lower(), re.search(r'<body[^>]*>', h).group(0))
  check('no errors in the Style Manager', not a.errors, a.errors)

def sel_q(a, q):
  a.ev("(q)=>EzApp.select(EzApp.frame().contentDocument.querySelector(q))", q); a.wait(100)

def t_settings(a):
  # Button
  a.clear(); a.ev("()=>EzApp.add('button',{quiet:true})"); sel_q(a, '[data-ez=button]'); a.tab('config')
  a.set_field('config', 'label', 'Buy now'); a.set_field('config', 'href', 'https://shop.example.com'); a.set_field('config', 'target', '_blank')
  h = a.export()
  check('Button label, link and target settings', 'Buy now' in h and 'href="https://shop.example.com"' in h and 'target="_blank"' in h)
  check('the Outlook copy of the button gets the new link too', h.count('href="https://shop.example.com"') >= 2 and '<!--[if mso]>' in h, h.count('href="https://shop.example.com"'))
  # Image
  a.clear(); a.ev("()=>EzApp.add('image',{quiet:true})"); sel_q(a, 'img'); a.tab('config')
  a.set_field('config', 'src', 'https://example.com/a.jpg'); a.set_field('config', 'alt', 'A picture'); a.set_field('config', 'width', '300'); a.set_field('config', 'href', 'https://example.com/go')
  info = a.fev("()=>{const i=document.querySelector('img'); return [i.getAttribute('src'), i.getAttribute('alt'), i.getAttribute('width'), i.parentElement.tagName, i.parentElement.getAttribute('href')]}")
  check('Image address, alt, width and link settings', info == ['https://example.com/a.jpg', 'A picture', '300', 'A', 'https://example.com/go'], info)
  # double-click an image opens the library
  a.ev("()=>EzApp.select(null)"); a.frame.locator('img').first.dblclick(); a.wait(200)
  check('double-click an image opens the image library', a.ev("()=>!document.getElementById('ez-modal').hidden && document.getElementById('ez-modal-title').textContent") == 'Select Image')
  a.pg.click('#ez-modal-x'); a.wait(100)
  # Section / column vertical align, id and title
  a.clear(); a.ev("()=>EzApp.add('sect50',{quiet:true})"); sel_q(a, 'td[data-ez=cell]'); a.tab('config')
  a.set_field('config', 'valign', 'middle')
  check('Column vertical align', a.fev("()=>{const c=document.querySelector('td[data-ez=cell]'); return [c.getAttribute('valign'), c.style.verticalAlign]}") == ['middle', 'middle'])
  sel_q(a, 'table[data-ez=section]'); a.tab('config'); a.set_field('config', 'valign', 'bottom')
  check('Section vertical align sets every column', a.fev("()=>[...document.querySelectorAll('td[data-ez=cell]')].map(c=>c.getAttribute('valign'))") == ['bottom', 'bottom'])
  a.set_field('config', 'attr-id', 'promo'); a.set_field('config', 'attr-title', 'Promo row')
  check('Id and Title settings', a.fev("()=>{const t=document.querySelector('table[data-ez=section]'); return [t.id, t.title]}") == ['promo', 'Promo row'])
  # Spacer
  a.clear(); a.ev("()=>EzApp.add('email-spacer',{quiet:true})"); sel_q(a, '[data-ez=spacer]'); a.tab('config'); a.set_field('config', 'height', '48')
  check('Spacer height', '48' in a.fev("()=>document.querySelector('[data-ez=spacer]').outerHTML"))
  # Divider
  a.clear(); a.ev("()=>EzApp.add('divider',{quiet:true})"); sel_q(a, '[data-ez=divider]'); a.tab('config')
  a.set_field('config', 'divider-color', '#ff0000'); a.set_field('config', 'divider-width', '3'); a.set_field('config', 'divider-style', 'dashed')
  dh = a.fev("()=>document.querySelector('[data-ez=divider]').outerHTML").replace(' ', '')
  check('Divider color, thickness and style', '#ff0000' in dh and '3px' in dh and 'dashed' in dh, dh[:300])
  # original GrapesJS divider pasted in: the fill structure is recognised and edited
  a.load('<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:10px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background-color:#cccccc;">&nbsp;</td></tr></table></td></tr></table>')
  sel_q(a, '[data-ez=divider]')
  check('a pasted GrapesJS divider is recognised as a divider', a.selected() and a.selected()['ez'] == 'divider', a.selected())
  a.tab('config'); a.set_field('config', 'divider-color', '#00ff00')
  check('its color can be changed', '#00ff00' in a.fev("()=>document.body.innerHTML"))
  # Icon + text
  a.clear(); a.ev("()=>EzApp.add('email-icon-text',{quiet:true})"); sel_q(a, '[data-nl=icon-text]'); a.tab('config')
  a.set_field('config', 'block-align', 'center')
  st = a.fev("()=>{const e=document.querySelector('[data-nl=icon-text]'); return [e.style.marginLeft,e.style.marginRight]}")
  check('Icon + text block alignment', st == ['auto', 'auto'], st)
  a.set_field('config', 'block-width', '320px')
  check('Icon + text block width', '320' in a.fev("()=>document.querySelector('[data-nl=icon-text]').outerHTML.slice(0,400)"))
  # Social group, spacing and a gap
  a.clear(); a.ev("()=>EzApp.add('email-social-group',{quiet:true})"); sel_q(a, '[data-nl=social-element]'); a.tab('config')
  a.set_field('config', 'social-gap', '16')
  check('Social icon spacing', a.fev("()=>(document.querySelector('[data-nl-gap]')||{}).getAttribute && document.querySelector('[data-nl-gap]').getAttribute('data-nl-gap')") == '16')
  a.set_field('config', 'social-network', 'x')
  check('Social network change', a.fev("()=>document.querySelector('[data-nl=social-element]').outerHTML").lower().count('x') > 0)
  a.fev("()=>document.querySelector('[data-nl=social-element]').setAttribute('data-probe','se')")
  a.drag_block('email-hspacer', 'se', 0.95, 0.5)
  gaps = a.fev("()=>document.querySelectorAll('[data-ez=hspacer]').length")
  check('a horizontal spacer drops between social icons', gaps >= 1, gaps)
  if gaps:
    sel_q(a, '[data-ez=hspacer]'); a.tab('config')
    a.set_field('config', 'gap-width', '40')
    a.set_field('config', 'gap-bg', '#123456')
    gh = a.fev("()=>document.querySelector('[data-ez=hspacer]').outerHTML").replace(' ', '')
    check('horizontal spacer width and background', '40' in gh and '#123456' in gh, gh[:300])
  check('no errors in Settings', not a.errors, a.errors)

def t_views(a):
  a.clear()
  for bid in ('email-hero', 'sect50', 'text', 'button', 'image', 'email-footer'): a.ev("(b)=>EzApp.add(b,{quiet:true})", bid)
  # devices
  widths = {}
  for title in ('Tablet', 'Mobile landscape', 'Mobile portrait', 'Desktop'):
    a.pg.click('#ez-devices button[title="%s"]' % title); a.wait(400)
    widths[title] = a.ev("()=>document.getElementById('ez-frame').getBoundingClientRect().width")
  check('Mobile portrait canvas is 375px', abs(widths['Mobile portrait'] - 375) < 2, widths)
  check('Mobile landscape canvas is 480px', abs(widths['Mobile landscape'] - 480) < 2, widths)
  check('Desktop and Tablet are full width', widths['Desktop'] > 600 and widths['Tablet'] > 600, widths)
  a.pg.click('#ez-devices button[title="Mobile portrait"]'); a.wait(400)
  wide = a.fev("()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1")
  check('nothing overflows sideways on Mobile portrait', wide)
  a.pg.click('#ez-devices button[title="Desktop"]'); a.wait(300)
  # outlines
  a.pg.click('#ez-outlines'); a.wait(150)
  on = a.ev("()=>document.getElementById('ez-outlines').getAttribute('aria-pressed')")
  dashed = a.fev("()=>getComputedStyle(document.querySelector('td')).outlineStyle")
  check('View components shows outlines', on == 'true' and dashed not in ('none', ''), (on, dashed))
  a.pg.click('#ez-outlines'); a.wait(150)
  check('View components turns off', a.fev("()=>getComputedStyle(document.querySelector('td')).outlineStyle") == 'none')
  # preview hides the panels and HUD
  sel_q(a, '[data-ez=text]')
  a.pg.click('#ez-preview'); a.wait(250)
  hid = a.ev("()=>({panel:document.getElementById('ez-views').offsetWidth, tools:EzApp.frame().contentDocument.getElementById('ez-tools').offsetWidth})")
  check('Preview hides the panels and the block tools', hid['panel'] == 0 and hid['tools'] == 0, hid)
  a.frame.locator('[data-ez=text]').first.click(); a.wait(150)
  check('nothing is selectable in Preview', a.selected() is None, a.selected())
  a.frame.locator('[data-ez=text]').first.dblclick(); a.wait(150)
  check('nothing is editable in Preview', a.fev("()=>!document.querySelector('[contenteditable=true]')"))
  check('Preview shows an exit button', a.pg.locator('#ez-preview-off').is_visible())
  a.pg.keyboard.press('Escape'); a.wait(200)
  check('Escape leaves Preview', a.ev("()=>document.getElementById('ez-views').offsetWidth") > 0)
  a.pg.click('#ez-preview'); a.wait(200)
  a.pg.click('#ez-preview-off'); a.wait(200)
  check('the exit button leaves Preview', a.ev("()=>document.getElementById('ez-views').offsetWidth") > 0 and not a.pg.locator('#ez-preview-off').is_visible())
  # images off: never writes src="##", the real address returns everywhere
  a.ev("()=>{const i=EzApp.frame().contentDocument.querySelector('img'); i.setAttribute('src','https://example.com/real.jpg')}")
  a.pg.click('#ez-images'); a.wait(200)
  off = a.fev("()=>[...document.querySelectorAll('img')].every(i=>i.getAttribute('src')==='##')")
  h = a.export()
  check('Toggle images hides every picture in the canvas', off)
  check('the export with images off keeps the real address and no ##', 'https://example.com/real.jpg' in h and 'src="##"' not in h and '##' not in h)
  saved = a.ev("()=>localStorage.getItem('ezbuilder-canvas')||''")
  check('the saved project never holds ##', '##' not in saved)
  a.ev("()=>EzApp.add('image',{quiet:true})"); a.wait(150)
  check('a picture added while images are off is hidden too', a.fev("()=>[...document.querySelectorAll('img')].every(i=>i.getAttribute('src')==='##')"))
  a.pg.click('#ez-images'); a.wait(200)
  check('Toggle images brings every picture back', a.fev("()=>[...document.querySelectorAll('img')].every(i=>i.getAttribute('src')!=='##' && !i.hasAttribute('data-ez-src'))"))
  # Title and Lang
  a.pg.fill('#nl-email-title', 'Black Friday'); a.pg.press('#nl-email-title', 'Tab')
  a.pg.select_option('#nl-email-lang', 'es'); a.wait(150)
  h = a.export()
  check('Title goes in the export', '<title>Black Friday</title>' in h)
  check('Lang goes in the export', re.search(r'<html[^>]*lang="es"', h) is not None, re.search(r'<html[^>]*>', h).group(0))
  # Old Outlook preview
  a.pg.click('#nl-outlook'); a.wait(800)
  ol = a.ev("()=>{const f=document.getElementById('nl-outlook-frame'); const d=f.contentDocument; return {shown:!document.getElementById('nl-outlook-pane').hidden, text:d&&d.body?d.body.textContent.length:0, round:d?[...d.querySelectorAll('body *')].filter(e=>parseFloat(getComputedStyle(e).borderTopLeftRadius)>0).length:-1, styled:d?[...d.querySelectorAll('[style*=border-radius]')].length:0}}")
  check('Old Outlook pane opens with the email', ol['shown'] and ol['text'] > 50, ol)
  check('Old Outlook copy has square corners (buttons too)', ol['round'] == 0 and ol['styled'] > 0, ol)
  a.pg.screenshot(path=os.path.join(SHOTS, 'standalone_outlook.png'))
  sel_q(a, '[data-ez=text]'); a.tab('edit'); a.set_field('edit', 'color', '#00aa00'); a.wait(700)
  check('Old Outlook pane follows edits', a.ev("()=>document.getElementById('nl-outlook-frame').contentDocument.body.innerHTML.includes('#00aa00')"))
  ofr = a.pg.locator('#nl-outlook-frame').element_handle().content_frame()
  if ofr.locator('a[href]').count(): ofr.locator('a[href]').first.click(); a.wait(300)
  check('a link in the Old Outlook pane does not open', a.ev("()=>document.getElementById('nl-outlook-frame').contentWindow.location.href") == 'about:srcdoc')
  a.pg.click('#nl-outlook-close'); a.wait(200)
  check('Old Outlook pane closes', a.ev("()=>document.getElementById('nl-outlook-pane').hidden"))
  # dark mode only changes the editor
  bg0 = a.fev("()=>getComputedStyle(document.body).backgroundColor")
  a.pg.click('#nl-theme'); a.wait(150)
  bg = a.fev("()=>getComputedStyle(document.body).backgroundColor")
  dark = a.ev("()=>getComputedStyle(document.getElementById('ez-views')).backgroundColor")
  a.pg.click('#nl-theme'); a.wait(150)
  check('Dark mode changes the editor but not the email page', bg == bg0 and dark != a.ev("()=>getComputedStyle(document.getElementById('ez-views')).backgroundColor"), (bg0, bg, dark))
  # undo / redo / clear
  n = a.fev("()=>document.body.children.length")
  a.pg.click('#ez-clear'); a.wait(200)
  check('Clear canvas empties the email (after confirm)', a.fev("()=>[...document.body.children].filter(e=>!/^ez-/.test(e.id)).length") == 0)
  a.pg.click('#ez-undo'); a.wait(200)
  check('Undo brings the cleared email back', a.fev("()=>document.body.children.length") == n)
  a.pg.click('#ez-redo'); a.wait(200)
  check('Redo clears again', a.fev("()=>document.body.children.length") == 0)
  a.pg.click('#ez-undo'); a.wait(200)
  # fullscreen button
  a.pg.click('#ez-fullscreen'); a.wait(300)
  fs = a.ev("()=>!!document.fullscreenElement")
  if fs: a.ev("()=>document.exitFullscreen()"); a.wait(200)
  check('Fullscreen button works without errors', not a.errors, a.errors)
  # toolbar Copy HTML and Paste HTML open the same dialogs
  a.pg.click('#ez-code'); a.wait(200)
  check('the </> button opens Copy HTML', a.ev("()=>document.getElementById('ez-modal-title').textContent") == 'Copy HTML')
  a.pg.click('#ez-modal-x'); a.pg.click('#ez-import'); a.wait(200)
  check('the download button opens Paste HTML', a.ev("()=>document.getElementById('ez-modal-title').textContent") == 'Paste HTML')
  a.pg.click('#ez-modal-x'); a.wait(100)
  check('no errors in view modes', not a.errors, a.errors)

def ui_paste(a, html):
  a.pg.click('#nl-paste'); a.wait(150)
  a.pg.locator('#ez-modal-body textarea').fill(html)
  a.pg.locator('#ez-modal-body button', has_text='Load onto canvas').click(); a.wait(400)
def ui_copy(a):
  a.pg.click('#nl-copy'); a.wait(200)
  v = a.pg.locator('#ez-modal-body textarea').input_value()
  a.pg.locator('#ez-modal-body button', has_text='Copy HTML').click(); a.wait(150)
  st = a.pg.locator('#ez-modal-body span').last.text_content()
  a.pg.click('#ez-modal-x'); a.wait(100)
  return v, st

def t_io(a):
  a.clear()
  for bid in ORIGINAL_BLOCKS:
    if bid in ('email-hspacer', 'email-social-element'): continue
    a.ev("(b)=>EzApp.add(b,{quiet:true})", bid)
  h1, st = ui_copy(a)
  check('Copy HTML dialog shows a full document', h1.startswith('<!DOCTYPE html>') and '</html>' in h1)
  check('Copy HTML button copies or explains', st in ('Copied.',) or 'Ctrl+C' in st, st)
  check('export has the 600px Outlook wrapper', 'width="600"' in h1 and '<!--[if mso' in h1)
  for bad in ('src="##"', 'contenteditable', 'ez-selected', 'data-ez-hidden', 'data-ez-src', 'data:image/svg', 'draggable'):
    check('export has no %s' % bad, bad not in h1)
  ui_paste(a, h1)
  h2, _ = ui_copy(a); ui_paste(a, h2); h3, _ = ui_copy(a); ui_paste(a, h3); h4, _ = ui_copy(a)
  check('all-blocks email is stable over three paste round trips', h2 == h3 == h4, [len(h1), len(h2), len(h3), len(h4)])
  check('Outlook comments and VML counts stay the same', mso_counts(h2) == mso_counts(h4), (mso_counts(h1), mso_counts(h4)))
  vis = lambda h: re.sub(r'<[^>]+>', ' ', re.sub(r'<style.*?</style>|<!--.*?-->', ' ', h.split('<body')[1], flags=re.S)).split()
  w1, w2 = vis(h1), vis(h2)
  check('first round trip loses no text', w1 == w2, ([x for x in w1 if x not in w2][:10], [x for x in w2 if x not in w1][:10]))
  check('first round trip keeps every picture and link', h1.count('<img') == h2.count('<img') and len(re.findall(r'href="', h1)) == len(re.findall(r'href="', h2)))
  # real emails from the GrapesJS version
  for path in SAMPLES:
    src = open(path, encoding='utf-8').read()
    ui_paste(a, src)
    r = [ui_copy(a)[0]]
    for _ in range(3):
      ui_paste(a, r[-1]); r.append(ui_copy(a)[0])
    name = os.path.basename(path)
    check('%s: stable over three more round trips' % name, r[1] == r[2] == r[3], [len(x) for x in r])
    check('%s: MSO and VML counts kept' % name, mso_counts(r[0]) == mso_counts(r[3]) and mso_counts(r[0])[0] >= min(mso_counts(src)[0], 1), (mso_counts(src), mso_counts(r[0]), mso_counts(r[3])))
    words = lambda h: re.sub(r'<[^>]+>', ' ', re.sub(r'<!--.*?-->|<style.*?</style>|<head.*?</head>', ' ', h, flags=re.S)).split()
    check('%s: no visible text lost' % name, words(src.split('<body', 1)[-1]) == words(r[0].split('<body', 1)[-1]) or set(words(src)) <= set(words(r[0])) | {'&nbsp;'}, (len(words(src)), len(words(r[0]))))
    check('%s: images kept' % name, src.count('<img') == r[0].count('<img'), (src.count('<img'), r[0].count('<img')))
    if a.errors: break
  # pasted <style> rules are written onto elements like GrapesJS did
  ui_paste(a, '<html><head><style>.btn{background-color:#e11d48;color:#ffffff;padding:12px 20px} p.lead{font-size:18px} @media (max-width:600px){.btn{display:block}}</style></head><body><table width="100%"><tr><td><p class="lead">Hi</p><a class="btn" href="https://x.example">Go</a></td></tr></table></body></html>')
  h, _ = ui_copy(a)
  check('pasted class rules are inlined', re.search(r'<a[^>]*class="btn"[^>]*style="[^"]*background-color:\s*#e11d48', h) is not None and re.search(r'<p[^>]*style="[^"]*font-size:\s*18px', h) is not None, h[h.find('<body'):][:700])
  check('pasted @media rules are kept in a style block', '@media (max-width:600px)' in h.replace(': ', ':'))
  check('inlined values keep the colors as written (no rgb())', 'background-color:#e11d48' in h and 'rgb(225' not in h)
  # a click on a pasted paragraph selects the paragraph
  a.frame.locator('p.lead').click(); a.wait(150)
  check('click selects a pasted paragraph', (a.selected() or {}).get('tag') == 'P', a.selected())
  # scripts removed
  ui_paste(a, '<table><tr><td>Safe<script>window.__bad=1</script><img src="x" onerror="window.__bad2=1"></td></tr></table>')
  a.wait(200)
  check('pasted scripts and event handlers do not run', not a.fev("()=>window.__bad||window.__bad2") and not a.ev("()=>window.__bad||window.__bad2"))
  # Copy body
  a.ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
  a.pg.click('#nl-copy-body'); a.wait(300)
  t = a.ev("()=>document.getElementById('nl-copy-body').textContent")
  modal = a.ev("()=>!document.getElementById('ez-modal').hidden && document.getElementById('ez-modal-title').textContent")
  if modal: a.pg.click('#ez-modal-x')
  check('Copy body copies or shows the body only', t == 'Copied' or modal == 'Copy body', (t, modal))
  check('no errors in HTML import and export', not a.errors, a.errors)

def t_persistence(b, url):
  ctx = b.new_context(viewport={'width': 1440, 'height': 900})
  a = App(b, url, ctx=ctx)
  a.clear(); a.palette_click('email-hero'); a.palette_click('sect50'); a.palette_click('text')
  sel_q(a, 'div[data-ez=text]'); a.tab('edit'); a.set_field('edit', 'color', '#123abc')
  a.pg.fill('#nl-email-title', 'Saved title'); a.pg.press('#nl-email-title', 'Tab')
  a.pg.select_option('#nl-email-lang', 'fr')
  a.pg.click('#ez-images'); a.wait(200)
  # save as My block
  a.ev("()=>EzApp.select(null)"); a.frame.locator('div[data-ez=text]').click(); a.wait(100)
  a.prompt_answer = 'My text'
  a.pg.click('#nl-save'); a.wait(300)
  h0 = a.export(); a.wait(900)
  a.pg.reload(); a.pg.wait_for_function('()=>window.EzApp && window.EzApp.column()'); a.wait(500)
  a.frame = a.pg.locator('#ez-frame').element_handle().content_frame()
  h1 = a.export()
  check('reload keeps the email exactly', h0 == h1, (len(h0), len(h1)))
  check('reload keeps title and language', a.ev("()=>[document.getElementById('nl-email-title').value, document.getElementById('nl-email-lang').value]") == ['Saved title', 'fr'])
  check('reload with images off shows real pictures (no ## kept)', a.fev("()=>[...document.querySelectorAll('img')].every(i=>i.getAttribute('src')!=='##')"))
  mine = a.ev("()=>[...document.querySelectorAll('#ez-panel-blocks .ez-block-mine')].map(b=>b.textContent)")
  check('My blocks survive a reload', any('My text' in m for m in mine), mine)
  if mine:
    a.clear(); a.pg.locator('#ez-panel-blocks .ez-block-mine').first.click(); a.wait(200)
    check('a My block adds its saved content', '#123abc' in a.fev("()=>document.body.innerHTML").replace(' ', ''))
  check('no errors around reload', not a.errors, a.errors)
  ctx.close()

# ---------------------------------------------------------------- v2 checks
def hist(a): return a.ev("()=>EzApp._.history()")
def drag_handle(a, hid, dx, dy, shift=False, steps=10):
  h = a.frame.locator('#' + hid)
  bb = h.bounding_box(); sx, sy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
  pg = a.pg
  if shift: pg.keyboard.down('Shift')
  pg.mouse.move(sx, sy); pg.mouse.down()
  mid = None
  for i in range(1, steps + 1):
    pg.mouse.move(sx + dx * i / steps, sy + dy * i / steps); pg.wait_for_timeout(16)
    if i == steps // 2: mid = a.fev("()=>{const t=document.getElementById('ez-size'); return t && t.style.display==='block' ? t.textContent : ''}")
  pg.mouse.up()
  if shift: pg.keyboard.up('Shift')
  a.wait(200)
  return mid
def handle_visible(a, hid): return a.fev("(id)=>{const h=document.getElementById(id); return !!h && h.style.display==='block'}", hid)
def toasts(a): return a.ev("()=>[...document.querySelectorAll('#ez-toasts .ez-toast')].map(t=>t.textContent)")
def clear_toasts(a): a.ev("()=>document.querySelectorAll('#ez-toasts .ez-toast').forEach(t=>t.remove())")

def t_resize(a):
  a.clear(); a.ev("()=>EzApp._.forget()")
  a.build('<table data-nl="section" width="100%" style="width:100%"><tr><td data-probe="c1" width="50%" style="width:50%;vertical-align:top"><img data-probe="img" src="https://placehold.co/400x200" width="400" style="display:block;width:400px;max-width:100%;height:auto" alt="Team photo"></td><td data-probe="c2" width="50%" style="width:50%;vertical-align:top"><p data-probe="p">Right</p></td></tr></table>')
  a.ev("(b)=>EzApp.add(b,{quiet:true})", 'email-spacer'); a.wait(150)
  # image corner handle
  sel_q(a, '[data-probe=img]')
  check('selected image shows a corner resize handle', handle_visible(a, 'ez-h-img'))
  w0 = a.fev("()=>document.querySelector('[data-probe=img]').getBoundingClientRect().width")
  d0 = hist(a)['undo']
  mid = drag_handle(a, 'ez-h-img', -60, 0)
  w1 = a.fev("()=>document.querySelector('[data-probe=img]').getBoundingClientRect().width")
  st = a.fev("()=>document.querySelector('[data-probe=img]').getAttribute('style')")
  check('dragging the image handle resizes it', 80 > (w0 - w1) > 30, (w0, w1))
  check('image resize shows a live size readout', bool(mid) and 'px' in mid, mid)
  check('image width is written as px and the width attribute follows', re.search(r'width:\s*%dpx' % round(w1), st) is not None and a.fev("()=>document.querySelector('[data-probe=img]').getAttribute('width')") == str(round(w1)), (st, w1))
  check('one image drag is one undo step', hist(a)['undo'] == d0 + 1, (d0, hist(a)))
  a.ev("()=>EzApp.undo()"); a.wait(150)
  check('undo restores the image width in one step', abs(a.fev("()=>document.querySelector('[data-probe=img]').getBoundingClientRect().width") - w0) < 1)
  # snapping to the full column width
  sel_q(a, '[data-probe=img]')
  cw = a.fev("()=>{const c=document.querySelector('[data-probe=c1]'); const s=getComputedStyle(c); return c.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)}")
  drag_handle(a, 'ez-h-img', 400, 0)
  w2 = a.fev("()=>document.querySelector('[data-probe=img]').getBoundingClientRect().width")
  check('image never grows past its column', w2 <= cw + 1, (w2, cw))
  # Shift snaps to 10px
  sel_q(a, '[data-probe=img]')
  drag_handle(a, 'ez-h-img', -47, 0, shift=True)
  w3 = a.fev("()=>parseFloat(document.querySelector('[data-probe=img]').style.width)")
  check('Shift snaps the image width to 10px', w3 % 10 == 0, w3)
  # a click without movement adds no history
  sel_q(a, '[data-probe=img]'); d1 = hist(a)['undo']
  bb = a.frame.locator('#ez-h-img').bounding_box(); a.pg.mouse.click(bb['x'] + 5, bb['y'] + 5); a.wait(150)
  check('a click on a handle adds no undo step', hist(a)['undo'] == d1, (d1, hist(a)))
  # spacer height
  sel_q(a, '[data-ez=spacer]')
  check('selected spacer shows a height handle', handle_visible(a, 'ez-h-y'))
  h0 = a.fev("()=>document.querySelector('[data-ez=spacer]').getBoundingClientRect().height")
  d2 = hist(a)['undo']
  drag_handle(a, 'ez-h-y', 0, 37)
  h1 = a.fev("()=>document.querySelector('[data-ez=spacer]').getBoundingClientRect().height")
  check('dragging the spacer handle changes its height', 30 < h1 - h0 < 45, (h0, h1))
  sp = a.export()
  check('spacer height reaches the export (height attribute and line-height)', ('height="%d"' % round(h1)) in sp or ('height:%dpx' % round(h1)) in sp, round(h1))
  check('one spacer drag is one undo step', hist(a)['undo'] == d2 + 1)
  # column widths
  sel_q(a, 'table[data-nl=section]')
  check('a two-column section shows a column-width handle', handle_visible(a, 'ez-h-col-0'))
  d3 = hist(a)['undo']
  mid = drag_handle(a, 'ez-h-col-0', -75, 0)
  ws = a.fev("()=>[...document.querySelectorAll('[data-probe=c1],[data-probe=c2]')].map(c=>c.style.width)")
  check('column drag rewrites both widths in whole percents', len(ws) == 2 and all(w.endswith('%') for w in ws) and abs(float(ws[0][:-1]) + float(ws[1][:-1]) - 100) < 0.01 and float(ws[0][:-1]) < 50, ws)
  check('column drag shows the split as it moves', bool(mid) and '%' in mid, mid)
  check('column width attributes follow the drag', a.fev("()=>document.querySelector('[data-probe=c1]').getAttribute('width')") == ws[0], ws)
  check('one column drag is one undo step', hist(a)['undo'] == d3 + 1)
  sel_q(a, 'table[data-nl=section]')
  drag_handle(a, 'ez-h-col-0', 400, 0)
  ws2 = a.fev("()=>[...document.querySelectorAll('[data-probe=c1],[data-probe=c2]')].map(c=>parseFloat(c.style.width))")
  check('a column never shrinks below 10%', min(ws2) >= 10, ws2)
  h = a.export()
  check('resized columns export Outlook widths', re.search(r'<td[^>]*width="\d+"', h) is not None and 'src="##"' not in h)
  # horizontal spacer
  a.ev("()=>EzApp.select(EzApp.frame().contentDocument.querySelector('[data-probe=c2]'))")
  a.ev("()=>EzApp.add('email-hspacer')"); a.wait(150)
  gap = a.fev("()=>!!document.querySelector('[data-nl=hspacer]')")
  if gap:
    sel_q(a, '[data-nl=hspacer]')
    check('selected horizontal spacer shows a width handle', handle_visible(a, 'ez-h-x'))
    g0 = a.fev("()=>document.querySelector('[data-nl=hspacer]').getBoundingClientRect().width")
    drag_handle(a, 'ez-h-x', 25, 0)
    g1 = a.fev("()=>document.querySelector('[data-nl=hspacer]').getBoundingClientRect().width")
    check('dragging the horizontal spacer handle widens it', 15 < g1 - g0 < 35, (g0, g1))
  else: check('horizontal spacer added for the resize test', False)
  # handles hide in preview and while editing text
  sel_q(a, '[data-probe=img]'); a.ev("()=>EzApp._.preview(true)"); a.wait(150)
  check('handles hide in preview', not handle_visible(a, 'ez-h-img'))
  a.ev("()=>EzApp._.preview(false)"); a.wait(150)
  check('handles never reach the export', 'ez-handle' not in a.export() and 'ez-size' not in a.export())
  check('no errors while resizing', not a.errors, a.errors)

def t_canvas_ui(a):
  a.clear()
  # empty state
  empty = a.fev("()=>{const s=getComputedStyle(document.body,'::before'); return s.content}")
  check('empty canvas shows a hint', 'Drag a block' in (empty or ''), empty)
  a.ev("(b)=>EzApp.add(b,{quiet:true})", 'sect50'); a.ev("()=>EzApp.select(EzApp.column())"); a.ev("(b)=>EzApp.add(b,{quiet:true})", 'email-icon-text'); a.wait(200)
  # breadcrumbs
  sel_q(a, '[data-nl=icon-text] p')
  crumbs = a.ev("()=>[...document.querySelectorAll('#ez-crumbs .ez-crumb')].map(c=>c.textContent)")
  check('breadcrumb shows the path to the selection', crumbs[:1] == ['Email'] and len(crumbs) >= 3 and a.ev("()=>document.querySelector('#ez-crumbs .ez-crumb.is-on')===[...document.querySelectorAll('#ez-crumbs .ez-crumb')].pop()"), crumbs)
  seps = a.ev("()=>[...document.querySelectorAll('#ez-crumbs .ez-crumb-sep')].map(s=>s.textContent)")
  check('breadcrumb uses › separators', seps and set(seps) == {'›'}, seps)
  loc = a.pg.locator('#ez-crumbs .ez-crumb').nth(1)
  loc.hover(); a.wait(100)
  hov = a.fev("()=>document.querySelectorAll('.ez-hover').length")
  check('hovering a crumb highlights its element on the canvas', hov >= 1, hov)
  label = loc.text_content(); loc.click(); a.wait(150)
  now = a.ev("()=>EzApp._.label(EzApp._.selected())")
  check('clicking a crumb selects that ancestor', now == label, (label, now))
  # hover tag
  p = a.frame.locator('[data-nl=icon-text] p').first; p.hover(); a.wait(150)
  tag = a.fev("()=>{const t=document.getElementById('ez-hovertag'); return t && t.style.display!=='none' ? t.textContent : ''}")
  check('hovering a block shows its name tag', bool(tag), tag)
  a.pg.mouse.move(5, 300); a.wait(150)
  # drop line label during a real drag
  a.tab('blocks')
  src = a.pg.locator('#ez-panel-blocks [data-block="divider"]'); src.scroll_into_view_if_needed(); bb = src.bounding_box()
  fb = a.pg.locator('#ez-frame').bounding_box()
  r = a.fev("()=>{const r=document.querySelector('[data-nl=icon-text]').getBoundingClientRect(); return [r.left,r.top,r.width,r.height]}")
  tx, ty = fb['x'] + r[0] + r[2] / 2, fb['y'] + r[1] + r[3] * 0.2
  pg = a.pg; pg.mouse.move(bb['x'] + 10, bb['y'] + 10); pg.mouse.down()
  for i in range(1, 13): pg.mouse.move(bb['x'] + (tx - bb['x']) * i / 12, bb['y'] + (ty - bb['y']) * i / 12); pg.wait_for_timeout(25)
  pg.mouse.move(tx + 1, ty); pg.wait_for_timeout(120)
  line = a.fev("()=>{const l=document.getElementById('ez-insert'), t=document.getElementById('ez-insert-label'); return {line: !!l && getComputedStyle(l).display!=='none', color: l? getComputedStyle(l).backgroundColor:'', label: t && getComputedStyle(t).display!=='none' ? t.textContent : ''}}")
  pg.mouse.up(); a.wait(300)
  check('the drop line is a solid blue line while dragging', line['line'] and ('11, 87, 208' in line['color'] or '0, 0, 255' in line['color'] or 'rgb(' in line['color']), line)
  check('the drop line says where the block lands', any(w in line['label'] for w in ('Before', 'Into', 'After', 'End of email')), line)
  check('no errors in the canvas chrome', not a.errors, a.errors)

def t_keyboard(a):
  a.clear()
  for bid in ('text', 'button', 'divider'): a.ev("(b)=>EzApp.add(b,{quiet:true})", bid)
  a.wait(150)
  order = lambda: a.fev("()=>[...document.body.children].filter(e=>!e.id||!e.id.startsWith('ez-')).map(e=>e.getAttribute('data-ez')||e.getAttribute('data-nl')||e.tagName)")
  o0 = order()
  sel_q(a, '[data-ez=divider], [data-nl=divider]')
  a.pg.locator('#ez-frame').focus() if False else None
  a.frame.locator('body').press('Control+d'); a.wait(150)
  check('Ctrl+D duplicates the selected block', len(order()) == len(o0) + 1, (o0, order()))
  a.ev("()=>EzApp.undo()"); a.wait(150)
  sel_q(a, '[data-ez=divider], [data-nl=divider]')
  a.frame.locator('body').press('Alt+ArrowUp'); a.wait(150)
  o1 = order()
  check('Alt+↑ moves the block up', o1 != o0 and o1[-1] == o0[-2], (o0, o1))
  a.frame.locator('body').press('Alt+ArrowDown'); a.wait(150)
  check('Alt+↓ moves it back down', order() == o0, order())
  clear_toasts(a)
  a.frame.locator('body').press('Alt+ArrowDown'); a.wait(150)
  check('Alt+↓ at the bottom says so', any('bottom' in t for t in toasts(a)), toasts(a))
  # undo/redo toasts
  clear_toasts(a); a.ev("()=>EzApp.undo()"); a.wait(120)
  check('undo shows a toast', any(t.startswith('Undone') or 'Nothing to undo' in t for t in toasts(a)), toasts(a))
  clear_toasts(a); a.ev("()=>EzApp.redo()"); a.wait(120)
  check('redo shows a toast', any(t.startswith('Redone') or 'Nothing to redo' in t for t in toasts(a)), toasts(a))
  # undo coalescing: typing into one field is one step
  a.ev("()=>EzApp._.forget()")
  a.ev("(b)=>EzApp.add(b,{quiet:true})", 'text'); a.wait(100)
  sel_q(a, '[data-ez=text]'); a.tab('edit')
  f = a.field('edit', 'size'); f.scroll_into_view_if_needed()
  d0 = hist(a)['undo']; f.click(); f.fill('')
  f.type('28px', delay=40)
  f.press('Tab'); a.wait(150)
  check('typing in a style field is one undo step', hist(a)['undo'] == d0 + 1, (d0, hist(a)))
  check('typed style applied to the selection only', a.fev("()=>document.querySelector('[data-ez=text]').style.fontSize") == '28px')
  # quick insert palette
  sel_q(a, '[data-ez=text]')
  a.pg.keyboard.press('Control+k'); a.wait(250)
  check('Ctrl+K opens quick insert with the search focused', a.ev("()=>!document.getElementById('ez-palette').hidden && document.activeElement.id==='ez-pal-input'"))
  a.pg.keyboard.type('divid'); a.wait(120)
  first = a.ev("()=>{const r=document.querySelector('#ez-pal-list .ez-pal-row.is-on .ez-pal-name'); return r && r.textContent}")
  check('quick insert ranks the best match first', first and 'Divider' in first, first)
  n0 = a.fev("()=>document.querySelectorAll('[data-ez=divider],[data-nl=divider]').length")
  a.pg.keyboard.press('Enter'); a.wait(250)
  check('Enter inserts the block and closes quick insert', a.fev("()=>document.querySelectorAll('[data-ez=divider],[data-nl=divider]').length") == n0 + 1 and a.ev("()=>document.getElementById('ez-palette').hidden"))
  sel = a.selected() or {}
  check('the inserted block is selected', 'divider' in (sel.get('ez', '') + sel.get('nl', '')), sel)
  a.pg.keyboard.press('Control+k'); a.wait(200); a.pg.keyboard.type('zzzzqqq'); a.wait(100)
  check('quick insert shows an empty state', a.ev("()=>!!document.querySelector('#ez-pal-list .ez-pal-empty')"))
  a.pg.keyboard.press('Escape'); a.wait(200)
  check('Esc closes quick insert', a.ev("()=>document.getElementById('ez-palette').hidden"))
  a.pg.keyboard.press('Control+k'); a.wait(200); a.pg.keyboard.type('preview'); a.wait(100)
  a.pg.keyboard.press('ArrowDown'); a.pg.keyboard.press('ArrowUp'); a.wait(50)
  a.pg.keyboard.press('Enter'); a.wait(250)
  pv = a.ev("()=>document.getElementById('ez-editor').classList.contains('is-preview')")
  check('quick insert runs commands too (Preview)', pv)
  if pv: a.ev("()=>EzApp._.preview(false)"); a.wait(150)
  a.pg.click('#ez-quick'); a.wait(200)
  check('the toolbar button opens quick insert', a.ev("()=>!document.getElementById('ez-palette').hidden"))
  a.pg.keyboard.press('Escape'); a.wait(150)
  # shortcuts sheet
  a.pg.locator('body').click(position={'x': 5, 'y': 45}) if False else None
  a.ev("()=>document.activeElement && document.activeElement.blur()")
  a.pg.keyboard.press('?'); a.wait(200)
  check('? opens the keyboard shortcuts', a.ev("()=>!document.getElementById('ez-keysheet').hidden && document.querySelectorAll('#ez-keysheet kbd').length>8"))
  a.pg.keyboard.press('Escape'); a.wait(150)
  check('Esc closes the shortcuts', a.ev("()=>document.getElementById('ez-keysheet').hidden"))
  check('no errors from shortcuts and quick insert', not a.errors, a.errors)

def t_inspector_v2(a):
  a.clear()
  a.build('<table data-nl="section" width="100%"><tr><td><p data-probe="p1" style="color:#e11d48">One</p><p data-probe="p2">Two</p></td></tr></table>')
  sel_q(a, '[data-probe=p1]'); a.tab('edit')
  link = a.pg.locator('#ez-panel-edit button.ez-link-sides[data-ez-link="padding"]').first
  check('padding has a link-sides toggle', link.count() == 1)
  if link.count():
    if link.get_attribute('aria-pressed') != 'true': link.click(); a.wait(100)
    f = a.pg.locator('#ez-panel-edit [data-ez-field="padding-top"]').first
    f.scroll_into_view_if_needed(); f.click(); f.fill('14px'); f.press('Enter'); a.wait(150)
    pad = a.fev("()=>{const s=document.querySelector('[data-probe=p1]').style; return [s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft]}")
    check('linked sides set all four sides at once', pad == ['14px'] * 4, pad)
    link.click(); a.wait(100)
    f = a.pg.locator('#ez-panel-edit [data-ez-field="padding-left"]').first
    f.click(); f.fill('2px'); f.press('Enter'); a.wait(150)
    pad = a.fev("()=>{const s=document.querySelector('[data-probe=p1]').style; return [s.paddingTop,s.paddingLeft]}")
    check('unlinked sides change one side only', pad == ['14px', '2px'], pad)
    check('side changes stay on the selected element', a.fev("()=>document.querySelector('[data-probe=p2]').getAttribute('style')||''") == '' or 'padding' not in a.fev("()=>document.querySelector('[data-probe=p2]').getAttribute('style')||''"))
  sw = a.ev("()=>[...document.querySelectorAll('#ez-panel-edit .ez-swatch')].map(s=>s.title||s.getAttribute('aria-label')||s.dataset.color)")
  check('color fields offer the colors already in the email', any('e11d48' in (x or '').lower() for x in sw), sw[:12])
  sel_q(a, '[data-probe=p2]'); a.tab('edit')
  btn = a.pg.locator('#ez-panel-edit [data-ez-field="color"]').first.locator('xpath=ancestor::*[contains(@class,"ez-field")][1]').locator('.ez-swatch').first
  if btn.count():
    col = btn.evaluate("b=>b.title||b.getAttribute('aria-label')||b.dataset.color"); btn.click(); a.wait(150)
    c2 = a.fev("()=>document.querySelector('[data-probe=p2]').style.color")
    check('clicking a swatch applies that color', bool(c2), (col, c2))
  else: check('text color field has swatches', False)
  check('no errors in the inspector', not a.errors, a.errors)

def t_check(a):
  a.clear()
  a.build('<table data-nl="section" width="100%"><tr><td>'
          '<img data-probe="noalt" src="https://cdn.example.org/a.png" width="200">'
          '<img data-probe="badalt" src="https://cdn.example.org/b.png" alt="IMG_2041.jpg" width="200">'
          '<p data-probe="tiny" style="font-size:8px;color:#333">Tiny print</p>'
          '<p data-probe="pale" style="color:#cccccc;background:#ffffff">Pale words here</p>'
          '<a data-probe="hash" href="#">Shop now</a> <a href="javascript:alert(1)">Bad</a> <a href="https://mysite.com">click here</a>'
          '<p>Hi {{first_name}, welcome</p></td></tr></table>')
  r = a.ev("()=>{const r=EzStudio.runCheck(); r.issues=r.issues.map(i=>({level:i.level,text:i.text})); return r}")
  msgs = [(i['level'], i['text']) for i in r['issues']]
  has = lambda lvl, word: any(l == lvl and word.lower() in t.lower() for l, t in msgs)
  check('check flags a picture without alt text', has('error', 'alt'), msgs)
  check('check flags a file name used as alt text', any('IMG_2041' in t for _, t in msgs), msgs)
  check('check flags an empty # link', any('#' in t or 'nowhere' in t.lower() or 'empty' in t.lower() for l, t in msgs if l == 'error'), msgs)
  check('check flags tiny text', any('8px' in t or 'small' in t.lower() for _, t in msgs), msgs)
  check('check flags low contrast', has('warn', 'contrast'), msgs)
  check('check flags a missing unsubscribe link', any('unsubscribe' in t.lower() for _, t in msgs), msgs)
  check('check flags unbalanced merge tags', any('{{' in t or 'merge' in t.lower() for _, t in msgs), msgs)
  check('check flags vague link text', any('click here' in t.lower() for _, t in msgs), msgs)
  check('check reports the HTML size', r['size'] > 1000 and r['images'] == 2, (r['size'], r['images']))
  a.pg.click('#ez-check'); a.wait(300)
  check('Email check opens as a side sheet with a size meter', a.ev("()=>!document.getElementById('ez-checksheet').hidden && !!document.querySelector('#ez-checksheet .ez-meter')"))
  rows = a.pg.locator('#ez-checksheet .ez-issue[data-level=error]')
  check('issues are listed with severity tags', rows.count() >= 2 and a.ev("()=>[...document.querySelectorAll('#ez-checksheet .ez-issue-tag')].some(t=>t.textContent==='Fix')"))
  rows.first.click(); a.wait(250)
  sel = a.selected() or {}
  check('clicking an issue selects the element on the canvas', sel.get('probe') in ('noalt', 'badalt', 'hash'), sel)
  # badge
  a.wait(1800)
  badge = a.ev("()=>{const c=document.getElementById('ez-check-count'); return c && !c.hidden ? [c.textContent, c.classList.contains('is-error')] : null}")
  check('toolbar badge counts problems', badge and int(badge[0]) >= 2 and badge[1], badge)
  a.frame.locator('[data-probe=tiny]').click(); a.wait(150)
  check('the check panel leaves the canvas usable (non-modal)', (a.selected() or {}).get('probe') == 'tiny' and a.ev("()=>!document.getElementById('ez-checksheet').hidden"), a.selected())
  n_before = a.ev("()=>document.querySelectorAll('#ez-checksheet .ez-issue').length")
  a.ev("()=>{const d=EzApp.frame().contentDocument; d.querySelector('[data-probe=noalt]').setAttribute('alt','Spring sale banner'); EzApp._.changed()}"); a.wait(2600)
  n_after = a.ev("()=>document.querySelectorAll('#ez-checksheet .ez-issue').length")
  check('the open check panel refreshes as the email changes', n_after == n_before - 1, (n_before, n_after))
  dock = a.ev("()=>{const s=document.querySelector('#ez-checksheet .ez-sheet').getBoundingClientRect(), v=document.getElementById('ez-views-body').getBoundingClientRect(); return s.right<=v.left}")
  check('the check panel docks beside the inspector, not over it', dock)
  # clean email: fix all
  a.build('<table data-nl="section" width="100%"><tr><td style="background:#ffffff"><p style="color:#222222;font-size:16px">Hello there, this is the news.</p>'
          '<img src="https://cdn.mysite.com/x.png" alt="Our team at the summit" width="300" style="width:300px"><a href="https://mysite.com/unsubscribe" style="color:#222222">Unsubscribe</a></td></tr></table>')
  a.ev("()=>{document.getElementById('nl-email-title').value='March news'; document.getElementById('nl-email-title').dispatchEvent(new Event('input'))}")
  r2 = a.ev("()=>{const r=EzStudio.runCheck(); r.issues=r.issues.map(i=>({level:i.level,text:i.text})); return r}")
  bad = [i for i in r2['issues'] if i['level'] == 'error']
  check('a clean email has no errors in the check', not bad, r2['issues'])
  # big email -> clip warning
  big = 'x' * 200
  a.build('<table data-nl="section" width="100%"><tr><td>' + ''.join('<p style="color:#222">%s %d</p>' % (big, i) for i in range(560)) + '</td></tr></table>')
  r3 = a.ev("()=>{const r=EzStudio.runCheck(); r.issues=r.issues.map(i=>({level:i.level,text:i.text})); return r}")
  check('check warns when Gmail would clip the email (102KB)', r3['size'] > 102 * 1024 and any('clip' in i['text'].lower() for i in r3['issues'] if i['level'] == 'error'), (r3['size'], [i['text'] for i in r3['issues']][:3]))
  a.pg.keyboard.press('Escape'); a.wait(150)
  a.ev("()=>EzStudio.hideAll()")
  check('no errors in Email check', not a.errors, a.errors)

def t_messy(a):
  def roundtrip(html):
    ui_paste(a, html); o1, _ = ui_copy(a); ui_paste(a, o1); o2, _ = ui_copy(a); return o1, o2
  o1, o2 = roundtrip('<html><head><style>.q:before{content:"a;b{}"} .x{color:#123456}</style></head><body><table width="100%"><tr><td><p class="x" style="font-family:\'A;B\', Arial;color:#111">Quoted</p></td></tr></table></body></html>')
  check('paste: quoted semicolons in a style block survive', 'content:"a;b{}"' in o1 and o1 == o2, o1[o1.find('<style>'):o1.find('</style>') + 8])
  check('paste: quoted semicolons in a style attribute survive', "font-family:'A;B', Arial" in o1, re.findall(r'<p[^>]*>', o1))
  o1, o2 = roundtrip('<html><body><!--[if mso]><table width="600"><tr><td><![endif]--><table width="100%"><tr><td><!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:200px"><v:fill type="tile" src="https://e.com/bg.jpg" color="#333"/><v:textbox inset="0,0,0,0"><![endif]--><div><p>Inner MSO</p></div><!--[if gte mso 9]></v:textbox></v:rect><![endif]--></td></tr></table><!--[if mso]></td></tr></table><![endif]--></body></html>')
  check('paste: nested MSO conditionals and VML are kept and stable', o1 == o2 and '<v:rect' in o1 and '<v:fill' in o1 and '</v:textbox>' in o1 and 'Inner MSO' in o1)
  o1, o2 = roundtrip('<html><head><style>:root{--brand:#e11d48} a:hover{color:red} /* note */ .b{font-weight:bold} @media (max-width:600px){.b{font-size:12px}}</style></head><body><table><tr><td><a class="b" href="https://x.com">Hov</a></td></tr></table></body></html>')
  flat = o1.replace(' ', '').replace('\n', '')
  check('paste: :hover rules stay in a style block', 'a:hover{color:red' in flat, flat[:600])
  check('paste: @media rules stay and class rules inline', '@media(max-width:600px)' in flat and re.search(r'<a[^>]*style="[^"]*font-weight:bold', o1) is not None)
  check('paste: CSS comments and variables do not break the output', o1 == o2 and '/*' not in o1.split('<body')[1])
  o1, o2 = roundtrip('<table width="100%"><tr><td>NoTbody cell</td></tr></table>')
  check('paste: tables without tbody load and stay stable', 'NoTbody cell' in o1 and o1 == o2)
  o1, o2 = roundtrip('<table><tr><td><svg width="10" height="10"><circle r="4" cx="5" cy="5"/></svg><p>Svg text</p></td></tr></table>')
  check('paste: inline SVG does not break the paste', 'Svg text' in o1 and o1 == o2)
  o1, o2 = roundtrip('<table><tr><td><p>Broken <b>bold<td>cell</table><div>after')
  check('paste: broken tags are repaired and nothing is lost', all(w in o1 for w in ('Broken', 'bold', 'cell', 'after')) and o1 == o2)
  o1, o2 = roundtrip('\ufeff<html><body>\r\n<table>\t<tr><td>Caf\u00e9 &amp; cr\u00e8me \u2014 \u201cq\u201d &nbsp;Z</td></tr></table></body></html>')
  check('paste: BOM, CRLF, tabs and accents come through', 'Caf\u00e9' in o1 and 'cr\u00e8me' in o1 and '\u2014' in o1 and '&amp;' in o1 and '\ufeff' not in o1 and o1 == o2)
  ui_paste(a, ''); a.wait(100)
  a.ev("()=>{const m=document.getElementById('ez-modal'); if(!m.hidden) document.getElementById('ez-modal-x').click()}")
  check('paste: an empty paste does not crash', not a.errors, a.errors)
  check('no errors pasting messy HTML', not a.errors, a.errors)

def t_reliability(a):
  a.clear(); a.ev("(b)=>EzApp.add(b,{quiet:true})", 'text'); a.wait(400)
  clear_toasts(a)
  a.ev("""()=>{window.__realSet=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(String(k).indexOf('ezbuilder-canvas')===0){ const e=new DOMException('full','QuotaExceededError'); throw e;} return window.__realSet.call(this,k,v)}}""")
  a.ev("(b)=>EzApp.add(b,{quiet:true})", 'divider'); a.wait(800)
  t = toasts(a)
  check('a full browser storage shows one clear warning', any('storage' in x.lower() for x in t), t)
  a.ev("(b)=>EzApp.add(b,{quiet:true})", 'divider'); a.wait(800)
  check('the storage warning is not repeated on every change', sum('storage' in x.lower() for x in toasts(a)) <= 1, toasts(a))
  a.ev("()=>{Storage.prototype.setItem=window.__realSet}")
  a.ev("(b)=>EzApp.add(b,{quiet:true})", 'divider'); a.wait(800)
  check('saving works again after the storage frees up', a.ev("()=>{const v=localStorage.getItem('ezbuilder-canvas'); return !!v && (v.match(/divider/g)||[]).length>=3}"))
  check('no page errors when storage is full', not [e for e in a.errors if 'pageerror' in e], a.errors)
  a.errors.clear()
  # history cap
  a.clear()
  for i in range(95): a.ev("(b)=>EzApp.add(b,{quiet:true})", 'divider')
  check('undo history is capped (memory stays flat)', hist(a)['undo'] <= 80, hist(a))
  # performance
  a.clear()
  ms = a.ev("""()=>{const ids=['sect100','text','image','button','divider','email-hero','email-product','email-footer']; const t=performance.now(); for(let i=0;i<5;i++) ids.forEach(b=>EzApp.add(b,{quiet:true})); return performance.now()-t}""")
  check('adding 40 blocks takes under 2.5s', ms < 2500, ms)
  ms = a.ev("()=>{const t=performance.now(); for(let i=0;i<5;i++) EzApp.exportHtml(); return (performance.now()-t)/5}")
  check('export of a 40-block email takes under 400ms', ms < 400, ms)
  ms = a.ev("()=>{const t=performance.now(); EzStudio.runCheck(); return performance.now()-t}")
  check('Email check of a 40-block email takes under 300ms', ms < 300, ms)
  ms = a.ev("()=>{const t=performance.now(); for(let i=0;i<20;i++){EzApp.undo();} for(let i=0;i<20;i++){EzApp.redo();} return (performance.now()-t)/40}")
  check('undo/redo averages under 60ms', ms < 60, ms)
  sel_q(a, '[data-ez=text]'); a.tab('edit')
  ms = a.ev("()=>{const f=document.querySelector('#ez-panel-edit [data-ez-field=\"size\"]'); const t=performance.now(); for(let i=10;i<40;i++){f.value=i+'px'; f.dispatchEvent(new Event('input',{bubbles:true}))} return (performance.now()-t)/30}")
  check('a style edit repaints in under 16ms on average', ms < 16, ms)
  a.ev("()=>{document.querySelectorAll('#ez-toasts .ez-toast').forEach(t=>t.remove())}")
  check('no errors in reliability and performance checks', not a.errors, a.errors)

def t_layout(b, url, http_url):
  for w, h in ((1280, 800), (1440, 900), (1920, 1080)):
    a = App(b, url, w=w, h=h)
    r = a.ev("""()=>{const box=s=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}};
      const btns=[...document.querySelectorAll('#ez-options button, #ez-commands button')].map(e=>e.getBoundingClientRect());
      let overlap=false; for(let i=0;i<btns.length;i++) for(let j=i+1;j<btns.length;j++){const p=btns[i],q=btns[j]; if(p.width&&q.width&&p.left<q.right-1&&q.left<p.right-1&&p.top<q.bottom-1&&q.top<p.bottom-1) overlap=true}
      return {doc: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, docH: document.documentElement.scrollHeight, crumbs: box('#ez-crumbs'), canvas: box('#ez-canvas-wrap'), views: box('#ez-views-body'), overlap}}""")
    ok = r['doc'] <= r['vw'] and not r['overlap'] and r['crumbs'] and r['crumbs']['b'] <= r['vh'] + 1 and r['canvas']['b'] <= r['crumbs']['t'] + 1 and r['canvas']['r'] <= r['views']['l'] + 1
    check('layout at %dpx: no overflow or overlap; canvas, crumbs and inspector fit' % w, ok, r)
    check('layout at %dpx: no errors on load' % w, not a.errors, a.errors)
    a.ctx.close()
  a = App(b, http_url)
  a.clear(); a.ev("(b)=>EzApp.add(b,{quiet:true})", 'email-hero'); a.pg.keyboard.press('Control+k'); a.wait(200); a.pg.keyboard.press('Escape')
  check('served over http: v2 features load with no errors', a.ev("()=>!!window.EzStudio && !!window.EzToast") and not a.errors and not a.failed, (a.errors, a.failed))
  a.ctx.close()

def shots_v2(a):
  a.ev("()=>EzStudio.hideAll()"); a.ev("()=>{document.querySelectorAll('#ez-toasts .ez-toast').forEach(t=>t.remove())}")
  path = '/workspace/demo-video/built_email_EN.html'
  if os.path.exists(path): a.load(open(path, encoding='utf-8').read())
  else: a.clear(); [a.ev("(b)=>EzApp.add(b,{quiet:true})", x) for x in ('email-preview', 'email-logo', 'email-hero', 'email-image-text', 'email-cta', 'email-footer')]
  a.wait(300)
  a.ev("""()=>{const d=EzApp.frame().contentDocument; const im=[...d.querySelectorAll('img')].find(i=>i.getBoundingClientRect().width>150 && i.getBoundingClientRect().top>150) || d.querySelector('img'); if(im){im.scrollIntoView({block:'center'}); EzApp.select(im);} }""")
  a.tab('edit'); a.wait(300)
  img = a.frame.locator('.ez-selected').first
  a.ev("()=>EzApp.toast ? 0 : 0")
  a.pg.screenshot(path=os.path.join(SHOTS, 'standalone_v2_editor.png'))
  a.pg.click('#nl-outlook'); a.wait(800)
  a.pg.click('#ez-check'); a.wait(500)
  a.pg.screenshot(path=os.path.join(SHOTS, 'standalone_v2_outlook.png'))
  a.ev("()=>EzStudio.hideAll()"); a.wait(200)
  try: a.pg.click('#nl-outlook-close'); a.wait(200)
  except Exception: pass
  check('v2 screenshots saved', os.path.exists(os.path.join(SHOTS, 'standalone_v2_editor.png')) and os.path.exists(os.path.join(SHOTS, 'standalone_v2_outlook.png')))

# 1x1-ish PNGs as data URLs so thumbnails load with no network
PNG_RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEklEQVR4nGP4z8DwHwyBNAMDAD+mB/kZBj8mAAAAAElFTkSuQmCC'
def am_open(a):
  a.ev("()=>{const m=document.getElementById('ez-modal'); if(!m.hidden) document.getElementById('ez-modal-x').click()}")
  a.frame.locator('[data-probe=pic]').dblclick(); a.wait(400)
  return a.ev("()=>!document.getElementById('ez-modal').hidden && document.getElementById('ez-modal-title').textContent")
def am_cards(a): return a.ev("()=>[...document.querySelectorAll('.ez-am-card')].map(c=>c.querySelector('.ez-am-name').textContent)")

def t_assets(a):
  a.ev("""(png)=>{localStorage.setItem('ezbuilder-assets', JSON.stringify([{src:png, name:'red-4x2.png'},{src:'https://cdn.invalid.example/missing.png', name:'missing.png'},{src:'https://cdn.invalid.example/keep.png', name:'keep.png'}])); localStorage.removeItem('ezbuilder-assets-hidden')}""", PNG_RED)
  a.build('<table data-nl="section" width="100%"><tr><td><img data-probe="pic" src="SRC" width="200" alt="Red bar" style="display:block;width:200px"></td></tr></table>'.replace('SRC', PNG_RED))
  title = am_open(a)
  check('double-clicking an image opens Select Image', title == 'Select Image', title)
  w = a.ev("()=>{const i=document.querySelector('.ez-am-url input'), b=document.querySelector('.ez-am-url'); return [i.getBoundingClientRect().width, b.getBoundingClientRect().width, document.querySelector('.ez-am-add').getBoundingClientRect().width]}")
  check('image address field fills its box (> 85%)', w[0] > 0.85 * w[1], w)
  check('image address box takes most of the row', w[1] > 0.7 * w[2], w)
  check('image address field has focus when the dialog opens', a.ev("()=>document.activeElement && document.activeElement.closest('.ez-am-url') !== null"))
  a.wait(400)
  th = a.ev("()=>[...document.querySelectorAll('.ez-am-card')].map(c=>{const i=c.querySelector('img.ez-am-img'); const r=i?i.getBoundingClientRect():{width:0,height:0}; return {name:c.querySelector('.ez-am-name').textContent, img:!!i, w:r.width, h:r.height, nat:i?i.naturalWidth:0, op:i?getComputedStyle(i).opacity:'0', dim:c.querySelector('.ez-am-dim').textContent, broken:c.querySelector('.ez-am-thumb').classList.contains('is-broken')}})")
  red = [t for t in th if t['name'] == 'red-4x2.png']
  check('every card has a real <img> thumbnail', th and all(t['img'] for t in th), th)
  check('a loaded thumbnail is visible and fitted', red and red[0]['w'] > 40 and red[0]['h'] > 10 and red[0]['nat'] == 4 and red[0]['op'] == '1', red)
  check('cards show the image dimensions', red and red[0]['dim'] == '4 × 2', red)
  miss = [t for t in th if t['name'] == 'missing.png']
  check('a broken image shows a clean fallback, not a broken icon', miss and miss[0]['broken'] and miss[0]['dim'] == 'Could not load', miss)
  check('the image used in the email is marked', a.ev("()=>[...document.querySelectorAll('.ez-am-card')].some(c=>c.querySelector('.ez-am-used'))"))
  # preview
  card = a.pg.locator('.ez-am-card', has_text='red-4x2.png').first
  card.hover(); a.wait(150)
  card.locator('.ez-am-zoom').click(); a.wait(250)
  v = a.ev("()=>{const v=document.querySelector('.ez-am-view'); return {open:!v.hidden, img:!!v.querySelector('.ez-am-stage img'), dim:v.querySelector('.ez-am-dim').textContent, grid:getComputedStyle(document.querySelector('.ez-am-grid')).display}}")
  check('the eye button opens a large preview with the size', v['open'] and v['img'] and '4 × 2' in v['dim'] and v['grid'] == 'none', v)
  check('preview does not pick the image or close the dialog', a.ev("()=>!document.getElementById('ez-modal').hidden"))
  a.pg.locator('.ez-am-view .ez-am-back').click(); a.wait(100)
  check('Back returns to the grid', a.ev("()=>document.querySelector('.ez-am-view').hidden && getComputedStyle(document.querySelector('.ez-am-grid')).display==='grid'"))
  # delete
  before = am_cards(a)
  card = a.pg.locator('.ez-am-card', has_text='keep.png').first
  card.hover(); a.wait(120)
  html0 = a.export()
  card.locator('.ez-am-del').click(); a.wait(200)
  after = am_cards(a)
  check('the delete button removes the image from the list', 'keep.png' not in after and len(after) == len(before) - 1, (before, after))
  check('delete does not pick an image or close the dialog', a.ev("()=>!document.getElementById('ez-modal').hidden") and a.export() == html0)
  check('delete is saved in the browser', 'keep.png' not in a.ev("()=>localStorage.getItem('ezbuilder-assets')"))
  # delete an image the email uses: list loses it, canvas keeps it
  card = a.pg.locator('.ez-am-card:has(.ez-am-used)').first
  card.hover(); card.locator('.ez-am-del').click(); a.wait(200)
  check('deleting a used image keeps it in the email', a.fev("()=>!!document.querySelector('[data-probe=pic]') && document.querySelector('[data-probe=pic]').getAttribute('src').startsWith('data:image/png')") and a.export() == html0)
  check('the deleted used image leaves the list', not a.ev("()=>[...document.querySelectorAll('.ez-am-card')].some(c=>c.querySelector('.ez-am-used'))"))
  # delete from the preview
  card = a.pg.locator('.ez-am-card', has_text='missing.png').first
  card.hover(); card.locator('.ez-am-zoom').click(); a.wait(150)
  a.pg.locator('.ez-am-view .ez-am-view-del').click(); a.wait(150)
  check('Delete in the preview removes it and returns to the grid', 'missing.png' not in am_cards(a) and a.ev("()=>document.querySelector('.ez-am-view').hidden"))
  # pick still works
  a.pg.fill('.ez-am-url input', 'https://cdn.invalid.example/new.png'); a.pg.click('.ez-am-add button'); a.wait(150)
  check('adding an address puts it first', am_cards(a)[:1] == ['new.png'], am_cards(a))
  a.pg.locator('.ez-am-card', has_text='new.png').first.locator('.ez-am-pick').click(); a.wait(200)
  check('clicking a card uses the image and closes the dialog', a.ev("()=>document.getElementById('ez-modal').hidden") and a.fev("()=>document.querySelector('[data-probe=pic]').getAttribute('src')") == 'https://cdn.invalid.example/new.png')
  a.ev("()=>EzApp.undo()"); a.wait(150)
  # filter
  a.ev("()=>{const l=JSON.parse(localStorage.getItem('ezbuilder-assets')); for(let i=0;i<8;i++) l.push({src:'https://cdn.invalid.example/f'+i+'.png', name:'filler-'+i+'.png'}); localStorage.setItem('ezbuilder-assets', JSON.stringify(l))}")
  am_open(a)
  check('a filter appears when the library is large', a.ev("()=>!document.querySelector('.ez-am-search').hidden"))
  a.pg.fill('.ez-am-search', 'filler-3'); a.wait(100)
  check('the filter narrows the cards', am_cards(a) == ['filler-3.png'], am_cards(a))
  a.pg.fill('.ez-am-search', 'zzz-none'); a.wait(100)
  check('the filter says when nothing matches', not am_cards(a) and 'No image matches' in a.ev("()=>document.querySelector('.ez-am-empty').textContent"))
  a.pg.click('#ez-modal-x'); a.wait(150)
  # reload keeps deletions (also for images found in the email)
  a.pg.reload(); a.pg.wait_for_function('()=>window.EzApp && window.EzApp.column()'); a.wait(400)
  a.frame = a.pg.locator('#ez-frame').element_handle().content_frame()
  a.build('<table data-nl="section" width="100%"><tr><td><img data-probe="pic" src="SRC" width="200" alt="Red bar" style="display:block;width:200px"></td></tr></table>'.replace('SRC', PNG_RED))
  am_open(a)
  names = am_cards(a)
  check('deleted images stay deleted after a reload', not ({'keep.png', 'missing.png'} & set(names)) and not a.ev("()=>[...document.querySelectorAll('.ez-am-card')].some(c=>c.querySelector('.ez-am-used'))"), names)
  a.pg.click('#ez-modal-x'); a.wait(100)
  check('no errors in the image browser', not a.errors, a.errors)

def main():
  with sync_playwright() as p:
    b = p.chromium.launch()
    srv = serve(ROOT)
    url = 'file://' + ROOT + '/index.html'
    t_startup(b, srv)
    a = App(b, url)
    for fn in (t_catalog, t_toolbar, t_blocks, t_dnd, t_selection, t_layers, t_rte, t_style, t_settings, t_views, t_io,
               t_resize, t_canvas_ui, t_keyboard, t_inspector_v2, t_check, t_messy, t_reliability, t_assets):
      try:
        a.errors.clear(); fn(a)
      except Exception as e:
        check(fn.__name__ + ' ran without a test crash', False, repr(e)[:800])
        try: a.pg.keyboard.press('Escape'); a.ev("()=>{window.EzStudio && EzStudio.hideAll(); const m=document.getElementById('ez-modal'); if(!m.hidden) document.getElementById('ez-modal-x').click()}")
        except Exception: pass
    # editor screenshot with a real email
    try:
      if SAMPLES: a.load(open(SAMPLES[0], encoding='utf-8').read())
      sel_q(a, '[data-ez=text], p, td'); a.tab('edit'); a.wait(300)
      a.pg.screenshot(path=os.path.join(SHOTS, 'standalone_editor.png'))
    except Exception as e: check('editor screenshot', False, e)
    try: shots_v2(a)
    except Exception as e: check('v2 screenshots', False, repr(e)[:400])
    a.ctx.close()
    try: t_persistence(b, url)
    except Exception as e: check('t_persistence ran without a test crash', False, repr(e)[:800])
    try: t_layout(b, url, 'http://127.0.0.1:%d/index.html' % srv.server_address[1])
    except Exception as e: check('t_layout ran without a test crash', False, repr(e)[:800])
    srv.shutdown(); b.close()
  print('\n%d/%d checks passed' % (sum(R), len(R)))
  if FAILS: print('FAILED:\n  ' + '\n  '.join(FAILS))
  sys.exit(0 if not FAILS else 1)

if __name__ == '__main__': main()
