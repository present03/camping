<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

header('X-Frame-Options: SAMEORIGIN');

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['health'])) {
        db()->query('SELECT 1')->fetchColumn();
        json_response([
            'service' => 'wolchon-gabia-api',
            'database' => 'connected',
            'time' => date(DATE_ATOM),
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new ApiException('METHOD_NOT_ALLOWED', 'POST 요청만 허용됩니다.', 405);
    }

    assert_same_origin();
    $input = json_input();
    $action = (string)($input['action'] ?? '');

    match ($action) {
        'auth' => handle_auth($input),
        'query' => handle_query($input),
        'rpc' => handle_rpc($input),
        default => throw new ApiException('INVALID_ACTION', '알 수 없는 API 요청입니다.', 400),
    };
} catch (ApiException $error) {
    json_error($error);
} catch (Throwable $error) {
    error_log('[Wolchon API] ' . $error->getMessage() . "\n" . $error->getTraceAsString());
    json_error(new ApiException(
        'SERVER_ERROR',
        '서버 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        500
    ));
}

function handle_auth(array $input): never
{
    $method = (string)($input['method'] ?? '');

    if ($method === 'current') {
        $admin = current_admin(false);

        json_response([
            'user' => $admin ? [
                'id' => (string)$admin['id'],
                'email' => $admin['email'],
            ] : null,
        ], 200, [
            'csrf_token' => $admin ? csrf_token() : null,
        ]);
    }

    if ($method === 'login') {
        public_request_cooldown('admin_login', 1);

        $email = strtolower(normalize_text($input['email'] ?? '', 190, 'INVALID_EMAIL'));
        $password = (string)($input['password'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            throw new ApiException('INVALID_LOGIN', '이메일 또는 비밀번호가 올바르지 않습니다.', 401);
        }

        $statement = db()->prepare(
            'SELECT id, email, password_hash, display_name, is_active
             FROM admins
             WHERE email = ?
             LIMIT 1'
        );
        $statement->execute([$email]);
        $admin = $statement->fetch();

        if (!$admin || !(bool)$admin['is_active'] || !password_verify($password, (string)$admin['password_hash'])) {
            throw new ApiException('INVALID_LOGIN', '이메일 또는 비밀번호가 올바르지 않습니다.', 401);
        }

        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int)$admin['id'];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

        json_response([
            'user' => [
                'id' => (string)$admin['id'],
                'email' => $admin['email'],
            ],
        ], 200, [
            'csrf_token' => $_SESSION['csrf_token'],
        ]);
    }

    if ($method === 'logout') {
        if (current_admin(false)) {
            require_csrf();
        }

        $_SESSION = [];

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, [
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => 'Lax',
            ]);
        }

        session_destroy();
        json_response(true);
    }

    throw new ApiException('INVALID_AUTH_METHOD', '알 수 없는 인증 요청입니다.', 400);
}

function table_rules(): array
{
    return [
        'notices' => [
            'primary' => 'id',
            'public_select' => true,
            'select' => ['id', 'title', 'content', 'author', 'is_fixed', 'created_at'],
            'write' => ['title', 'content', 'author', 'is_fixed'],
        ],
        'faqs' => [
            'primary' => 'id',
            'public_select' => true,
            'select' => ['id', 'question', 'answer', 'sort_order', 'created_at'],
            'write' => ['question', 'answer', 'sort_order'],
        ],
        'qna_posts' => [
            'primary' => 'id',
            'public_select' => false,
            'select' => [
                'id', 'title', 'name', 'phone', 'content', 'status',
                'reply_content', 'reply_date', 'created_at', 'updated_at',
            ],
            'write' => ['status', 'reply_content', 'reply_date'],
        ],
        'reservations' => [
            'primary' => 'id',
            'public_select' => false,
            'select' => [
                'id', 'name', 'phone', 'car', 'people', 'request',
                'reservation_date', 'reservation_start', 'reservation_end',
                'site', 'price', 'status', 'created_at', 'expires_at',
            ],
            'write' => ['status'],
        ],
        'facilities' => [
            'primary' => 'id',
            'public_select' => true,
            'select' => [
                'id', 'slug', 'title', 'description', 'image_path',
                'sort_order', 'is_active', 'created_at',
            ],
            'write' => ['slug', 'title', 'description', 'image_path', 'sort_order', 'is_active'],
        ],
    ];
}

