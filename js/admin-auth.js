/* ==========================================
   월촌캠핑장 관리자 인증
   - 가비아 PHP 세션 이메일/비밀번호 로그인
   - 가비아 MySQL admins 등록 사용자만 관리자 허용
   ========================================== */

window.AdminAuth = {
    _adminPromise: null,

    getPageName() {
        return location.pathname.split('/').pop() || 'index.html';
    },

    getClient() {
        if (!window.supabaseClient) {
            throw new Error('SERVER_API_NOT_CONFIGURED');
        }

        return window.supabaseClient;
    },

    showLoginMessage(message) {
        const target = document.getElementById('admin-login-message');

        if (!target) {
            alert(message);
            return;
        }

        target.textContent = message;
        target.style.display = 'block';
    },

    async getCurrentAdmin() {
        const client = this.getClient();

        // getUser()로 현재 로그인 사용자를 서버에서 확인합니다.
        const { data: userData, error: userError } = await client.auth.getUser();

        if (userError || !userData?.user) {
            return null;
        }

        const { data: profile, error: profileError } = await client
            .from('admin_profiles')
            .select('user_id, display_name')
            .eq('user_id', userData.user.id)
            .maybeSingle();

        if (profileError || !profile) {
            return null;
        }

        return {
            user: userData.user,
            profile
        };
    },

    async requireAdmin() {
        if (this._adminPromise) {
            return this._adminPromise;
        }

        this._adminPromise = (async () => {
            try {
                const admin = await this.getCurrentAdmin();

                if (!admin) {
                    if (this.getPageName() !== 'admin_login.html') {
                        location.replace('admin_login.html');
                    }

                    return false;
                }

                return true;
            } catch (error) {
                console.error('관리자 인증 확인 오류:', error);

                if (this.getPageName() !== 'admin_login.html') {
                    location.replace('admin_login.html');
                } else {
                    this.showLoginMessage(
                        error.message === 'SERVER_API_NOT_CONFIGURED'
                            ? '가비아 서버 API 연결 설정이 아직 필요합니다.'
                            : '관리자 인증 정보를 확인하지 못했습니다.'
                    );
                }

                return false;
            }
        })();

        const result = await this._adminPromise;

        if (!result) {
            this._adminPromise = null;
        }

        return result;
    },

    async handleLoginPage() {
        const form = document.getElementById('admin-login-form');
        const button = document.getElementById('admin-login-button');

        if (!form) return;

        try {
            const admin = await this.getCurrentAdmin();

            if (admin) {
                location.replace('admin_dashboard.html');
                return;
            }
        } catch (error) {
            if (error.message === 'SERVER_API_NOT_CONFIGURED') {
                this.showLoginMessage('가비아 서버 API 연결 설정이 아직 필요합니다.');
            }
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const email = document.getElementById('admin-email')?.value.trim() || '';
            const password = document.getElementById('admin-password')?.value || '';

            if (!email || !password) {
                this.showLoginMessage('이메일과 비밀번호를 모두 입력해 주세요.');
                return;
            }

            if (button) {
                button.disabled = true;
                button.textContent = '로그인 중...';
            }

            try {
                const client = this.getClient();

                const { data, error } = await client.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) {
                    throw error;
                }

                const { data: profile, error: profileError } = await client
                    .from('admin_profiles')
                    .select('user_id')
                    .eq('user_id', data.user.id)
                    .maybeSingle();

                if (profileError || !profile) {
                    await client.auth.signOut();
                    throw new Error('ADMIN_PERMISSION_REQUIRED');
                }

                location.replace('admin_dashboard.html');
            } catch (error) {
                console.error('관리자 로그인 오류:', error);

                if (error.message === 'SERVER_API_NOT_CONFIGURED') {
                    this.showLoginMessage('api/config.php의 DB 연결 정보를 먼저 입력해 주세요.');
                } else if (error.message === 'ADMIN_PERMISSION_REQUIRED') {
                    this.showLoginMessage('관리자 권한이 등록되지 않은 계정입니다.');
                } else {
                    this.showLoginMessage('이메일 또는 비밀번호가 올바르지 않습니다.');
                }
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = '로그인';
                }
            }
        });
    },

    async logout() {
        try {
            const client = this.getClient();
            await client.auth.signOut();
        } catch (error) {
            console.error('로그아웃 오류:', error);
        } finally {
            this._adminPromise = null;
            location.replace('admin_login.html');
        }
    },

    async init() {
        const pageName = this.getPageName();
        const isAdminPage = pageName.startsWith('admin_');
        const isLoginPage = pageName === 'admin_login.html';

        if (isLoginPage) {
            await this.handleLoginPage();
            return;
        }

        if (isAdminPage) {
            await this.requireAdmin();
        }
    }
};

document.addEventListener('DOMContentLoaded', function () {
    window.AdminAuth.init();
});
