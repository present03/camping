const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function client(fetch) {
    const context = vm.createContext({ window: {}, URL, fetch, document: {
        baseURI: 'https://example.org/reservation.html', addEventListener() {}
    } });
    vm.runInContext(source('js/supabase-config.js'), context);
    vm.runInContext(source('js/main.js'), context);
    return context.window;
}

for (const [status, code, label] of [
    [404, 'API_NOT_FOUND', 'API_NOT_FOUND'],
    [500, 'API_HTTP_ERROR', 'HTTP 500'],
    [403, 'API_HTTP_ERROR', 'HTTP 403'],
    [200, 'INVALID_API_RESPONSE', 'INVALID_API_RESPONSE']
]) {
    test(`non-JSON response ${status} retains a useful error`, async () => {
        const app = client(async () => ({ status, ok: status === 200, async json() { throw new SyntaxError('HTML response'); } }));
        const result = await app.supabaseClient.rpc('get_booked_sites', {});
        assert.equal(result.error.code, code);
        assert.equal(result.error.httpStatus, status);
        assert.ok(app.WolchonUtils.getFriendlyError(result.error).includes(label));
    });
}

for (const code of ['DB_NOT_CONFIGURED', 'DB_CONNECTION_FAILED', 'SERVER_ERROR', 'ALREADY_BOOKED', 'INVALID_DATE_RANGE']) {
    test(`structured ${code} is not collapsed into generic failure`, async () => {
        const app = client(async () => ({ status: 500, ok: false, async json() {
            return { ok: false, error: { code, message: 'sensitive-internal-detail' } };
        } }));
        const result = await app.supabaseClient.rpc('get_booked_sites', {});
        assert.equal(result.error.code, code);
        const message = app.WolchonUtils.getFriendlyError(result.error);
        assert.ok(!message.includes('처리 중 문제가 발생했습니다'));
        assert.ok(!message.includes('sensitive-internal-detail'));
    });
}

test('network failures are separate from server responses', async () => {
    const app = client(async () => { throw new TypeError('Failed to fetch'); });
    const result = await app.supabaseClient.rpc('get_booked_sites', {});
    assert.equal(result.error.code, 'NETWORK_ERROR');
    assert.equal(result.error.httpStatus, null);
    assert.match(app.WolchonUtils.getFriendlyError(result.error), /인터넷 연결/);
});

test('successful availability response is preserved', async () => {
    const app = client(async () => ({ status: 200, ok: true, async json() {
        return { ok: true, data: [{ site: '오토1' }] };
    } }));
    const result = await app.supabaseClient.rpc('get_booked_sites', {});
    assert.equal(result.error, null);
    assert.equal(result.data[0].site, '오토1');
});