function handle_query(array $input): never
{
    $table = (string)($input['table'] ?? '');
    $operation = (string)($input['operation'] ?? 'select');

    if ($table === 'admin_profiles') {
        handle_admin_profile_query($input);
    }

    $rules = table_rules();

    if (!isset($rules[$table])) {
        throw new ApiException('INVALID_TABLE', '허용되지 않은 테이블입니다.', 400);
    }

    $rule = $rules[$table];
    $isAdmin = current_admin(false) !== null;

    if ($operation === 'select') {
        if (!$rule['public_select'] && !$isAdmin) {
            throw new ApiException('ADMIN_REQUIRED', '관리자 로그인이 필요합니다.', 401);
        }

        select_query($table, $rule, $input, $isAdmin);
    }

    require_admin(true);

    match ($operation) {
        'insert' => insert_query($table, $rule, $input),
        'update' => update_query($table, $rule, $input),
        'delete' => delete_query($table, $rule, $input),
        default => throw new ApiException('INVALID_OPERATION', '허용되지 않은 DB 작업입니다.', 400),
    };
}

function handle_admin_profile_query(array $input): never
{
    $admin = require_admin(false);
    $filters = is_array($input['filters'] ?? null) ? $input['filters'] : [];

    foreach ($filters as $filter) {
        if (($filter['column'] ?? '') === 'user_id' && (string)($filter['value'] ?? '') !== (string)$admin['id']) {
            json_response(null);
        }
    }

    $row = [
        'user_id' => (string)$admin['id'],
        'display_name' => $admin['display_name'],
    ];

    json_response($row);
}

function requested_columns(string $columns, array $allowed): array
{
    $columns = trim($columns);

    if ($columns === '' || $columns === '*') {
        return $allowed;
    }

    $requested = array_values(array_filter(array_map('trim', explode(',', $columns))));

    if (!$requested) {
        return $allowed;
    }

    foreach ($requested as $column) {
        if (!in_array($column, $allowed, true)) {
            throw new ApiException('INVALID_COLUMN', '허용되지 않은 열을 요청했습니다.', 400);
        }
    }

    return $requested;
}

function build_where(array $filters, array $allowedColumns, array &$params): string
{
    $clauses = [];

    foreach ($filters as $filter) {
        if (!is_array($filter)) {
            continue;
        }

        $column = (string)($filter['column'] ?? '');
        $operator = (string)($filter['operator'] ?? 'eq');
        $value = $filter['value'] ?? null;

        if (!in_array($column, $allowedColumns, true)) {
            throw new ApiException('INVALID_FILTER', '허용되지 않은 검색 조건입니다.', 400);
        }

        $quoted = '`' . $column . '`';

        switch ($operator) {
            case 'eq':
                if ($value === null) {
                    $clauses[] = "$quoted IS NULL";
                } else {
                    $clauses[] = "$quoted = ?";
                    $params[] = $value;
                }
                break;

            case 'neq':
                if ($value === null) {
                    $clauses[] = "$quoted IS NOT NULL";
                } else {
                    $clauses[] = "$quoted <> ?";
                    $params[] = $value;
                }
                break;

            case 'in':
                if (!is_array($value) || $value === []) {
                    $clauses[] = '1 = 0';
                    break;
                }

                $placeholders = implode(',', array_fill(0, count($value), '?'));
                $clauses[] = "$quoted IN ($placeholders)";
                array_push($params, ...array_values($value));
                break;

            case 'gt':
            case 'gte':
            case 'lt':
            case 'lte':
                $symbols = ['gt' => '>', 'gte' => '>=', 'lt' => '<', 'lte' => '<='];
                $clauses[] = "$quoted {$symbols[$operator]} ?";
                $params[] = $value;
                break;

            case 'is':
                if ($value === null) {
                    $clauses[] = "$quoted IS NULL";
                } else {
                    $clauses[] = "$quoted = ?";
                    $params[] = $value;
                }
                break;

            default:
                throw new ApiException('INVALID_FILTER', '지원하지 않는 검색 조건입니다.', 400);
        }
    }

    return $clauses ? ' WHERE ' . implode(' AND ', $clauses) : '';
}

