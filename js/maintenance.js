(function () {
    'use strict';
    const page = location.pathname.split('/').pop();
    if (page.startsWith('admin_')) return;

    let checking = false;
    let active = document.body?.classList.contains('maintenance-active') || false;
    const api = new URL('api/index.php?maintenance_status=1', document.baseURI);

    function show(state, unavailable = false) {
        active = true;
        let screen = document.getElementById('maintenance-screen');
        if (!screen) {
            screen = document.createElement('main');
            screen.id = 'maintenance-screen';
            screen.className = 'maintenance-screen';
            screen.setAttribute('role', 'status');
            screen.setAttribute('aria-live', 'polite');
            screen.innerHTML = '<div class="maintenance-card"><p class="maintenance-brand">월촌캠핑장</p><h1></h1><p class="maintenance-description"></p><p id="maintenance-end"></p><p>점검 상황에 따라 종료 시간이 달라질 수 있습니다.</p></div>';
            document.body.append(screen);
        }
        document.body.classList.add('maintenance-active');
        screen.querySelector('h1').textContent = unavailable ? '접속 상태를 확인하지 못했습니다' : '페이지 점검중입니다';
        const description = screen.querySelector('.maintenance-description');
        if (description) description.textContent = unavailable
            ? '잠시 후 자동으로 다시 확인합니다. 계속되면 잠시 뒤 다시 방문해 주세요.'
            : '더 나은 서비스를 위해 홈페이지를 업데이트하고 있습니다. 잠시 후 다시 방문해 주세요.';
        const end = state?.expected_end ? new Date(state.expected_end) : null;
        document.getElementById('maintenance-end').textContent = end && Number.isFinite(end.getTime())
            ? `예상 종료: ${end.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })} (한국 시간)`
            : '종료 시간은 확인 중입니다.';
    }

    async function check() {
        if (checking) return !active;
        checking = true;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(api, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
            const result = await response.json();
            if (!response.ok || result.ok !== true || typeof result.data?.enabled !== 'boolean') throw new Error('Maintenance status unavailable');
            if (result.data.enabled) {
                show(result.data);
                return false;
            }
            if (active) {
                location.reload();
                return false;
            }
            return true;
        } catch (error) {
            // Static previews cannot execute the PHP status endpoint.
            if (location.hostname.endsWith('.github.io') || location.protocol === 'file:') return true;
            if (!active) show(null, true);
            return false;
        } finally {
            clearTimeout(timer);
            checking = false;
        }
    }

    window.SiteMaintenance = { show, check, ready: check() };
    setInterval(check, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
