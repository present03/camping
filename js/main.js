/* ==========================================
   월촌캠핑장 통합 스크립트
   - 공통 UI
   - 가비아 PHP/MySQL 공지 / FAQ / 문의 / 예약
   ========================================== */

const WolchonUtils = {
    getClient() {
        if (!window.supabaseClient) {
            throw new Error('SERVER_API_NOT_CONFIGURED');
        }

        return window.supabaseClient;
    },

    escapeHtml(text) {
        return String(text ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    getPageName() {
        return location.pathname.split('/').pop() || 'index.html';
    },

    isAdminPage() {
        const pageName = this.getPageName();
        return pageName.startsWith('admin_') && pageName !== 'admin_login.html';
    },

    async ensureAdmin() {
        if (!this.isAdminPage()) return true;

        if (!window.AdminAuth) {
            location.replace('admin_login.html');
            return false;
        }

        return window.AdminAuth.requireAdmin();
    },

    formatDate(value, separator = '.') {
        if (!value) return '-';

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value).replaceAll('-', separator);
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return [year, month, day].join(separator);
    },

    formatDateTime(value) {
        if (!value) return '-';

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return '-';

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');

        return `${year}.${month}.${day} ${hour}:${minute}`;
    },

    formatLocalDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    },

    parseDateRange(dateText) {
        if (!dateText || !dateText.includes(' ~ ')) {
            return null;
        }

        const [start, end] = dateText.split(' ~ ').map(value => value.trim());

        if (!start || !end) return null;

        return { start, end };
    },

    getNights(start, end) {
        const startDate = new Date(`${start}T00:00:00`);
        const endDate = new Date(`${end}T00:00:00`);
        const diff = endDate.getTime() - startDate.getTime();

        return Math.max(1, Math.round(diff / 86400000));
    },

    formatPrice(value) {
        const numericValue = Number(value);

        if (!Number.isFinite(numericValue)) {
            return String(value || '0원');
        }

        return `${numericValue.toLocaleString('ko-KR')}원`;
    },

    getFriendlyError(error) {
        const message = String(error?.message || error || '');

        if (message.includes('SERVER_API_NOT_CONFIGURED')) {
            return '가비아 서버 API 연결 설정이 아직 필요합니다.';
        }

        if (
            message.includes('ALREADY_BOOKED') ||
            message.includes('예약이 이미 존재') ||
            message.includes('exclusion')
        ) {
            return '선택하신 날짜와 구역에 이미 예약이 있습니다.';
        }

        if (message.includes('INVALID_PASSWORD')) {
            return '비밀번호가 일치하지 않습니다.';
        }

        if (message.includes('ADMIN_REQUIRED')) {
            return '관리자 권한이 필요합니다.';
        }

        return '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }
};

window.WolchonUtils = WolchonUtils;

/* ==========================================
   공통 UI
   ========================================== */

const CampingUI = {
    init() {
        this.handleMobileMenu();
        this.handleHeaderShadow();
        this.initSlider();
        this.initTabs();
    },

    handleMobileMenu() {
        const btnMenu = document.getElementById('btn-menu');
        const mainNav = document.getElementById('main-nav');
        const btnClose = document.getElementById('btn-menu-close');

        if (btnMenu && mainNav) {
            btnMenu.addEventListener('click', () => mainNav.classList.add('open'));
        }

        if (btnClose && mainNav) {
            btnClose.addEventListener('click', () => mainNav.classList.remove('open'));
        }
    },

    handleHeaderShadow() {
        const header = document.getElementById('header');

        if (!header) return;

        window.addEventListener('scroll', () => {
            header.style.boxShadow = window.scrollY > 10
                ? '0 4px 20px rgba(0,0,0,0.12)'
                : '0 2px 20px rgba(0,0,0,0.08)';
        });
    },

    initSlider() {
        const slider = document.querySelector('.main-slider');

        if (!slider) return;

        const slides = slider.querySelectorAll('.slide');
        const dots = slider.querySelectorAll('.dot');
        const prevBtn = slider.querySelector('.slider-prev');
        const nextBtn = slider.querySelector('.slider-next');

        if (!slides.length) return;

        let current = 0;
        let timer = null;

        const showSlide = (index) => {
            slides.forEach(slide => slide.classList.remove('active'));
            dots.forEach(dot => dot.classList.remove('active'));

            current = (index + slides.length) % slides.length;
            slides[current].classList.add('active');
            dots[current]?.classList.add('active');
        };

        const startAutoPlay = () => {
            clearInterval(timer);
            timer = setInterval(() => showSlide(current + 1), 5000);
        };

        nextBtn?.addEventListener('click', () => {
            showSlide(current + 1);
            startAutoPlay();
        });

        prevBtn?.addEventListener('click', () => {
            showSlide(current - 1);
            startAutoPlay();
        });

        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                showSlide(index);
                startAutoPlay();
            });
        });

        showSlide(0);
        startAutoPlay();
    },

    initTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        if (!tabButtons.length) return;

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(item => item.classList.remove('active'));
                tabContents.forEach(item => item.classList.remove('active'));

                button.classList.add('active');
                document.getElementById(button.dataset.tab)?.classList.add('active');
            });
        });
    }
};

/* ==========================================
   공지사항 DB
   ========================================== */

