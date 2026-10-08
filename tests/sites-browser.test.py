# Local browser test with mocked API and calendar; no operating-site requests.
import json, threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(Path(__file__).resolve().parents[1])))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1200,'height':1000})
 def route(req):
  url=req.request.url
  if '/api/index.php' in url:
   data={'enabled':False} if 'maintenance_status' in url else []
   req.fulfill(content_type='application/json',body=json.dumps({'ok':True,'data':data}));return
  if url.startswith(base):req.continue_();return
  if url=='https://cdn.jsdelivr.net/npm/flatpickr':
   req.fulfill(content_type='application/javascript',body='window.flatpickr=(el,options)=>{window.testCalendar=options};');return
  req.fulfill(content_type='application/javascript' if url.endswith('.js') or 'supabase' in url else 'text/css',body='')
 page.route('**/*',route)
 page.goto(base+'/reservation.html')
 page.wait_for_function('window.testCalendar')
 page.evaluate('Element.prototype.scrollIntoView = function () {}')
 page.add_style_tag(content='html { scroll-behavior: auto !important; } * { transition: none !important; }')
 page.evaluate("testCalendar.onChange([new Date('2026-10-28T00:00:00'),new Date('2026-10-29T00:00:00')])")
 page.locator('#step-map').wait_for(state='visible')
 page.locator('#interactive-site-map').screenshot(path='/tmp/wolchon-sites-desktop.png')
 for n in range(1,25):
  page.locator(f'.site-overlay [data-site="{n}"]').click()
  assert page.locator('#res-site-val').inner_text()==str(n)
 print('Desktop: all 24 polygons select correct number')
 page.set_viewport_size({'width':390,'height':844})
 page.locator('#interactive-site-map').screenshot(path='/tmp/wolchon-sites-mobile.png')
 for n in range(1,25):
  page.locator(f'.site-overlay [data-site="{n}"]').click()
  assert page.locator('#res-site-val').inner_text()==str(n)
 print('Mobile: all 24 polygons select correct number')
 for n in range(1,25):
  page.locator(f'.site-number-button[data-site="{n}"]').click()
  assert page.locator('#res-site-val').inner_text()==str(n)
  assert page.locator(f'.site-overlay [data-site="{n}"]').get_attribute('aria-pressed')=='true'
 print('Mobile: all 24 number buttons sync selection to the map')
 browser.close()
server.shutdown()