function select_query(string $table, array $rule, array $input, bool $isAdmin): never
{
    $columns = requested_columns((string)($input['columns'] ?? '*'), $rule['select']);
    $filters = is_array($input['filters'] ?? null) ? $input['filters'] : [];

    if ($table === 'facilities' && !$isAdmin) {
        $filters[] = ['column' => 'is_active', 'operator' => 'eq', 'value' => 1];
    }

    $params = [];
    $where = build_where($filters, $rule['select'], $params);
    $options = is_array($input['select_options'] ?? null) ? $input['select_options'] : [];
    $countRequested = (($options['count'] ?? null) === 'exact');
    $headOnly = (bool)($options['head'] ?? false);
    $count = null;

    if ($countRequested) {
        $countStatement = db()->prepare("SELECT COUNT(*) FROM `$table`$where");
        $countStatement->execute($params);
        $count = (int)$countStatement->fetchColumn();

        if ($headOnly) {
            json_response(null, 200, ['count' => $count]);
        }
    }

    $orderSql = '';
    $orders = is_array($input['orders'] ?? null) ? $input['orders'] : [];
    $orderParts = [];

    foreach ($orders as $order) {
        if (!is_array($order)) {
            continue;
        }

        $column = (string)($order['column'] ?? '');

        if (!in_array($column, $rule['select'], true)) {
            throw new ApiException('INVALID_ORDER', '허용되지 않은 정렬 조건입니다.', 400);
        }

        $direction = !empty($order['ascending']) ? 'ASC' : 'DESC';
        $orderParts[] = "`$column` $direction";
    }

    if ($orderParts) {
        $orderSql = ' ORDER BY ' . implode(', ', $orderParts);
    }

    $limit = $input['limit'] ?? null;
    $offset = max(0, (int)($input['offset'] ?? 0));
    $limitSql = '';

    if ($limit !== null) {
        $safeLimit = max(1, min(5000, (int)$limit));
        $limitSql = " LIMIT $safeLimit OFFSET $offset";
    }

    $columnSql = implode(', ', array_map(static fn(string $column): string => "`$column`", $columns));
    $statement = db()->prepare("SELECT $columnSql FROM `$table`$where$orderSql$limitSql");
    $statement->execute($params);
    $rows = $statement->fetchAll();

    $singleMode = (string)($input['single_mode'] ?? '');

    if ($singleMode === 'single') {
        if (count($rows) !== 1) {
            throw new ApiException('SINGLE_ROW_REQUIRED', '조회 결과가 정확히 1건이 아닙니다.', 404);
        }

        json_response($rows[0], 200, ['count' => $count]);
    }

    if ($singleMode === 'maybeSingle') {
        if (count($rows) > 1) {
            throw new ApiException('MULTIPLE_ROWS', '조회 결과가 여러 건입니다.', 409);
        }

        json_response($rows[0] ?? null, 200, ['count' => $count]);
    }

    json_response($rows, 200, ['count' => $count]);
}

function normalize_insert_values(string $table, array $values): array
{
    return match ($table) {
        'notices' => [
            'title' => normalize_text($values['title'] ?? '', 200, 'INVALID_TITLE'),
            'content' => normalize_text($values['content'] ?? '', 20000, 'INVALID_CONTENT'),
            'author' => normalize_text($values['author'] ?? '관리자', 50, 'INVALID_AUTHOR'),
            'is_fixed' => normalize_bool($values['is_fixed'] ?? false),
        ],
        'faqs' => [
            'question' => normalize_text($values['question'] ?? '', 300, 'INVALID_QUESTION'),
            'answer' => normalize_text($values['answer'] ?? '', 20000, 'INVALID_ANSWER'),
            'sort_order' => (int)($values['sort_order'] ?? 0),
        ],
        'facilities' => [
            'slug' => normalize_text($values['slug'] ?? '', 100, 'INVALID_SLUG'),
            'title' => normalize_text($values['title'] ?? '', 200, 'INVALID_TITLE'),
            'description' => normalize_text($values['description'] ?? '', 5000, 'INVALID_DESCRIPTION', true),
            'image_path' => normalize_text($values['image_path'] ?? '', 500, 'INVALID_IMAGE_PATH'),
            'sort_order' => (int)($values['sort_order'] ?? 0),
            'is_active' => normalize_bool($values['is_active'] ?? true),
        ],
        default => throw new ApiException('INSERT_NOT_ALLOWED', '해당 테이블에는 직접 등록할 수 없습니다.', 403),
    };
}

