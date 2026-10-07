"""Run: python3 tests/maintenance.test.py (PHP CLI + PDO SQLite required).

Exercises real PHP HTTP handlers, sessions and CSRF in a temporary checkout.
Only db() is replaced with an isolated SQLite admin database. The PHP router
models the Apache rules; hosting-specific .htaccess support needs a deploy check.
No production configuration, credentials, data, or processes are used.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PHP = [os.environ.get('PHP_BIN', 'php'), *shlex.split(os.environ.get('PHP_ARGS', ''))]


class MaintenanceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='wolchon-maintenance-')
        cls.root = Path(cls.temp.name)
        for name in ('api', 'js', 'css'):
            shutil.copytree(ROOT / name, cls.root / name, ignore=shutil.ignore_patterns('config.php', 'maintenance.json'))
        for page in ROOT.glob('*.html'):
            shutil.copy2(page, cls.root / page.name)
        (cls.root / 'api/config.php').write_text("<?php return ['timezone' => 'Asia/Seoul'];")
        bootstrap = cls.root / 'api/bootstrap.php'
        text = bootstrap.read_text()
        start, end = text.index('function db(): PDO'), text.index('function json_input(): array')
        text = text[:start] + """function db(): PDO {
            static $pdo = null;
            return $pdo ??= new PDO('sqlite:' . __DIR__ . '/test.sqlite', null, null,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        }
        """ + text[end:]
        bootstrap.write_text(text)
        subprocess.run([*PHP, '-r', """
            $db = new PDO('sqlite:' . $argv[1]);
            $db->exec('CREATE TABLE admins (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, is_active INTEGER, created_at TEXT)');
            $s = $db->prepare('INSERT INTO admins VALUES (1, ?, ?, ?, 1, ?)');
            $s->execute(['test@example.invalid', password_hash('test-only-password', PASSWORD_DEFAULT), 'Test admin', '2026-01-01']);
        """, str(cls.root / 'api/test.sqlite')], check=True, capture_output=True)
        (cls.root / 'router.php').write_text("""<?php
            $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
            if (str_starts_with($path, '/api/runtime/')) { http_response_code(403); exit; }
            if ($path === '/' || preg_match('~^/(?!admin_|naver)[A-Za-z0-9_-]+\\.html$~', $path)) {
                $_GET['page'] = $path === '/' ? 'index.html' : substr($path, 1);
                require __DIR__ . '/api/page.php';
                return true;
            }
            return false;
        """)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.log = (cls.root / 'server.log').open('w+')
        cls.server = subprocess.Popen([*PHP, '-d', f'session.save_path={cls.root}', '-S', f'127.0.0.1:{port}', 'router.php'], cwd=cls.root, stdout=cls.log, stderr=cls.log)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.base + '/api/index.php?maintenance_status=1', timeout=1).close()
                return
            except OSError:
                time.sleep(.05)
        cls.server.terminate()
        raise RuntimeError('Test PHP server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.log.close()
        cls.temp.cleanup()

    def setUp(self):
        self.state = self.root / 'api/runtime/maintenance.json'
        self.state.unlink(missing_ok=True)
        self.admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.public = urllib.request.build_opener()
        self.token = None

    def request(self, payload=None, *, admin=False, path='/api/index.php', headers=None):
        headers = {'Content-Type': 'application/json', **(headers or {})}
        if admin and self.token:
            headers.setdefault('X-CSRF-Token', self.token)
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            response = (self.admin if admin else self.public).open(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read().decode()
            return response.status, json.loads(body) if 'application/json' in response.headers.get('Content-Type', '') else body

    def login(self):
        status, body = self.request({'action': 'auth', 'method': 'login', 'email': 'test@example.invalid', 'password': 'test-only-password'}, admin=True)
        self.assertEqual(status, 200)
        self.token = body['csrf_token']

    def enable(self):
        self.login()
        status, body = self.request({'action': 'maintenance', 'enabled': True, 'expected_end': '2099-10-08T18:30'}, admin=True)
        self.assertEqual(status, 200)
        self.assertEqual(body['data'], {'enabled': True, 'expected_end': '2099-10-08T18:30:00+09:00'})

    def test_default_off_and_public_page(self):
        self.assertEqual(self.request(path='/api/index.php?maintenance_status=1')[1]['data']['enabled'], False)
        self.assertEqual(self.request(path='/rates.html')[0], 200)
        self.assertFalse(self.state.exists())

    def test_admin_start_all_pages_blocked_and_stop(self):
        self.enable()
        for page in ROOT.glob('*.html'):
            if page.name.startswith(('admin_', 'naver')):
                continue
            with self.subTest(page=page.name):
                status, body = self.request(path='/' + page.name)
                self.assertEqual(status, 503)
                self.assertIn('페이지 점검중입니다', body)
                self.assertIn('2099-10-08 18:30', body)
        self.assertEqual(self.request(path='/')[0], 503)
        self.assertEqual(self.request(path='/admin_login.html')[0], 200)
        self.assertEqual(self.request(path='/admin_dashboard.html')[0], 200)
        self.assertEqual(self.request({'action': 'maintenance', 'enabled': False}, admin=True)[0], 200)
        self.assertEqual(self.request(path='/rates.html')[0], 200)
        self.assertEqual(self.request(path='/api/index.php?maintenance_status=1')[1]['data']['enabled'], False)

    def test_reservation_and_board_apis_blocked(self):
        self.enable()
        for payload in [
            {'action': 'rpc', 'name': name} for name in
            ['get_booked_sites', 'create_reservation', 'cancel_waiting_reservation', 'create_qna', 'find_reservations']
        ] + [{'action': 'query', 'table': 'notices', 'operation': 'select'}]:
            with self.subTest(payload=payload):
                status, body = self.request(payload)
                self.assertEqual(status, 503)
                self.assertEqual(body['error']['code'], 'MAINTENANCE')

    def test_login_and_admin_requests_remain_available(self):
        self.enable()
        self.admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = None
        self.login()
        status, body = self.request({'action': 'query', 'table': 'admin_profiles', 'filters': []}, admin=True)
        self.assertEqual(status, 200)
        self.assertEqual(body['data']['display_name'], 'Test admin')

    def test_unauthenticated_cannot_toggle(self):
        for enabled in [True, False]:
            status, body = self.request({'action': 'maintenance', 'enabled': enabled})
            self.assertEqual(status, 401)
            self.assertEqual(body['error']['code'], 'ADMIN_REQUIRED')
        self.assertFalse(self.state.exists())

    def test_csrf_and_origin(self):
        self.enable()
        for headers in [{'X-CSRF-Token': ''}, {'X-CSRF-Token': 'wrong'}, {'Origin': 'https://other.invalid'}]:
            status, body = self.request({'action': 'maintenance', 'enabled': False}, admin=True, headers=headers)
            self.assertEqual(status, 403)
        self.assertTrue(json.loads(self.state.read_text())['enabled'])

    def test_invalid_time_and_boolean(self):
        self.login()
        for value in ['', '2000-01-01T00:00', '2099-02-30T18:00', 'not-a-date']:
            status, body = self.request({'action': 'maintenance', 'enabled': True, 'expected_end': value}, admin=True)
            self.assertEqual(status, 422)
        self.assertEqual(self.request({'action': 'maintenance', 'enabled': 'false'}, admin=True)[0], 422)
        self.assertFalse(self.state.exists())

    def test_expected_end_is_not_automatic_reopening(self):
        self.state.write_text(json.dumps({'enabled': True, 'expected_end': '2000-01-01T00:00:00+09:00'}))
        self.assertEqual(self.request(path='/rates.html')[0], 503)
        self.assertTrue(self.request(path='/api/index.php?maintenance_status=1')[1]['data']['enabled'])

    def test_corrupted_state_can_be_recovered_by_admin(self):
        self.state.write_text('broken-json')
        self.assertEqual(self.request(path='/rates.html')[0], 503)
        self.login()
        self.assertEqual(self.request({'action': 'maintenance', 'enabled': False}, admin=True)[0], 200)
        self.assertEqual(self.request(path='/rates.html')[0], 200)

    def test_gate_cannot_read_other_files(self):
        for name in ['../api/config.php', 'admin_dashboard.html', 'missing.html']:
            self.assertEqual(self.request(path='/api/page.php?page=' + name)[0], 404)

    def test_every_public_page_loads_the_monitor(self):
        for page in ROOT.glob('*.html'):
            if page.name.startswith(('admin_', 'naver')):
                continue
            with self.subTest(page=page.name):
                text = page.read_text()
                self.assertIn('js/maintenance.js?', text)
                self.assertIn('css/maintenance.css', text)


if __name__ == '__main__':
    unittest.main(verbosity=2)
