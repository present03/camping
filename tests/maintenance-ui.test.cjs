// Run with jsdom 26 available: node tests/maintenance-ui.test.cjs
const { JSDOM } = require('jsdom');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function visitor(host = 'example.org', body = '<main id="original">예약 화면</main>') {
    const dom = new JSDOM(body, { url: `https://${host}/camping/reservation.html` });
    let state = { enabled: false, expected_end: null };
    let failure = false;
    let reloads = 0;
    const context = vm.createContext({
        window: {}, document: dom.window.document, URL, AbortController,
        location: { pathname: '/camping/reservation.html', hostname: host, protocol: 'https:', reload() { reloads++; } },
        async fetch(url) {
            assert.equal(url.pathname, '/camping/api/index.php');
            if (failure) throw new Error('unavailable');
            return { ok: true, async json() { return { ok: true, data: state }; } };
        },
        setTimeout() { return 1; }, clearTimeout() {}, setInterval() {}
    });
    vm.runInContext(source('js/maintenance.js'), context);
    return { dom, monitor: context.window.SiteMaintenance,
        setState(value) { state = value; }, fail() { failure = true; }, get reloads() { return reloads; } };
}

test('visitor enters maintenance and reloads on manual end', async () => {
    const app = visitor();
    assert.equal(await app.monitor.ready, true);
    assert.equal(app.dom.window.document.querySelector('#maintenance-screen'), null);
    app.setState({ enabled: true, expected_end: '2099-10-08T18:30:00+09:00' });
    assert.equal(await app.monitor.check(), false);
    assert.ok(app.dom.window.document.body.classList.contains('maintenance-active'));
    assert.equal(app.dom.window.document.querySelector('#maintenance-screen h1').textContent, '페이지 점검중입니다');
    assert.match(app.dom.window.document.querySelector('#maintenance-end').textContent, /2099.*한국 시간/);
    app.setState({ enabled: false, expected_end: null });
    await app.monitor.check();
    assert.equal(app.reloads, 1);
    app.dom.window.close();
});

test('network failure does not remove an existing maintenance screen', async () => {
    const app = visitor();
    await app.monitor.ready;
    app.setState({ enabled: true, expected_end: '2099-10-08T18:30:00+09:00' });
    await app.monitor.check();
    app.fail();
    assert.equal(await app.monitor.check(), false);
    assert.equal(app.dom.window.document.querySelector('h1').textContent, '페이지 점검중입니다');
    assert.equal(app.reloads, 0);
    app.dom.window.close();
});

test('status failure shows a recovery screen on hosting but permits static GitHub previews', async () => {
    for (const host of ['example.org', 'present03.github.io']) {
        const app = visitor(host);
        await app.monitor.ready;
        app.fail();
        assert.equal(await app.monitor.check(), host.endsWith('.github.io'));
        assert.equal(Boolean(app.dom.window.document.querySelector('#maintenance-screen')), !host.endsWith('.github.io'));
        app.dom.window.close();
    }
});

test('administrator can start, extend and stop using the dashboard controls', async () => {
    const dom = new JSDOM(source('admin_dashboard.html'), { url: 'https://example.org/admin_dashboard.html' });
    await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const saves = [];
    const context = vm.createContext({
        window: {
            AdminAuth: { async requireAdmin() { return true; } },
            supabaseClient: { maintenance: { async set(enabled, end) {
                saves.push([enabled, end]);
                return { data: { enabled, expected_end: enabled ? end + ':00+09:00' : null }, error: null };
            } } }
        },
        document: dom.window.document, URL, confirm() { return true; },
        async fetch() { return { ok: true, async json() { return { ok: true, data: { enabled: false, expected_end: null } }; } }; }
    });
    vm.runInContext(source('js/admin-maintenance.js'), context);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    const doc = dom.window.document;
    const start = doc.getElementById('maintenance-start');
    const stop = doc.getElementById('maintenance-stop');
    const end = doc.getElementById('maintenance-expected-end');
    assert.equal(stop.disabled, true);
    start.click(); // Required date blocks starting with no value.
    await flush();
    assert.equal(saves.length, 0);
    end.value = '2099-10-08T18:30';
    start.click();
    await flush();
    assert.equal(stop.disabled, false);
    assert.equal(start.textContent, '예상 종료 시간 변경');
    end.value = '2099-10-08T19:30';
    start.click();
    await flush();
    stop.click();
    await flush();
    assert.deepEqual(saves, [[true, '2099-10-08T18:30'], [true, '2099-10-08T19:30'], [false, '2099-10-08T19:30']]);
    assert.equal(doc.getElementById('maintenance-status').textContent, '현재 상태: 정상 운영 중');
    assert.equal(stop.disabled, true);
    dom.window.close();
});

test('unauthenticated dashboard leaves maintenance controls disabled', async () => {
    const dom = new JSDOM(source('admin_dashboard.html'));
    await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    vm.runInNewContext(source('js/admin-maintenance.js'), {
        window: { AdminAuth: { async requireAdmin() { return false; } } }, document: dom.window.document
    });
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    assert.equal(dom.window.document.getElementById('maintenance-start').disabled, true);
    dom.window.close();
});

test('adapter sends the authenticated CSRF token for maintenance changes', async () => {
    const requests = [];
    const context = vm.createContext({ window: {}, document: { baseURI: 'https://example.org/admin_dashboard.html' }, URL,
        async fetch(url, options) {
            requests.push(options);
            return { ok: true, async json() { return { ok: true, data: {}, csrf_token: 'test-only-csrf' }; } };
        }
    });
    vm.runInContext(source('js/supabase-config.js'), context);
    await context.window.supabaseClient.auth.getUser();
    await context.window.supabaseClient.maintenance.set(true, '2099-10-08T18:30');
    assert.equal(requests[1].headers['X-CSRF-Token'], 'test-only-csrf');
    assert.equal(requests[1].credentials, 'same-origin');
    assert.deepEqual(JSON.parse(requests[1].body), { action: 'maintenance', enabled: true, expected_end: '2099-10-08T18:30' });
});
