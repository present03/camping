document.addEventListener('DOMContentLoaded', async function () {
    if (!await window.AdminAuth.requireAdmin()) return;
    const start = document.getElementById('maintenance-start');
    const stop = document.getElementById('maintenance-stop');
    const end = document.getElementById('maintenance-expected-end');
    const status = document.getElementById('maintenance-status');
    const feedback = document.getElementById('maintenance-feedback');
    let enabled = null;

    function render(state) {
        enabled = state.enabled;
        status.textContent = enabled ? '현재 상태: 홈페이지 점검 중' : '현재 상태: 정상 운영 중';
        start.textContent = enabled ? '예상 종료 시간 변경' : '페이지 업데이트 시작';
        stop.disabled = !enabled;
        if (state.expected_end) end.value = state.expected_end.slice(0, 16);
    }

    async function refresh() {
        const response = await fetch(new URL('api/index.php?maintenance_status=1', document.baseURI), { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error('점검 상태를 확인하지 못했습니다. 종료 버튼으로 정상 운영 상태를 복원할 수 있습니다.');
        render(result.data);
    }

    async function save(nextEnabled) {
        if (nextEnabled && !end.reportValidity()) return;
        if (!confirm(nextEnabled ? '전체 방문자 페이지를 점검 안내로 전환할까요?' : '점검을 종료하고 홈페이지를 다시 열까요?')) return;
        start.disabled = stop.disabled = true;
        feedback.textContent = '저장 중…';
        try {
            const result = await window.supabaseClient.maintenance.set(nextEnabled, end.value);
            if (result.error) throw result.error;
            render(result.data);
            feedback.textContent = nextEnabled ? '점검 안내가 적용되었습니다. 이미 열린 페이지에는 최대 15초 후 반영됩니다.' : '업데이트가 종료되었습니다. 홈페이지가 다시 열렸습니다.';
        } catch (error) {
            feedback.textContent = error.message || '저장하지 못했습니다. 다시 시도해 주세요.';
        } finally {
            start.disabled = false;
            stop.disabled = enabled === false;
        }
    }

    start.addEventListener('click', () => save(true));
    stop.addEventListener('click', () => save(false));
    try {
        await refresh();
    } catch (error) {
        status.textContent = '현재 상태 확인 불가';
        feedback.textContent = error.message;
    } finally {
        start.disabled = false;
        stop.disabled = enabled === false;
    }
});