window.NoticeDB = {
    mapRow(row) {
        return {
            id: row.id,
            title: row.title,
            content: row.content,
            author: row.author || '관리자',
            date: WolchonUtils.formatDate(row.created_at),
            isFixed: Boolean(row.is_fixed),
            createdAt: row.created_at
        };
    },

    async getAll() {
        const client = WolchonUtils.getClient();

        const { data, error } = await client
            .from('notices')
            .select('id, title, content, author, is_fixed, created_at')
            .order('is_fixed', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(row => this.mapRow(row));
    },

    async getById(id) {
        const client = WolchonUtils.getClient();

        const { data, error } = await client
            .from('notices')
            .select('id, title, content, author, is_fixed, created_at')
            .eq('id', Number(id))
            .maybeSingle();

        if (error) throw error;

        return data ? this.mapRow(data) : null;
    },

    async create(noticeData) {
        const client = WolchonUtils.getClient();

        const { data, error } = await client
            .from('notices')
            .insert({
                title: noticeData.title,
                content: noticeData.content,
                author: noticeData.author || '관리자',
                is_fixed: Boolean(noticeData.isFixed)
            })
            .select('id, title, content, author, is_fixed, created_at')
            .single();

        if (error) throw error;

        return this.mapRow(data);
    },

    async delete(id) {
        const client = WolchonUtils.getClient();

        const { error } = await client
            .from('notices')
            .delete()
            .eq('id', Number(id));

        if (error) throw error;

        return true;
    }
};

window.NoticeManager = {
    pageSize: 10,
    currentNoticePage: 1,
    currentAdminNoticePage: 1,

    async init() {
        const noticeListBody = document.getElementById('notice-list-body');
        const mainNoticeList = document.getElementById('main-notice-list');
        const viewTitle = document.getElementById('view-title');
        const adminForm = document.getElementById('admin-notice-form');
        const adminListBody = document.getElementById('admin-notice-list');

        if (!noticeListBody && !mainNoticeList && !viewTitle && !adminForm && !adminListBody) {
            return;
        }

        try {
            if (noticeListBody) await this.renderList(noticeListBody);
            if (mainNoticeList) await this.renderMainList(mainNoticeList);
            if (viewTitle) await this.renderView();
            if (adminForm) this.bindAdminForm(adminForm);
            if (adminListBody) await this.renderAdminList(adminListBody);
        } catch (error) {
            console.error('공지사항 초기화 오류:', error);
            this.renderError(noticeListBody || adminListBody, 4);
            if (mainNoticeList) {
                mainNoticeList.innerHTML = `<li style="text-align:center; padding:20px; color:#999;">${WolchonUtils.escapeHtml(WolchonUtils.getFriendlyError(error))}</li>`;
            }
        }
    },

    sortNotices(notices) {
        return [...notices].sort((a, b) => {
            if (Number(b.isFixed) !== Number(a.isFixed)) {
                return Number(b.isFixed) - Number(a.isFixed);
            }

            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    },

    renderError(target, colspan) {
        if (!target) return;

        target.innerHTML = `
            <tr>
                <td colspan="${colspan}">공지사항을 불러오지 못했습니다.</td>
            </tr>
        `;
    },

    renderPagination(targetId, totalCount, currentPage, onClickName) {
        const pagination = document.getElementById(targetId);

        if (!pagination) return;

        const totalPages = Math.ceil(totalCount / this.pageSize);

        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        pagination.innerHTML = Array.from({ length: totalPages }, (_, index) => {
            const page = index + 1;

            return `
                <button
                    type="button"
                    class="page-btn ${page === currentPage ? 'active' : ''}"
                    onclick="window.NoticeManager.${onClickName}(${page})">
                    ${page}
                </button>
            `;
        }).join('');
    },

    async renderList(target) {
        const notices = this.sortNotices(await window.NoticeDB.getAll());
        const startIndex = (this.currentNoticePage - 1) * this.pageSize;
        const pagedNotices = notices.slice(startIndex, startIndex + this.pageSize);

        if (!pagedNotices.length) {
            target.innerHTML = `
                <tr>
                    <td colspan="4">등록된 공지사항이 없습니다.</td>
                </tr>
            `;
            return;
        }

        target.innerHTML = pagedNotices.map((notice, index) => `
            <tr style="${notice.isFixed ? 'background-color:#fffdf5;' : ''}">
                <td>${notice.isFixed ? '<strong>필독</strong>' : notices.length - (startIndex + index)}</td>
                <td class="title">
                    <a href="notice_view.html?id=${notice.id}" style="${notice.isFixed ? 'font-weight:bold;' : ''}">
                        ${WolchonUtils.escapeHtml(notice.title)}
                    </a>
                </td>
                <td>${WolchonUtils.escapeHtml(notice.author)}</td>
                <td>${WolchonUtils.escapeHtml(notice.date)}</td>
            </tr>
        `).join('');

        this.renderPagination(
            'notice-pagination',
            notices.length,
            this.currentNoticePage,
            'changeNoticePage'
        );
    },

    async renderMainList(target) {
        const notices = this.sortNotices(await window.NoticeDB.getAll()).slice(0, 5);

        if (!notices.length) {
            target.innerHTML = '<li style="text-align:center; padding:20px; color:#999;">등록된 공지사항이 없습니다.</li>';
            return;
        }

        target.innerHTML = notices.map(notice => `
            <li>
                <a href="notice_view.html?id=${notice.id}">
                    <span>
                        ${notice.isFixed ? '<span class="badge">필독</span>' : ''}
                        ${WolchonUtils.escapeHtml(notice.title)}
                    </span>
                    <span class="date">${WolchonUtils.escapeHtml(notice.date)}</span>
                </a>
            </li>
        `).join('');
    },

    async renderView() {
        const id = new URLSearchParams(location.search).get('id');
        const notice = id ? await window.NoticeDB.getById(id) : null;

        if (!notice) {
            document.getElementById('view-title').innerText = '존재하지 않는 공지입니다.';
            document.getElementById('view-date').innerText = '-';
            document.getElementById('view-content').innerText = '삭제되었거나 잘못된 주소입니다.';
            return;
        }

        document.getElementById('view-title').innerText = notice.title;
        document.getElementById('view-date').innerText = notice.date;
        document.getElementById('view-content').innerText = notice.content;
    },

    bindAdminForm(form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const title = document.getElementById('notice-title')?.value.trim() || '';
            const content = document.getElementById('notice-content')?.value.trim() || '';
            const isFixed = Boolean(document.getElementById('notice-fixed')?.checked);
            const submitButton = form.querySelector('button[type="submit"]');

            if (!title || !content) {
                alert('제목과 내용을 모두 입력해 주세요.');
                return;
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = '등록 중...';
            }

            try {
                await window.NoticeDB.create({
                    title,
                    content,
                    isFixed,
                    author: '관리자'
                });

                alert('공지사항이 등록되었습니다.');
                location.reload();
            } catch (error) {
                console.error('공지 등록 오류:', error);
                alert(WolchonUtils.getFriendlyError(error));
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = '공지 등록';
                }
            }
        });
    },

    async renderAdminList(target) {
        const notices = this.sortNotices(await window.NoticeDB.getAll());
        const startIndex = (this.currentAdminNoticePage - 1) * this.pageSize;
        const pagedNotices = notices.slice(startIndex, startIndex + this.pageSize);

        if (!pagedNotices.length) {
            target.innerHTML = `
                <tr>
                    <td colspan="4">등록된 공지사항이 없습니다.</td>
                </tr>
            `;
            return;
        }

        target.innerHTML = pagedNotices.map((notice, index) => `
            <tr>
                <td>${startIndex + index + 1}</td>
                <td class="title">
                    ${notice.isFixed ? '<span style="display:inline-block; margin-right:8px; padding:3px 7px; background:#fff5e6; color:#d98200; border-radius:999px; font-size:12px; font-weight:bold;">필독</span>' : ''}
                    ${WolchonUtils.escapeHtml(notice.title)}
                </td>
                <td>${WolchonUtils.escapeHtml(notice.date)}</td>
                <td>
                    <button
                        type="button"
                        onclick="window.NoticeManager.deleteNotice(${notice.id})"
                        style="padding:6px 12px; border:1px solid #e74c3c; background:#fff; color:#e74c3c; border-radius:5px; cursor:pointer;">
                        삭제
                    </button>
                </td>
            </tr>
        `).join('');

        this.renderPagination(
            'admin-notice-pagination',
            notices.length,
            this.currentAdminNoticePage,
            'changeAdminNoticePage'
        );
    },

    async deleteNotice(id) {
        if (!confirm('이 공지사항을 삭제하시겠습니까?')) return;

        try {
            await window.NoticeDB.delete(id);
            alert('삭제되었습니다.');
            location.reload();
        } catch (error) {
            console.error('공지 삭제 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async changeNoticePage(page) {
        this.currentNoticePage = page;
        const target = document.getElementById('notice-list-body');

        if (target) await this.renderList(target);
    },

    async changeAdminNoticePage(page) {
        this.currentAdminNoticePage = page;
        const target = document.getElementById('admin-notice-list');

        if (target) await this.renderAdminList(target);
    }
};

/* ==========================================
   문의 / Q&A DB
   ========================================== */

window.QnaDB = {
    mapRow(row) {
        const reply = row.reply_content
            ? {
                content: row.reply_content,
                date: WolchonUtils.formatDate(row.reply_date || row.updated_at || row.created_at),
                author: '관리자'
            }
            : null;

        return {
            id: row.id,
            title: row.title,
            name: row.name,
            phone: row.phone || '',
            content: row.content || '',
            date: WolchonUtils.formatDate(row.created_at),
            status: row.status || '답변대기',
            reply,
            createdAt: row.created_at
        };
    },

    async getAll() {
        const client = WolchonUtils.getClient();

        if (WolchonUtils.isAdminPage()) {
            const { data, error } = await client
                .from('qna_posts')
                .select('id, title, name, phone, content, status, reply_content, reply_date, created_at, updated_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            return (data || []).map(row => this.mapRow(row));
        }

        const { data, error } = await client.rpc('public_list_qna');

        if (error) throw error;

        return (data || []).map(row => this.mapRow(row));
    },

    async getById(id) {
        const client = WolchonUtils.getClient();

        if (WolchonUtils.isAdminPage()) {
            const { data, error } = await client
                .from('qna_posts')
                .select('id, title, name, phone, content, status, reply_content, reply_date, created_at, updated_at')
                .eq('id', Number(id))
                .maybeSingle();

            if (error) throw error;

            return data ? this.mapRow(data) : null;
        }

        const { data, error } = await client.rpc('public_get_qna', {
            p_id: Number(id)
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;

        return row ? this.mapRow(row) : null;
    },

    async create(postData) {
        const client = WolchonUtils.getClient();

        const { data, error } = await client.rpc('create_qna', {
            p_title: postData.title,
            p_name: postData.name,
            p_phone: postData.phone,
            p_password: postData.password,
            p_content: postData.content
        });

        if (error) throw error;

        return {
            id: Number(data)
        };
    },

    async saveReply(id, replyContent) {
        const client = WolchonUtils.getClient();

        const { error } = await client
            .from('qna_posts')
            .update({
                status: '답변완료',
                reply_content: replyContent,
                reply_date: new Date().toISOString()
            })
            .eq('id', Number(id));

        if (error) throw error;

        return true;
    },

    async deleteByPassword(id, password) {
        const client = WolchonUtils.getClient();

        const { data, error } = await client.rpc('delete_qna_with_password', {
            p_id: Number(id),
            p_password: password
        });

        if (error) throw error;

        return Boolean(data);
    },

    async deleteAdmin(id) {
        const client = WolchonUtils.getClient();

        const { error } = await client
            .from('qna_posts')
            .delete()
            .eq('id', Number(id));

        if (error) throw error;

        return true;
    }
};

window.QnaManager = {
    async init() {
        const listBody = document.getElementById('qna-list-body');
        const writeForm = document.getElementById('qna-write-form');
        const viewTitle = document.getElementById('qna-view-title');
        const adminList = document.getElementById('qna-admin-list');

        if (!listBody && !writeForm && !viewTitle && !adminList) return;

        try {
            if (listBody) await this.renderList(listBody);
            if (writeForm) this.bindWriteForm(writeForm);
            if (viewTitle) await this.renderView();
            if (adminList) await this.renderAdminList(adminList);
        } catch (error) {
            console.error('문의 초기화 오류:', error);

            if (listBody) {
                listBody.innerHTML = '<tr><td colspan="5">문의글을 불러오지 못했습니다.</td></tr>';
            }

            if (adminList) {
                adminList.innerHTML = '<tr><td colspan="6">문의글을 불러오지 못했습니다.</td></tr>';
            }
        }
    },

    sortPosts(posts) {
        return [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async renderList(target) {
        const posts = this.sortPosts(await window.QnaDB.getAll());

        if (!posts.length) {
            target.innerHTML = '<tr><td colspan="5">등록된 문의글이 없습니다.</td></tr>';
            return;
        }

        target.innerHTML = posts.map((post, index) => `
            <tr>
                <td>${posts.length - index}</td>
                <td>
                    <span style="font-weight:bold; color:${post.status === '답변완료' ? 'var(--primary)' : '#e74c3c'};">
                        ${WolchonUtils.escapeHtml(post.status)}
                    </span>
                </td>
                <td class="title">
                    <a href="contact_view.html?id=${post.id}">
                        ${WolchonUtils.escapeHtml(post.title)}
                    </a>
                </td>
                <td>${WolchonUtils.escapeHtml(post.name)}</td>
                <td>${WolchonUtils.escapeHtml(post.date)}</td>
            </tr>
        `).join('');
    },

    bindWriteForm(form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const title = document.getElementById('qna-title')?.value.trim() || '';
            const name = document.getElementById('qna-name')?.value.trim() || '';
            const phone = document.getElementById('qna-phone')?.value.trim() || '';
            const password = document.getElementById('qna-password')?.value || '';
            const content = document.getElementById('qna-content')?.value.trim() || '';
            const privacy = Boolean(document.getElementById('qna-privacy')?.checked);
            const button = document.getElementById('qna-submit-button') || form.querySelector('button[type="submit"]');

            if (!title || !name || !phone || !password || !content) {
                alert('필수 항목을 모두 입력해 주세요.');
                return;
            }

            if (password.length < 4) {
                alert('삭제 확인용 비밀번호는 4자 이상으로 입력해 주세요.');
                return;
            }

            if (!privacy) {
                alert('개인정보 수집 및 이용에 동의해 주세요.');
                return;
            }

            if (button) {
                button.disabled = true;
                button.textContent = '등록 중...';
            }

            try {
                const newPost = await window.QnaDB.create({
                    title,
                    name,
                    phone,
                    password,
                    content
                });

                alert('문의글이 등록되었습니다.');
                location.href = `contact_view.html?id=${newPost.id}`;
            } catch (error) {
                console.error('문의 등록 오류:', error);
                alert(WolchonUtils.getFriendlyError(error));
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = '등록하기';
                }
            }
        });
    },

    async renderView() {
        const id = new URLSearchParams(location.search).get('id');
        const post = id ? await window.QnaDB.getById(id) : null;

        if (!post) {
            document.getElementById('qna-view-title').innerText = '존재하지 않는 문의글입니다.';
            document.getElementById('qna-view-name').innerText = '-';
            document.getElementById('qna-view-date').innerText = '-';
            document.getElementById('qna-view-status').innerText = '-';
            document.getElementById('qna-view-content').innerText = '삭제되었거나 잘못된 주소입니다.';
            document.getElementById('qna-view-reply').innerText = '-';
            document.getElementById('qna-delete-btn')?.remove();
            return;
        }

        document.getElementById('qna-view-title').innerText = post.title;
        document.getElementById('qna-view-name').innerText = post.name;
        document.getElementById('qna-view-date').innerText = post.date;
        document.getElementById('qna-view-status').innerText = post.status;
        document.getElementById('qna-view-content').innerText = post.content;

        const replyBox = document.getElementById('qna-view-reply');

        if (replyBox) {
            replyBox.innerText = post.reply
                ? `${post.reply.content}\n\n답변일: ${post.reply.date}`
                : '아직 답변이 등록되지 않았습니다.';
        }

        document.getElementById('qna-delete-btn')?.addEventListener('click', () => {
            this.deleteByPassword(post.id);
        });
    },

    async deleteByPassword(id) {
        const password = prompt('글 작성 시 입력한 비밀번호를 입력해 주세요.');

        if (password === null) return;
        if (!password) {
            alert('비밀번호를 입력해 주세요.');
            return;
        }

        if (!confirm('문의글을 삭제하시겠습니까?')) return;

        try {
            const deleted = await window.QnaDB.deleteByPassword(id, password);

            if (!deleted) {
                alert('비밀번호가 일치하지 않습니다.');
                return;
            }

            alert('삭제되었습니다.');
            location.href = 'contact.html';
        } catch (error) {
            console.error('문의 삭제 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async renderAdminList(target) {
        const posts = this.sortPosts(await window.QnaDB.getAll());

        if (!posts.length) {
            target.innerHTML = '<tr><td colspan="6">등록된 문의글이 없습니다.</td></tr>';
            return;
        }

        target.innerHTML = posts.map((post, index) => `
            <tr>
                <td>${posts.length - index}</td>
                <td>
                    <span style="font-weight:bold; color:${post.status === '답변완료' ? 'var(--primary)' : '#e74c3c'};">
                        ${WolchonUtils.escapeHtml(post.status)}
                    </span>
                </td>
                <td class="title">
                    <button
                        type="button"
                        onclick="window.QnaManager.showAdminDetail(${post.id})"
                        style="background:none; border:none; cursor:pointer; font-size:14px; color:var(--text);">
                        ${WolchonUtils.escapeHtml(post.title)}
                    </button>
                </td>
                <td>${WolchonUtils.escapeHtml(post.name)}</td>
                <td>${WolchonUtils.escapeHtml(post.date)}</td>
                <td>
                    <button
                        type="button"
                        onclick="window.QnaManager.deleteAdminPost(${post.id})"
                        style="padding:6px 12px; border:1px solid #e74c3c; background:#fff; color:#e74c3c; border-radius:5px; cursor:pointer;">
                        삭제
                    </button>
                </td>
            </tr>
        `).join('');
    },

    async showAdminDetail(id) {
        try {
            const post = await window.QnaDB.getById(id);
            const detailBox = document.getElementById('qna-admin-detail');

            if (!post || !detailBox) return;

            detailBox.style.display = 'block';
            detailBox.innerHTML = `
                <h3 style="font-size:1.4rem; margin-bottom:10px; color:var(--primary-dark);">
                    ${WolchonUtils.escapeHtml(post.title)}
                </h3>

                <p style="color:#999; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:25px;">
                    작성자: ${WolchonUtils.escapeHtml(post.name)} |
                    연락처: ${WolchonUtils.escapeHtml(post.phone)} |
                    작성일: ${WolchonUtils.escapeHtml(post.date)} |
                    상태: <strong>${WolchonUtils.escapeHtml(post.status)}</strong>
                </p>

                <div style="white-space:pre-wrap; line-height:2; padding:25px; background:#f9f9f9; border-radius:10px; margin-bottom:25px;">
                    ${WolchonUtils.escapeHtml(post.content)}
                </div>

                <h4 style="margin-bottom:10px; color:var(--primary-dark);">관리자 답변</h4>

                <textarea
                    id="qna-reply-content"
                    rows="8"
                    style="width:100%; padding:14px; border:1px solid #ddd; border-radius:6px; resize:vertical; line-height:1.7;">${post.reply ? WolchonUtils.escapeHtml(post.reply.content) : ''}</textarea>

                <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                    <button
                        type="button"
                        class="btn btn-primary"
                        onclick="window.QnaManager.saveAdminReply(${post.id})">
                        답변 저장
                    </button>

                    <a href="contact_view.html?id=${post.id}" class="btn btn-outline">
                        사용자 화면 보기
                    </a>
                </div>
            `;

            detailBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            console.error('문의 상세 조회 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async saveAdminReply(id) {
        const replyContent = document.getElementById('qna-reply-content')?.value.trim() || '';

        if (!replyContent) {
            alert('답변 내용을 입력해 주세요.');
            return;
        }

        try {
            await window.QnaDB.saveReply(id, replyContent);
            alert('답변이 저장되었습니다.');
            location.reload();
        } catch (error) {
            console.error('답변 저장 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async deleteAdminPost(id) {
        if (!confirm('관리자 권한으로 이 문의글을 삭제하시겠습니까?')) return;

        try {
            await window.QnaDB.deleteAdmin(id);
            alert('삭제되었습니다.');
            location.reload();
        } catch (error) {
            console.error('문의 관리자 삭제 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    }
};

/* ==========================================
   FAQ DB
   ========================================== */

window.FaqDB = {
    mapRow(row) {
        return {
            id: row.id,
            question: row.question,
            answer: row.answer,
            sortOrder: Number(row.sort_order || 0),
            createdAt: row.created_at
        };
    },

    async getAll() {
        const client = WolchonUtils.getClient();

        const { data, error } = await client
            .from('faqs')
            .select('id, question, answer, sort_order, created_at')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) throw error;

        return (data || []).map(row => this.mapRow(row));
    },

    async create(faqData) {
        const client = WolchonUtils.getClient();

        const { data, error } = await client
            .from('faqs')
            .insert({
                question: faqData.question,
                answer: faqData.answer
            })
            .select('id, question, answer, sort_order, created_at')
            .single();

        if (error) throw error;

        return this.mapRow(data);
    },

    async delete(id) {
        const client = WolchonUtils.getClient();

        const { error } = await client
            .from('faqs')
            .delete()
            .eq('id', Number(id));

        if (error) throw error;

        return true;
    }
};

window.FaqManager = {
    async init() {
        const faqList = document.getElementById('faq-list');
        const faqForm = document.getElementById('faq-admin-form');
        const faqAdminList = document.getElementById('faq-admin-list');

        if (!faqList && !faqForm && !faqAdminList) return;

        try {
            if (faqList) await this.renderFaqList(faqList);
            if (faqForm) this.bindFaqForm(faqForm);
            if (faqAdminList) await this.renderAdminList(faqAdminList);
        } catch (error) {
            console.error('FAQ 초기화 오류:', error);

            if (faqList) {
                faqList.innerHTML = `<div style="padding:35px; text-align:center;">${WolchonUtils.escapeHtml(WolchonUtils.getFriendlyError(error))}</div>`;
            }

            if (faqAdminList) {
                faqAdminList.innerHTML = '<tr><td colspan="3">FAQ를 불러오지 못했습니다.</td></tr>';
            }
        }
    },

    async renderFaqList(target) {
        const faqs = await window.FaqDB.getAll();

        if (!faqs.length) {
            target.innerHTML = '<div style="padding:35px; text-align:center;">등록된 FAQ가 없습니다.</div>';
            return;
        }

        target.innerHTML = faqs.map(faq => `
            <div style="margin-bottom:15px; border:1px solid #eee; border-radius:8px; background:#fff; padding:20px;">
                <h4 style="color:var(--primary);">Q. ${WolchonUtils.escapeHtml(faq.question)}</h4>
                <p style="margin-top:10px; color:var(--text-light); font-size:14px; white-space:pre-wrap;">
                    A. ${WolchonUtils.escapeHtml(faq.answer)}
                </p>
            </div>
        `).join('');
    },

    bindFaqForm(form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const question = document.getElementById('faq-question')?.value.trim() || '';
            const answer = document.getElementById('faq-answer')?.value.trim() || '';
            const button = form.querySelector('button[type="submit"]');

            if (!question || !answer) {
                alert('질문과 답변을 모두 입력해 주세요.');
                return;
            }

            if (button) {
                button.disabled = true;
                button.textContent = '등록 중...';
            }

            try {
                await window.FaqDB.create({ question, answer });
                alert('FAQ가 등록되었습니다.');
                location.reload();
            } catch (error) {
                console.error('FAQ 등록 오류:', error);
                alert(WolchonUtils.getFriendlyError(error));
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = 'FAQ 등록';
                }
            }
        });
    },

    async renderAdminList(target) {
        const faqs = await window.FaqDB.getAll();

        if (!faqs.length) {
            target.innerHTML = '<tr><td colspan="3">등록된 FAQ가 없습니다.</td></tr>';
            return;
        }

        target.innerHTML = faqs.map((faq, index) => `
            <tr>
                <td>${index + 1}</td>
                <td class="title">${WolchonUtils.escapeHtml(faq.question)}</td>
                <td>
                    <button
                        type="button"
                        onclick="window.FaqManager.deleteFaq(${faq.id})"
                        style="padding:6px 12px; border:1px solid #e74c3c; background:#fff; color:#e74c3c; border-radius:5px; cursor:pointer;">
                        삭제
                    </button>
                </td>
            </tr>
        `).join('');
    },

    async deleteFaq(id) {
        if (!confirm('이 FAQ를 삭제하시겠습니까?')) return;

        try {
            await window.FaqDB.delete(id);
            alert('삭제되었습니다.');
            location.reload();
        } catch (error) {
            console.error('FAQ 삭제 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    }
};

/* ==========================================
   예약 시스템
   ========================================== */

const ResManager = {
    params: null,

    async init() {
        const hasReservationFeature =
            document.getElementById('inline-calendar') ||
            document.getElementById('reservation-detail-form') ||
            document.getElementById('countdown') ||
            document.getElementById('btn-check-res') ||
            document.getElementById('summary-date') ||
            document.getElementById('summary-site');

        if (!hasReservationFeature) return;

        this.params = new URLSearchParams(location.search);
        window.ResManager = this;

        this.displaySummary();

        try {
            await this.handleStep1();
            await this.handleStep2();
            await this.handleStep3();
            this.handleConfirmPage();
        } catch (error) {
            console.error('예약 기능 초기화 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    getParam(key) {
        return this.params?.get(key) || '';
    },

    smoothScroll(id, block = 'start') {
        document.getElementById(id)?.scrollIntoView({
            behavior: 'smooth',
            block
        });
    },

    async getBookedSites(start, end) {
        const client = WolchonUtils.getClient();

        const { data, error } = await client.rpc('get_booked_sites', {
            p_start: start,
            p_end: end
        });

        if (error) throw error;

        return new Set((data || []).map(row => row.site));
    },

    async handleStep1() {
        const calendarElement = document.getElementById('inline-calendar');

        if (!calendarElement) return;

        if (typeof flatpickr !== 'function') {
            throw new Error('달력 라이브러리를 불러오지 못했습니다.');
        }

        flatpickr(calendarElement, {
            inline: true,
            mode: 'range',
            minDate: 'today',
            dateFormat: 'Y-m-d',
            locale: 'ko',
            onChange: async (dates) => {
                if (dates.length !== 2) return;

                const start = WolchonUtils.formatLocalDate(dates[0]);
                const end = WolchonUtils.formatLocalDate(dates[1]);
                const dateText = `${start} ~ ${end}`;

                document.getElementById('res-date-val').innerText = dateText;

                document.querySelectorAll('.site-group').forEach(group => {
                    group.classList.remove('booked', 'selected');
                    group.style.pointerEvents = 'auto';
                });

                document.getElementById('res-site-val').innerText = '-';
                document.getElementById('step-summary').style.display = 'none';

                try {
                    const bookedSites = await this.getBookedSites(start, end);

                    document.querySelectorAll('.site-group').forEach(group => {
                        if (bookedSites.has(group.dataset.site)) {
                            group.classList.add('booked');
                            group.style.pointerEvents = 'none';
                        }
                    });
                } catch (error) {
                    console.error('예약 가능 구역 조회 오류:', error);
                    alert(WolchonUtils.getFriendlyError(error));
                    return;
                }

                const nights = WolchonUtils.getNights(start, end);
                const priceElement = document.getElementById('final-price');

                if (priceElement) {
                    priceElement.innerText = WolchonUtils.formatPrice(nights * 50000);
                }

                document.getElementById('step-map').style.display = 'block';
                setTimeout(() => this.smoothScroll('step-map'), 200);
            }
        });

        document.querySelectorAll('.site-group').forEach(group => {
            group.addEventListener('click', function () {
                if (this.classList.contains('booked')) return;

                document.querySelectorAll('.site-group').forEach(item => {
                    item.classList.remove('selected');
                });

                this.classList.add('selected');
                document.getElementById('res-site-val').innerText = this.dataset.site;
                document.getElementById('step-summary').style.display = 'block';

                setTimeout(() => {
                    document.getElementById('step-summary')?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }, 200);
            });
        });

        document.getElementById('btn-next-step')?.addEventListener('click', (event) => {
            event.preventDefault();

            const date = document.getElementById('res-date-val')?.innerText || '';
            const site = document.getElementById('res-site-val')?.innerText || '-';

            if (!date.includes(' ~ ')) {
                alert('이용 날짜를 선택해 주세요.');
                return;
            }

            if (site === '-') {
                alert('구역을 선택해 주세요.');
                return;
            }

            location.href = `reservation2.html?date=${encodeURIComponent(date)}&site=${encodeURIComponent(site)}`;
        });
    },

    async handleStep2() {
        const form = document.getElementById('reservation-detail-form');

        if (!form) return;

        const select = document.getElementById('adult_count');
        const manualInput = document.getElementById('adult_manual_input');

        select?.addEventListener('change', function () {
            if (manualInput) {
                manualInput.style.display = this.value === 'manual' ? 'block' : 'none';
                manualInput.required = this.value === 'manual';
            }
        });

        const dateRange = WolchonUtils.parseDateRange(this.getParam('date'));
        const site = this.getParam('site');

        if (!dateRange || !site) {
            alert('예약 날짜와 구역 정보가 없습니다. 다시 선택해 주세요.');
            location.replace('reservation.html');
            return;
        }

        const nights = WolchonUtils.getNights(dateRange.start, dateRange.end);
        const priceElement = document.getElementById('final-price');

        if (priceElement) {
            priceElement.innerText = WolchonUtils.formatPrice(nights * 50000);
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const button = document.getElementById('btn-next-to-pay');
            const peopleValue = select?.value === 'manual'
                ? Number(manualInput?.value || 0)
                : Number(select?.value || 0);

            if (!Number.isInteger(peopleValue) || peopleValue < 1 || peopleValue > 20) {
                alert('이용 인원을 올바르게 입력해 주세요.');
                return;
            }

            if (button) {
                button.disabled = true;
                button.textContent = '예약 처리 중...';
            }

            try {
                const client = WolchonUtils.getClient();

                // 예약2 페이지에서 계산된 옵션 추가금액
                const optionTotal = Number(
                    document.getElementById('option-total')?.value || 0
                );
                // 고객이 직접 작성한 요청사항
                const specialRequest =
                    form.querySelector('textarea[name="special_request"]')
                        ?.value.trim() || '';

                // 관리자 페이지에 표시할 추가 옵션 이름
                const optionRequest =
                    optionTotal === 20000
                        ? '[추가 옵션] 수영장 이용'
                        : '';

                // 추가 옵션과 고객 요청사항을 함께 저장
                const reservationRequest = [
                    optionRequest,
                    specialRequest
                ]
                    .filter(Boolean)
                    .join('\n');

                const { data, error } = await client.rpc('create_reservation', {
                    p_name:
                        document.getElementById('guest_name')
                            ?.value.trim() || '',

                    p_phone:
                        form.querySelector('input[name="guest_phone"]')
                            ?.value.trim() || '',

                    p_car:
                        document.getElementById('car_number')
                            ?.value.trim() || '',

                    p_people: peopleValue,

                    p_request: reservationRequest,

                    p_start: dateRange.start,
                    p_end: dateRange.end,
                    p_site: site,

                    // 테이블·수영장 추가금액을 서버에 전달
                    p_option_total: optionTotal
                });

                if (error) throw error;

                alert('예약 신청이 완료되었습니다.');
                location.href = `reservation3.html?id=${encodeURIComponent(data)}`;
            } catch (error) {
                console.error('예약 생성 오류:', error);

                const message = WolchonUtils.getFriendlyError(error);
                alert(message);

                if (message.includes('이미 예약')) {
                    location.href = 'reservation.html';
                }
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = '다음 단계 (결제/확인)';
                }
            }
        });
    },

    async handleStep3() {
        const countdownElement = document.getElementById('countdown');

        if (!countdownElement) return;

        const reservationId = this.getParam('id');

        if (!reservationId) {
            countdownElement.innerText = '예약 정보를 찾을 수 없음';
            return;
        }

        const client = WolchonUtils.getClient();

        const { data, error } = await client.rpc('get_reservation_receipt', {
            p_id: reservationId
        });

        if (error) throw error;

        const reservation = Array.isArray(data) ? data[0] : data;

        if (!reservation) {
            countdownElement.innerText = '예약 정보를 찾을 수 없음';
            return;
        }

        const priceElement = document.getElementById('final-price');

        if (priceElement) {
            priceElement.innerText = WolchonUtils.formatPrice(reservation.price);
        }

        const expiresAt = new Date(reservation.expires_at).getTime();

        const updateCountdown = () => {
            const remain = expiresAt - Date.now();

            if (reservation.status !== '결제대기') {
                countdownElement.innerText = reservation.status;
                return false;
            }

            if (remain <= 0) {
                countdownElement.innerText = '시간 초과 (자동 취소)';
                return false;
            }

            const hour = String(Math.floor(remain / 3600000)).padStart(2, '0');
            const minute = String(Math.floor((remain % 3600000) / 60000)).padStart(2, '0');
            const second = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');

            countdownElement.innerText = `${hour}:${minute}:${second}`;
            return true;
        };

        if (!updateCountdown()) return;

        const timer = setInterval(() => {
            if (!updateCountdown()) {
                clearInterval(timer);
            }
        }, 1000);
    },

    displaySummary() {
        const dateElement = document.getElementById('summary-date');
        const siteElement = document.getElementById('summary-site');

        if (dateElement) {
            dateElement.innerText = this.getParam('date') || '선택 없음';
        }

        if (siteElement) {
            siteElement.innerText = this.getParam('site') || '선택 없음';
        }
    },

    handleConfirmPage() {
        const button = document.getElementById('btn-check-res');

        if (!button) return;

        button.addEventListener('click', async () => {
            const name = document.getElementById('check-name')?.value.trim() || '';
            const phone = document.getElementById('check-phone')?.value.trim() || '';
            const container = document.getElementById('res-list-container');
            const resultArea = document.getElementById('confirm-result');

            if (!name || !phone) {
                alert('정보를 모두 입력해 주세요.');
                return;
            }

            button.disabled = true;
            button.textContent = '조회 중...';

            try {
                const client = WolchonUtils.getClient();

                const { data, error } = await client.rpc('find_reservations', {
                    p_name: name,
                    p_phone: phone
                });

                if (error) throw error;

                const reservations = data || [];

                if (!reservations.length) {
                    alert('일치하는 예약 정보를 찾을 수 없습니다.');
                    resultArea.style.display = 'none';
                    return;
                }

                container.innerHTML = reservations.map(reservation => {
                    const cancelButton = reservation.status === '결제대기'
                        ? `
                            <button
                                type="button"
                                class="reservation-cancel-button"
                                data-id="${WolchonUtils.escapeHtml(reservation.id)}"
                                style="margin-top:15px; width:100%; padding:10px; background:#fff; border:1px solid #e74c3c; color:#e74c3c; border-radius:6px; cursor:pointer; font-weight:bold;">
                                예약 취소하기 (입금 전)
                            </button>
                        `
                        : '';

                    const deadline = reservation.status === '결제대기'
                        ? `
                            <p style="margin-top:8px; font-size:0.9rem;">
                                <strong>입금마감:</strong>
                                <span style="color:#e74c3c; font-weight:bold;">
                                    ${WolchonUtils.escapeHtml(WolchonUtils.formatDateTime(reservation.expires_at))}
                                </span>
                            </p>
                        `
                        : '';

                    return `
                        <div style="background:#f9f9f9; padding:20px; border-radius:10px; line-height:1.8; font-size:0.95rem; margin-bottom:15px; border:1px solid #eee; text-align:left;">
                            <p><strong>예약날짜:</strong> ${WolchonUtils.escapeHtml(reservation.reservation_date)}</p>
                            <p><strong>예약구역:</strong> ${WolchonUtils.escapeHtml(reservation.site)}</p>
                            <p><strong>차량번호:</strong> ${WolchonUtils.escapeHtml(reservation.car || '차량없음')}</p>
                            <p><strong>예약인원:</strong> ${WolchonUtils.escapeHtml(`${reservation.people}명`)}</p>
                            <p><strong>결제금액:</strong> ${WolchonUtils.escapeHtml(WolchonUtils.formatPrice(reservation.price))}</p>
                            <p>
                                <strong>예약상태:</strong>
                                <span style="font-weight:bold; color:${reservation.status === '예약완료' ? '#2ecc71' : '#e74c3c'}">
                                    ${WolchonUtils.escapeHtml(reservation.status)}
                                </span>
                            </p>
                            ${deadline}
                            ${cancelButton}
                        </div>
                    `;
                }).join('');

                container.querySelectorAll('.reservation-cancel-button').forEach(cancelButton => {
                    cancelButton.addEventListener('click', () => {
                        this.deleteReservation(cancelButton.dataset.id, name, phone);
                    });
                });

                resultArea.style.display = 'block';
                setTimeout(() => {
                    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            } catch (error) {
                console.error('예약 조회 오류:', error);
                alert(WolchonUtils.getFriendlyError(error));
            } finally {
                button.disabled = false;
                button.textContent = '예약 확인';
            }
        });
    },

    async deleteReservation(id, name, phone) {
        if (!confirm('입금 전 예약을 취소하시겠습니까?')) return;

        try {
            const client = WolchonUtils.getClient();

            const { data, error } = await client.rpc('cancel_waiting_reservation', {
                p_id: id,
                p_name: name,
                p_phone: phone
            });

            if (error) throw error;

            if (!data) {
                alert('취소 가능한 예약을 찾지 못했습니다.');
                return;
            }

            alert('예약이 정상적으로 취소되었습니다.');
            location.reload();
        } catch (error) {
            console.error('예약 취소 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    }
};

window.ResManager = ResManager;

/* ==========================================
   관리자 예약 관리
   ========================================== */

window.ReservationAdmin = {
    reservations: [],

    async init() {
        const listBody = document.getElementById('admin-reservation-list');

        if (!listBody) return;

        this.bindFilters();
        await this.refresh();
    },

    async refresh() {
        try {
            const client = WolchonUtils.getClient();

            const { data, error } = await client
                .from('reservations')
                .select('id, name, phone, car, people, request, reservation_date, reservation_start, reservation_end, site, price, status, created_at, expires_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.reservations = data || [];
            this.render();
        } catch (error) {
            console.error('관리자 예약 조회 오류:', error);

            const listBody = document.getElementById('admin-reservation-list');

            if (listBody) {
                listBody.innerHTML = '<tr><td colspan="11">예약 내역을 불러오지 못했습니다.</td></tr>';
            }
        }
    },

    bindFilters() {
        document.getElementById('reservation-status-filter')?.addEventListener('change', () => {
            this.render();
        });

        document.getElementById('reservation-search-input')?.addEventListener('input', () => {
            this.render();
        });
    },

    getFilteredReservations() {
        const statusFilter = document.getElementById('reservation-status-filter')?.value || '전체';
        const keyword = document.getElementById('reservation-search-input')?.value.trim().toLowerCase() || '';

        return this.reservations
            .filter(reservation => {
                return statusFilter === '전체' || reservation.status === statusFilter;
            })
            .filter(reservation => {
                if (!keyword) return true;

                return [
                    reservation.name,
                    reservation.phone,
                    reservation.site,
                    reservation.reservation_date,
                    reservation.car
                ].join(' ').toLowerCase().includes(keyword);
            });
    },

    getStatusClass(status) {
        if (status === '예약완료') return 'complete';
        if (status === '취소됨' || status === '자동취소') return 'cancel';
        return 'waiting';
    },

    getDeadlineText(reservation) {
        if (reservation.status !== '결제대기' || !reservation.expires_at) return '';

        const remain = new Date(reservation.expires_at).getTime() - Date.now();

        if (remain <= 0) return '입금마감 지남';

        const minutes = Math.floor(remain / 60000);
        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;

        return `${hours}시간 ${restMinutes}분 남음`;
    },

    renderStats() {
        const waitingCount = this.reservations.filter(item => item.status === '결제대기').length;
        const completeCount = this.reservations.filter(item => item.status === '예약완료').length;

        const totalElement = document.getElementById('reservation-total-count');
        const waitingElement = document.getElementById('reservation-waiting-count');
        const completeElement = document.getElementById('reservation-complete-count');

        if (totalElement) totalElement.innerText = String(this.reservations.length);
        if (waitingElement) waitingElement.innerText = String(waitingCount);
        if (completeElement) completeElement.innerText = String(completeCount);
    },

    render() {
        const listBody = document.getElementById('admin-reservation-list');

        if (!listBody) return;

        this.renderStats();

        const reservations = this.getFilteredReservations();

        if (!reservations.length) {
            listBody.innerHTML = '<tr><td colspan="11">예약 내역이 없습니다.</td></tr>';
            return;
        }

        listBody.innerHTML = reservations.map((reservation, index) => {
            const deadlineText = this.getDeadlineText(reservation);
            const safeId = WolchonUtils.escapeHtml(reservation.id);

            return `
                <tr>
                    <td>${reservations.length - index}</td>
                    <td>
                        <span class="admin-status ${this.getStatusClass(reservation.status)}">
                            ${WolchonUtils.escapeHtml(reservation.status || '결제대기')}
                        </span>
                        ${deadlineText ? `<div class="admin-deadline">${WolchonUtils.escapeHtml(deadlineText)}</div>` : ''}
                    </td>
                    <td>${WolchonUtils.escapeHtml(reservation.name)}</td>
                    <td>${WolchonUtils.escapeHtml(reservation.phone)}</td>
                    <td class="left">${WolchonUtils.escapeHtml(reservation.reservation_date)}</td>
                    <td>${WolchonUtils.escapeHtml(reservation.site)}</td>
                    <td>${WolchonUtils.escapeHtml(`${reservation.people}명`)}</td>
                    <td>${WolchonUtils.escapeHtml(WolchonUtils.formatPrice(reservation.price))}</td>
                    <td>${WolchonUtils.escapeHtml(reservation.car || '차량없음')}</td>
                    <td class="left">
                        ${reservation.request
                    ? WolchonUtils.escapeHtml(reservation.request)
                    : '<span style="color:#aaa;">-</span>'}
                    </td>
                    <td>
                        <div class="admin-action-col">
                            <button
                                type="button"
                                class="mini-btn complete"
                                onclick="window.ReservationAdmin.updateStatus('${safeId}', '예약완료')">
                                예약완료
                            </button>
                            <button
                                type="button"
                                class="mini-btn waiting"
                                onclick="window.ReservationAdmin.updateStatus('${safeId}', '결제대기')">
                                대기
                            </button>
                            <button
                                type="button"
                                class="mini-btn cancel"
                                onclick="window.ReservationAdmin.cancelReservation('${safeId}')">
                                취소
                            </button>
                            <button
                                type="button"
                                class="mini-btn delete"
                                onclick="window.ReservationAdmin.deleteReservation('${safeId}')">
                                삭제
                            </button>
                        </div>
                        <div class="admin-small-date">
                            신청: ${WolchonUtils.escapeHtml(WolchonUtils.formatDateTime(reservation.created_at))}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    async updateStatus(id, newStatus) {
        try {
            const client = WolchonUtils.getClient();

            const { error } = await client
                .from('reservations')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            alert(`예약 상태가 '${newStatus}'로 변경되었습니다.`);
            await this.refresh();
        } catch (error) {
            console.error('예약 상태 변경 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async cancelReservation(id) {
        const reservation = this.reservations.find(item => item.id === id);

        if (!reservation) {
            alert('예약 정보를 찾을 수 없습니다.');
            return;
        }

        if (!confirm(`${reservation.reservation_date} [${reservation.site}] 예약을 취소 처리하시겠습니까?`)) {
            return;
        }

        await this.updateStatus(id, '취소됨');
    },

    async deleteReservation(id) {
        const reservation = this.reservations.find(item => item.id === id);

        if (!reservation) {
            alert('예약 정보를 찾을 수 없습니다.');
            return;
        }

        if (!confirm(`${reservation.reservation_date} [${reservation.site}] 예약 기록을 완전히 삭제하시겠습니까?`)) {
            return;
        }

        try {
            const client = WolchonUtils.getClient();

            const { error } = await client
                .from('reservations')
                .delete()
                .eq('id', id);

            if (error) throw error;

            alert('예약 기록이 삭제되었습니다.');
            await this.refresh();
        } catch (error) {
            console.error('예약 삭제 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async cleanExpiredReservations() {
        try {
            const client = WolchonUtils.getClient();

            const { data, error } = await client.rpc('admin_cancel_expired_reservations');

            if (error) throw error;

            alert(`${Number(data || 0)}건의 결제대기 예약을 자동취소 처리했습니다.`);
            await this.refresh();
        } catch (error) {
            console.error('자동취소 처리 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async clearCancelledReservations() {
        if (!confirm('취소됨/자동취소 상태의 예약 기록을 삭제하시겠습니까?')) {
            return;
        }

        try {
            const client = WolchonUtils.getClient();

            const { error } = await client
                .from('reservations')
                .delete()
                .in('status', ['취소됨', '자동취소']);

            if (error) throw error;

            alert('취소된 예약 기록을 삭제했습니다.');
            await this.refresh();
        } catch (error) {
            console.error('취소 예약 정리 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    },

    async clearAllReservations() {
        const firstConfirm = confirm('정말 모든 예약 데이터를 삭제하시겠습니까?');

        if (!firstConfirm) return;

        const input = prompt('전체 삭제를 진행하려면 "전체삭제"를 입력해 주세요.');

        if (input !== '전체삭제') {
            alert('전체 삭제가 취소되었습니다.');
            return;
        }

        try {
            const client = WolchonUtils.getClient();

            const { error } = await client.rpc('admin_clear_all_reservations');

            if (error) throw error;

            alert('모든 예약 데이터가 삭제되었습니다.');
            await this.refresh();
        } catch (error) {
            console.error('전체 예약 삭제 오류:', error);
            alert(WolchonUtils.getFriendlyError(error));
        }
    }
};

/* ==========================================
   선택 사항: 시설 정보를 DB로 표시할 때만 실행
   - 정적 facility.html을 사용하면 이 부분은 실행되지 않습니다.
   ========================================== */

const FacilityManager = {
    async init() {
        const target = document.getElementById('facility-list');

        if (!target) return;

        try {
            const client = WolchonUtils.getClient();

            const { data, error } = await client
                .from('facilities')
                .select('id, title, description, image_path, sort_order, is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (error) throw error;

            if (!data?.length) {
                target.innerHTML = '<div style="grid-column:1 / -1; padding:50px; text-align:center;">등록된 시설 정보가 없습니다.</div>';
                return;
            }

            target.innerHTML = data.map(facility => `
                <div class="facility-card" style="background:var(--white); border-radius:15px; overflow:hidden; box-shadow:0 5px 15px rgba(0,0,0,0.05);">
                    <div
                        style="width:100%; height:380px; background:url('${WolchonUtils.escapeHtml(facility.image_path)}') no-repeat center/cover; border-radius:15px;">
                    </div>
                    <div style="padding:25px;">
                        <h3 style="color:var(--primary); margin-bottom:10px;">
                            ${WolchonUtils.escapeHtml(facility.title)}
                        </h3>
                        <p style="font-size:14px; color:var(--text-light); line-height:1.6; white-space:pre-wrap;">
                            ${WolchonUtils.escapeHtml(facility.description || '')}
                        </p>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('시설 정보 조회 오류:', error);
            target.innerHTML = '<div style="grid-column:1 / -1; padding:50px; text-align:center;">시설 정보를 불러오지 못했습니다.</div>';
        }
    }
};

/* ==========================================
   초기 실행
   ========================================== */

document.addEventListener('DOMContentLoaded', async function () {
    CampingUI.init();

    const adminAllowed = await WolchonUtils.ensureAdmin();

    if (!adminAllowed) return;

    const tasks = [
        window.NoticeManager.init(),
        window.QnaManager.init(),
        window.FaqManager.init(),
        ResManager.init(),
        window.ReservationAdmin.init(),
        FacilityManager.init()
    ];

    const results = await Promise.allSettled(tasks);

    results.forEach(result => {
        if (result.status === 'rejected') {
            console.error('페이지 기능 실행 오류:', result.reason);
        }
    });
});