function insert_query(string $table, array $rule, array $input): never
{
    $rawValues = $input['values'] ?? null;

    if (!is_array($rawValues) || array_is_list($rawValues)) {
        throw new ApiException('INVALID_VALUES', '등록할 데이터 형식이 올바르지 않습니다.', 400);
    }

    $values = normalize_insert_values($table, $rawValues);
    $columns = array_keys($values);
    $placeholders = implode(',', array_fill(0, count($columns), '?'));
    $columnSql = implode(', ', array_map(static fn(string $column): string => "`$column`", $columns));

    $statement = db()->prepare("INSERT INTO `$table` ($columnSql) VALUES ($placeholders)");
    $statement->execute(array_values($values));

    $id = db()->lastInsertId();
    $selectedColumns = requested_columns((string)($input['columns'] ?? '*'), $rule['select']);
    $selectedSql = implode(', ', array_map(static fn(string $column): string => "`$column`", $selectedColumns));
    $select = db()->prepare("SELECT $selectedSql FROM `$table` WHERE `{$rule['primary']}` = ? LIMIT 1");
    $select->execute([$id]);

    json_response($select->fetch() ?: null);
}

function normalize_update_values(string $table, array $values): array
{
    $normalized = [];

    if ($table === 'qna_posts') {
        if (array_key_exists('status', $values)) {
            $status = (string)$values['status'];

            if (!in_array($status, ['답변대기', '답변완료'], true)) {
                throw new ApiException('INVALID_STATUS', '문의 상태가 올바르지 않습니다.', 422);
            }

            $normalized['status'] = $status;
        }

        if (array_key_exists('reply_content', $values)) {
            $normalized['reply_content'] = normalize_text(
                $values['reply_content'],
                10000,
                'INVALID_REPLY',
                true
            );
        }

        if (array_key_exists('reply_date', $values)) {
            $normalized['reply_date'] = mysql_datetime($values['reply_date']);
        }
    } elseif ($table === 'reservations') {
        if (array_key_exists('status', $values)) {
            $status = (string)$values['status'];

            if (!in_array($status, ['결제대기', '예약완료', '취소됨', '자동취소'], true)) {
                throw new ApiException('INVALID_STATUS', '예약 상태가 올바르지 않습니다.', 422);
            }

            $normalized['status'] = $status;
        }
    } elseif ($table === 'notices') {
        if (array_key_exists('title', $values)) {
            $normalized['title'] = normalize_text($values['title'], 200, 'INVALID_TITLE');
        }
        if (array_key_exists('content', $values)) {
            $normalized['content'] = normalize_text($values['content'], 20000, 'INVALID_CONTENT');
        }
        if (array_key_exists('author', $values)) {
            $normalized['author'] = normalize_text($values['author'], 50, 'INVALID_AUTHOR');
        }
        if (array_key_exists('is_fixed', $values)) {
            $normalized['is_fixed'] = normalize_bool($values['is_fixed']);
        }
    } elseif ($table === 'faqs') {
        if (array_key_exists('question', $values)) {
            $normalized['question'] = normalize_text($values['question'], 300, 'INVALID_QUESTION');
        }
        if (array_key_exists('answer', $values)) {
            $normalized['answer'] = normalize_text($values['answer'], 20000, 'INVALID_ANSWER');
        }
        if (array_key_exists('sort_order', $values)) {
            $normalized['sort_order'] = (int)$values['sort_order'];
        }
    } elseif ($table === 'facilities') {
        foreach (['slug', 'title', 'description', 'image_path'] as $column) {
            if (array_key_exists($column, $values)) {
                $max = $column === 'description' ? 5000 : ($column === 'image_path' ? 500 : 200);
                $normalized[$column] = normalize_text(
                    $values[$column],
                    $max,
                    'INVALID_' . strtoupper($column),
                    $column === 'description'
                );
            }
        }
        if (array_key_exists('sort_order', $values)) {
            $normalized['sort_order'] = (int)$values['sort_order'];
        }
        if (array_key_exists('is_active', $values)) {
            $normalized['is_active'] = normalize_bool($values['is_active']);
        }
    }

    if ($normalized === []) {
        throw new ApiException('INVALID_VALUES', '수정할 데이터가 없습니다.', 400);
    }

    return $normalized;
}

