document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('admin-sidebar');

    if (!sidebar) return;

    const currentPage = location.pathname.split('/').pop();

    const menus = [
        { name: '관리자 메인', link: 'admin_dashboard.html' },
        { name: '예약 관리', link: 'admin_reservation.html' },
        { name: '공지사항 관리', link: 'admin_notice.html' },
        { name: '문의/Q&A 관리', link: 'admin_qna.html' },
        { name: 'FAQ 관리', link: 'admin_faq.html' },
        { name: '홈페이지 보기', link: 'index.html' }
    ];

    sidebar.innerHTML = `
        <div class="admin-logo">🏕️ 월촌<span>관리자</span></div>

        <nav class="admin-menu">
            ${menus.map(menu => `
                <a href="${menu.link}" class="${currentPage === menu.link ? 'active' : ''}">
                    ${menu.name}
                </a>
            `).join('')}

            <a href="#" id="admin-logout-link">로그아웃</a>
        </nav>
    `;

    document.getElementById('admin-logout-link')?.addEventListener('click', async function (event) {
        event.preventDefault();

        if (window.AdminAuth) {
            await window.AdminAuth.logout();
        }
    });
});
