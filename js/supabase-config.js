/* ==========================================
   월촌캠핑장 가비아 PHP/MySQL 연결 어댑터
   - 기존 HTML과 main.js의 Supabase식 호출을 그대로 살리기 위해
     동일한 window.supabaseClient 인터페이스를 제공합니다.
   - DB 비밀번호는 이 파일이 아니라 api/config.php에만 입력합니다.
   ========================================== */

(function () {
    'use strict';

    const API_URL = new URL('api/index.php', document.baseURI).toString();
    let csrfToken = null;

    function makeError(payload, fallbackMessage) {
        const error = new Error(payload?.message || fallbackMessage || '서버 요청에 실패했습니다.');
        error.code = payload?.code || 'API_ERROR';
        return error;
    }

    async function request(payload) {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            const response = await fetch(API_URL, {
                method: 'POST',
                credentials: 'same-origin',
                headers,
                body: JSON.stringify(payload)
            });

            let result;

            try {
                result = await response.json();
            } catch (error) {
                return {
                    data: null,
                    count: null,
                    error: makeError(null, '서버 응답을 읽지 못했습니다.')
                };
            }

            if (typeof result?.csrf_token === 'string' && result.csrf_token) {
                csrfToken = result.csrf_token;
            }

            if (!response.ok || result?.ok !== true) {
                return {
                    data: null,
                    count: result?.count ?? null,
                    error: makeError(result?.error, `서버 요청이 실패했습니다. (${response.status})`)
                };
            }

            return {
                data: result.data ?? null,
                count: result.count ?? null,
                error: null
            };
        } catch (error) {
            return {
                data: null,
                count: null,
                error: makeError(error, '서버에 연결하지 못했습니다.')
            };
        }
    }

    class QueryBuilder {
        constructor(table) {
            this.table = table;
            this.operation = 'select';
            this.columns = '*';
            this.selectOptions = {};
            this.values = null;
            this.filters = [];
            this.orders = [];
            this.limitValue = null;
            this.offsetValue = 0;
            this.singleMode = '';
        }

        select(columns = '*', options = {}) {
            this.columns = columns || '*';
            this.selectOptions = options || {};
            return this;
        }

        insert(values) {
            this.operation = 'insert';
            this.values = values;
            return this;
        }

        update(values) {
            this.operation = 'update';
            this.values = values;
            return this;
        }

        delete() {
            this.operation = 'delete';
            return this;
        }

        addFilter(operator, column, value) {
            this.filters.push({ operator, column, value });
            return this;
        }

        eq(column, value) {
            return this.addFilter('eq', column, value);
        }

        neq(column, value) {
            return this.addFilter('neq', column, value);
        }

        gt(column, value) {
            return this.addFilter('gt', column, value);
        }

        gte(column, value) {
            return this.addFilter('gte', column, value);
        }

        lt(column, value) {
            return this.addFilter('lt', column, value);
        }

        lte(column, value) {
            return this.addFilter('lte', column, value);
        }

        is(column, value) {
            return this.addFilter('is', column, value);
        }

        in(column, values) {
            return this.addFilter('in', column, values);
        }

        match(values) {
            Object.entries(values || {}).forEach(([column, value]) => this.eq(column, value));
            return this;
        }

        order(column, options = {}) {
            this.orders.push({
                column,
                ascending: options.ascending !== false
            });
            return this;
        }

        limit(value) {
            this.limitValue = Number(value);
            return this;
        }

        range(from, to) {
            const start = Math.max(0, Number(from) || 0);
            const end = Math.max(start, Number(to) || start);
            this.offsetValue = start;
            this.limitValue = end - start + 1;
            return this;
        }

        single() {
            this.singleMode = 'single';
            return this;
        }

        maybeSingle() {
            this.singleMode = 'maybeSingle';
            return this;
        }

        async execute() {
            return request({
                action: 'query',
                table: this.table,
                operation: this.operation,
                columns: this.columns,
                select_options: this.selectOptions,
                values: this.values,
                filters: this.filters,
                orders: this.orders,
                limit: this.limitValue,
                offset: this.offsetValue,
                single_mode: this.singleMode
            });
        }

        then(resolve, reject) {
            return this.execute().then(resolve, reject);
        }
    }

    window.supabaseClient = {
        from(table) {
            return new QueryBuilder(table);
        },

        rpc(name, params = {}) {
            return request({
                action: 'rpc',
                name,
                params
            });
        },

        auth: {
            getUser() {
                return request({
                    action: 'auth',
                    method: 'current'
                });
            },

            signInWithPassword(credentials = {}) {
                return request({
                    action: 'auth',
                    method: 'login',
                    email: credentials.email || '',
                    password: credentials.password || ''
                });
            },

            async signOut() {
                const result = await request({
                    action: 'auth',
                    method: 'logout'
                });

                csrfToken = null;
                return result;
            }
        }
    };

    window.SupabaseConfig = {
        // 기존 코드 호환용 이름입니다. 실제 연결 대상은 가비아 PHP/MySQL입니다.
        isConfigured: true,
        provider: 'gabia-php-mysql',
        apiUrl: API_URL
    };
})();