function update_query(string $table, array $rule, array $input): never
{
    $rawValues = $input['values'] ?? null;
    $filters = is_array($input['filters'] ?? null) ? $input['filters'] : [];

    if (!is_array($rawValues) || array_is_list($rawValues) || $filters === []) {
        throw new ApiException('INVALID_UPDATE', '수정 조건 또는 데이터가 올바르지 않습니다.', 400);
    }

    $values = normalize_update_values($table, $rawValues);
    $params = array_values($values);
    $whereParams = [];
    $where = build_where($filters, $rule['select'], $whereParams);
    $setSql = implode(', ', array_map(static fn(string $column): string => "`$column` = ?", array_keys($values)));

    if ($table === 'qna_posts') {
        $setSql .= ', `updated_at` = CURRENT_TIMESTAMP';
    }

    $statement = db()->prepare("UPDATE `$table` SET $setSql$where");
    $statement->execute(array_merge($params, $whereParams));

    json_response(true);
}

function delete_query(string $table, array $rule, array $input): never
{
    $filters = is_array($input['filters'] ?? null) ? $input['filters'] : [];

    if ($filters === []) {
        throw new ApiException('DELETE_FILTER_REQUIRED', '삭제 조건이 필요합니다.', 400);
    }

    $params = [];
    $where = build_where($filters, $rule['select'], $params);
    $statement = db()->prepare("DELETE FROM `$table`$where");
    $statement->execute($params);

    json_response(true);
}

function handle_rpc(array $input): never
{
    $name = (string)($input['name'] ?? '');
    $params = is_array($input['params'] ?? null) ? $input['params'] : [];

    match ($name) {
        'public_list_qna' => rpc_public_list_qna(),
        'public_get_qna' => rpc_public_get_qna($params),
        'create_qna' => rpc_create_qna($params),
        'delete_qna_with_password' => rpc_delete_qna($params),
        'get_booked_sites' => rpc_get_booked_sites($params),
        'create_reservation' => rpc_create_reservation($params),
        'get_reservation_receipt' => rpc_get_reservation_receipt($params),
        'find_reservations' => rpc_find_reservations($params),
        'cancel_waiting_reservation' => rpc_cancel_waiting_reservation($params),
        'admin_cancel_expired_reservations' => rpc_admin_cancel_expired(),
        'admin_clear_all_reservations' => rpc_admin_clear_all(),
        default => throw new ApiException('INVALID_RPC', '지원하지 않는 기능 요청입니다.', 400),
    };
}

function rpc_public_list_qna(): never
{
    $rows = db()->query(
        'SELECT id, title, name, status, created_at
         FROM qna_posts
         ORDER BY created_at DESC'
    )->fetchAll();

    json_response($rows);
}

function rpc_public_get_qna(array $params): never
{
    $id = (int)($params['p_id'] ?? 0);
    $statement = db()->prepare(
        'SELECT id, title, name, content, status, reply_content, reply_date, created_at, updated_at
         FROM qna_posts
         WHERE id = ?
         LIMIT 1'
    );
    $statement->execute([$id]);
    $row = $statement->fetch();

    json_response($row ? [$row] : []);
}

