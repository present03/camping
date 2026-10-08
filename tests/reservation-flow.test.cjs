// Run with jsdom 26 available: node tests/reservation-flow.test.cjs
const { JSDOM } = require('jsdom');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

for (const scenario of [
    { name: 'weekday', start: '2026-10-28', end: '2026-10-29', price: '35,000원' },
    { name: 'mixed nights', start: '2026-10-29', end: '2026-10-31', price: '85,000원' },
    { name: 'availability failure', start: '2026-10-28', end: '2026-10-29', error: { code: 'DB_CONNECTION_FAILED', message: 'DB failure' } }
]) {
    test(`calendar selection: ${scenario.name}`, async () => {
        const dom = new JSDOM(fs.readFileSync(path.join(root, 'reservation.html'), 'utf8'));
        await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        let calendar;
        const alerts = [];
        const calls = [];
        const context = vm.createContext({
            window: { supabaseClient: { async rpc(name, params) {
                calls.push({ name, params });
                return { data: scenario.error ? null : [{ site: '오토1' }], error: scenario.error || null };
            } } },
            document: dom.window.document,
            flatpickr(element, options) { calendar = options; },
            alert(message) { alerts.push(message); }, setTimeout() {}, console: { error() {} }
        });
        vm.runInContext(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), context);
        await vm.runInContext('ResManager.handleStep1()', context);
        await calendar.onChange([new Date(`${scenario.start}T00:00:00`), new Date(`${scenario.end}T00:00:00`)]);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].name, 'get_booked_sites');
        assert.equal(calls[0].params.p_start, scenario.start);
        const price = dom.window.document.getElementById('final-price');
        if (scenario.error) {
            assert.equal(alerts.length, 1);
            assert.match(alerts[0], /DB_CONNECTION_FAILED/);
            assert.equal(price.innerText, '0원'); // No price is offered after failed availability.
        } else {
            assert.equal(alerts.length, 0);
            assert.equal(price.innerText, scenario.price);
            assert.equal(dom.window.document.getElementById('step-map').style.display, 'block');
            assert.ok(dom.window.document.querySelector('[data-site="1"]').classList.contains('booked'));
        }
        dom.window.close();
    });
}

test('out-of-order availability cannot select a site for the wrong dates', async () => {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'reservation.html'), 'utf8'));
    await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const pending = [];
    let calendar;
    const context = vm.createContext({
        window: { supabaseClient: { rpc() { return new Promise(resolve => pending.push(resolve)); } } },
        document: dom.window.document, flatpickr(element, options) { calendar = options; },
        alert() {}, setTimeout() {}, console: { error() {} }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), context);
    await vm.runInContext('ResManager.handleStep1()', context);
    const dates = (start, end) => [new Date(start + 'T00:00:00'), new Date(end + 'T00:00:00')];
    const oldRequest = calendar.onChange(dates('2026-10-28', '2026-10-29'));
    const latestRequest = calendar.onChange(dates('2026-10-29', '2026-10-30'));
    pending[1]({ data: [{ site: '오토7' }], error: null });
    await latestRequest;
    pending[0]({ data: [{ site: '오토1' }], error: null });
    await oldRequest;
    const doc = dom.window.document;
    assert.ok(doc.querySelector('.site-overlay [data-site="16"]').classList.contains('booked'));
    assert.ok(!doc.querySelector('.site-overlay [data-site="1"]').classList.contains('booked'));
    assert.equal(doc.querySelector('.site-number-button[data-site="16"]').disabled, true);
    doc.querySelector('.site-number-button[data-site="4"]').click();
    assert.equal(doc.getElementById('res-site-val').innerText, '4');
    assert.equal(doc.querySelector('.site-overlay [data-site="4"]').getAttribute('aria-pressed'), 'true');
    await calendar.onChange([new Date('2026-10-30T00:00:00')]);
    assert.equal(doc.getElementById('step-map').style.display, 'none');
    assert.equal(doc.getElementById('res-site-val').innerText, '-');
    assert.equal(doc.querySelector('.site-number-button[data-site="4"]').disabled, true);
    doc.querySelector('.site-overlay [data-site="4"]').dispatchEvent(new dom.window.Event('click'));
    assert.equal(doc.getElementById('res-site-val').innerText, '-');
    dom.window.close();
});
