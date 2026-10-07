// Run: node tests/pricing.test.cjs (no npm dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const cases = require('./pricing-cases.json');
const context = vm.createContext({ window: {}, document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), context);
const utils = context.window.WolchonUtils;
for (const c of cases) {
    assert.equal(utils.getStayPrice(c.start, c.end), c.expected, c.name);
}
assert.throws(() => utils.getStayPrice('2026-10-08', '2026-10-08'));
assert.throws(() => utils.getStayPrice('2026-10-09', '2026-10-08'));
assert.throws(() => utils.getStayPrice('bad', '2026-10-08'));

// Exercise the actual inline option UI with the shared pricing function.
const html = fs.readFileSync(path.join(root, 'reservation2.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(script => script.includes('function updateReservationPrice'));
for (const c of cases) {
    let onChange;
    const elements = {
        'pool-option': { checked: false, addEventListener(type, fn) { onChange = fn; } },
        'option-total': {}, 'option-price-display': {}, 'final-price': {}
    };
    vm.runInNewContext(inline, {
        window: { WolchonUtils: utils }, URLSearchParams,
        location: { search: `?date=${encodeURIComponent(`${c.start} ~ ${c.end}`)}` },
        document: { addEventListener(type, fn) { fn(); }, getElementById(id) { return elements[id]; } },
        sessionStorage: { setItem() {}, removeItem() {} }, setTimeout(fn) { fn(); }
    });
    assert.equal(elements['final-price'].textContent, `${c.expected.toLocaleString('ko-KR')}원`, c.name);
    elements['pool-option'].checked = true;
    onChange();
    assert.equal(elements['option-total'].value, '20000');
    assert.equal(elements['final-price'].textContent, `${(c.expected + 20000).toLocaleString('ko-KR')}원`, c.name);
    elements['pool-option'].checked = false;
    onChange();
    assert.equal(elements['final-price'].textContent, `${c.expected.toLocaleString('ko-KR')}원`, c.name);
}
// Receipt breakdown must infer the pool option using weekday/weekend prices.
const receiptHtml = fs.readFileSync(path.join(root, 'reservation3.html'), 'utf8');
const receiptScript = [...receiptHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(script => script.includes('function getBasePriceFromReferrer'));
for (const c of cases) {
    for (const option of [0, 20000]) {
        let updateReceipt;
        const elements = {
            'base-price': {}, 'option-summary': {}, 'option-total-price': {},
            'final-price': { textContent: `${(c.expected + option).toLocaleString('ko-KR')}원` }
        };
        vm.runInNewContext(receiptScript, {
            window: { WolchonUtils: utils }, URL,
            document: {
                referrer: `https://example.com/reservation2.html?date=${encodeURIComponent(`${c.start} ~ ${c.end}`)}`,
                addEventListener(type, fn) { fn(); }, getElementById(id) { return elements[id]; }
            },
            sessionStorage: { getItem() { return null; } },
            setInterval(fn) { updateReceipt = fn; return 1; }, clearInterval() {}, setTimeout() {}
        });
        updateReceipt();
        assert.equal(elements['base-price'].textContent, `${c.expected.toLocaleString('ko-KR')}원`, c.name);
        assert.equal(elements['option-total-price'].textContent, `${option.toLocaleString('ko-KR')}원`, c.name);
        assert.equal(elements['option-summary'].textContent, option ? '수영장 이용' : '선택 없음', c.name);
    }
}
console.log(`PASS: ${cases.length} stay ranges, invalid ranges, option UI toggles, and 26 receipt breakdowns`);