function rpc_create_qna(array $params): never
{
    public_request_cooldown('create_qna', 3);

    $title = normalize_text($params['p_title'] ?? '', 120, 'INVALID_TITLE');
    $name = normalize_text($params['p_name'] ?? '', 30, 'INVALID_NAME');
    $phone = normalize_text($params['p_phone'] ?? '', 30, 'INVALID_PHONE');
    $password = (string)($params['p_password'] ?? '');
    $content = normalize_text($params['p_content'] ?? '', 3000, 'INVALID_CONTENT');

    if (text_length($phone) < 5) {
        throw new ApiException('INVALID_PHONE', '연락처를 올바르게 입력해 주세요.', 422);
    }

    $passwordLength = text_length($password);

    if ($passwordLength < 4 || $passwordLength > 30) {
        throw new ApiException('INVALID_PASSWORD_LENGTH', '삭제 비밀번호는 4~30자로 입력해 주세요.', 422);
    }

    $statement = db()->prepare(
        'INSERT INTO qna_posts (title, name, phone, password_hash, content)
         VALUES (?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $title,
        $name,
        $phone,
        password_hash($password, PASSWORD_DEFAULT),
        $content,
    ]);

    json_response((int)db()->lastInsertId());
}

function rpc_delete_qna(array $params): never
{
    public_request_cooldown('delete_qna', 1);

    $id = (int)($params['p_id'] ?? 0);
    $password = (string)($params['p_password'] ?? '');
    $statement = db()->prepare('SELECT password_hash FROM qna_posts WHERE id = ? LIMIT 1');
    $statement->execute([$id]);
    $hash = $statement->fetchColumn();

    if (!$hash || !password_verify($password, (string)$hash)) {
        json_response(false);
    }

    $delete = db()->prepare('DELETE FROM qna_posts WHERE id = ?');
    $delete->execute([$id]);
    json_response(true);
}

function auto_cancel_expired(): int
{
    $statement = db()->prepare(
        "UPDATE reservations
         SET status = '자동취소'
         WHERE status = '결제대기' AND expires_at <= NOW()"
    );
    $statement->execute();

    return $statement->rowCount();
}

function rpc_get_booked_sites(array $params): never
{
    $start = parse_date((string)($params['p_start'] ?? ''), 'INVALID_START_DATE');
    $end = parse_date((string)($params['p_end'] ?? ''), 'INVALID_END_DATE');

    if ($end <= $start) {
        throw new ApiException('INVALID_DATE_RANGE', '예약 날짜 범위가 올바르지 않습니다.', 422);
    }

    auto_cancel_expired();

    $statement = db()->prepare(
        "SELECT DISTINCT site
         FROM reservations
         WHERE status IN ('결제대기', '예약완료')
           AND reservation_start < ?
           AND reservation_end > ?"
    );
    $statement->execute([$end->format('Y-m-d'), $start->format('Y-m-d')]);

    json_response($statement->fetchAll());
}

function rpc_create_reservation(array $params): never
{
    public_request_cooldown('create_reservation', 3);

    $name = normalize_text($params['p_name'] ?? '', 30, 'INVALID_NAME');
    $phone = normalize_text($params['p_phone'] ?? '', 30, 'INVALID_PHONE');
    $car = normalize_text($params['p_car'] ?? '', 30, 'INVALID_CAR', true);
    $people = (int)($params['p_people'] ?? 0);
    $optionTotal = (int)($params['p_option_total'] ?? 0);
    $request = normalize_text($params['p_request'] ?? '', 1000, 'INVALID_REQUEST', true);
    $site = normalize_text($params['p_site'] ?? '', 50, 'INVALID_SITE');
    $start = parse_date((string)($params['p_start'] ?? ''), 'INVALID_START_DATE');
    $end = parse_date((string)($params['p_end'] ?? ''), 'INVALID_END_DATE');
    $today = new DateTimeImmutable('today');

    if (text_length($phone) < 5) {
        throw new ApiException('INVALID_PHONE', '연락처를 올바르게 입력해 주세요.', 422);
    }

    if ($people < 1 || $people > 20) {
        throw new ApiException('INVALID_PEOPLE', '이용 인원은 1~20명으로 입력해 주세요.', 422);
    }

    $allowedOptionTotals = [0, 20000];

    if (!in_array($optionTotal, $allowedOptionTotals, true)) {
        throw new ApiException('INVALID_OPTION_PRICE','추가 옵션 금액이 올바르지 않습니다.',422);
    }

    if ($start < $today || $end <= $start) {
        throw new ApiException('INVALID_DATE_RANGE', '예약 날짜 범위가 올바르지 않습니다.', 422);
    }

    $nights = (int)$start->diff($end)->days;

    if ($nights < 1 || $nights > 30) {
        throw new ApiException('TOO_MANY_NIGHTS', '예약은 최대 30박까지 가능합니다.', 422);
    }

    $pdo = db();

    try {
        $pdo->beginTransaction();

        // 같은 구역 예약은 lock 테이블의 한 행을 잠가 순차 처리합니다.
        $lockInsert = $pdo->prepare(
            'INSERT INTO reservation_locks (site) VALUES (?)
             ON DUPLICATE KEY UPDATE site = VALUES(site)'
        );
        $lockInsert->execute([$site]);

        $lockRow = $pdo->prepare(
            'SELECT site FROM reservation_locks WHERE site = ? FOR UPDATE'
        );
        $lockRow->execute([$site]);
        $lockRow->fetchColumn();

        auto_cancel_expired();

        $duplicate = $pdo->prepare(
            "SELECT COUNT(*)
             FROM reservations
             WHERE site = ?
               AND status IN ('결제대기', '예약완료')
               AND reservation_start < ?
               AND reservation_end > ?"
        );
        $duplicate->execute([$site, $end->format('Y-m-d'), $start->format('Y-m-d')]);

        if ((int)$duplicate->fetchColumn() > 0) {
            throw new ApiException('ALREADY_BOOKED', '선택하신 날짜와 구역에 이미 예약이 있습니다.', 409);
        }

        $id = uuid_v4();
        $price = ($nights * 50000) + $optionTotal;
        $expiresAt = (new DateTimeImmutable('+3 hours'))->format('Y-m-d H:i:s');
        $reservationDate = $start->format('Y-m-d') . ' ~ ' . $end->format('Y-m-d');

        $insert = $pdo->prepare(
            'INSERT INTO reservations (
                id, name, phone, car, people, request,
                reservation_start, reservation_end, reservation_date,
                site, price, status, expires_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([
            $id,
            $name,
            $phone,
            $car,
            $people,
            $request,
            $start->format('Y-m-d'),
            $end->format('Y-m-d'),
            $reservationDate,
            $site,
            $price,
            '결제대기',
            $expiresAt,
        ]);

        $pdo->commit();
        json_response($id);
    } catch (ApiException $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function rpc_get_reservation_receipt(array $params): never
{
    $id = normalize_text($params['p_id'] ?? '', 36, 'INVALID_RESERVATION_ID');
    auto_cancel_expired();

    $statement = db()->prepare(
        'SELECT id, reservation_date, site, price, status, expires_at
         FROM reservations
         WHERE id = ?
         LIMIT 1'
    );
    $statement->execute([$id]);
    $row = $statement->fetch();

    json_response($row ? [$row] : []);
}

function rpc_find_reservations(array $params): never
{
    public_request_cooldown('find_reservations', 1);

    $name = normalize_text($params['p_name'] ?? '', 30, 'INVALID_NAME');
    $phone = normalize_text($params['p_phone'] ?? '', 30, 'INVALID_PHONE');
    auto_cancel_expired();

    $statement = db()->prepare(
        'SELECT id, reservation_date, site, car, people, price, status, expires_at, created_at
         FROM reservations
         WHERE name = ? AND phone = ?
         ORDER BY created_at DESC'
    );
    $statement->execute([$name, $phone]);

    json_response($statement->fetchAll());
}

function rpc_cancel_waiting_reservation(array $params): never
{
    public_request_cooldown('cancel_reservation', 1);

    $id = normalize_text($params['p_id'] ?? '', 36, 'INVALID_RESERVATION_ID');
    $name = normalize_text($params['p_name'] ?? '', 30, 'INVALID_NAME');
    $phone = normalize_text($params['p_phone'] ?? '', 30, 'INVALID_PHONE');

    $statement = db()->prepare(
        "UPDATE reservations
         SET status = '취소됨'
         WHERE id = ? AND name = ? AND phone = ? AND status = '결제대기'"
    );
    $statement->execute([$id, $name, $phone]);

    json_response($statement->rowCount() === 1);
}

function rpc_admin_cancel_expired(): never
{
    require_admin(true);
    json_response(auto_cancel_expired());
}

function rpc_admin_clear_all(): never
{
    require_admin(true);
    db()->exec('DELETE FROM reservations');
    json_response(true);
}
