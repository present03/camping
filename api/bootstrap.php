<?php
declare(strict_types=1);

final class ApiException extends RuntimeException
{
    public function __construct(
        public readonly string $apiCode,
        string $message,
        public readonly int $httpStatus = 400
    ) {
        parent::__construct($message);
    }
}

$config = require __DIR__ . '/config.php';

date_default_timezone_set((string)($config['timezone'] ?? 'Asia/Seoul'));

$isHttps = (
    (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') ||
    strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https'
);

session_name('wolchon_admin_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function app_config(?string $key = null): mixed
{
    global $config;

    return $key === null ? $config : ($config[$key] ?? null);
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $password = (string)app_config('db_password');

    if ($password === '' || str_starts_with($password, 'CHANGE_THIS_')) {
        throw new ApiException(
            'DB_NOT_CONFIGURED',
            'api/config.php에 가비아 DB 비밀번호를 입력해 주세요.',
            500
        );
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        (string)app_config('db_host'),
        (int)app_config('db_port'),
        (string)app_config('db_name')
    );

    try {
        $pdo = new PDO(
            $dsn,
            (string)app_config('db_user'),
            $password,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
            ]
        );

        // DB의 CURRENT_TIMESTAMP가 한국 시간으로 동작하도록 연결별 시간대를 맞춥니다.
        $pdo->exec("SET time_zone = '+09:00'");
    } catch (PDOException $error) {
        error_log('[Wolchon DB connection] ' . $error->getMessage());

        throw new ApiException(
            'DB_CONNECTION_FAILED',
            'DB 연결에 실패했습니다. 가비아 DB 주소·이름·아이디·비밀번호를 확인해 주세요.',
            500
        );
    }

    return $pdo;
}

function json_input(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === false || trim($raw) === '') {
        return [];
    }

    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new ApiException('INVALID_JSON', '요청 데이터 형식이 올바르지 않습니다.', 400);
    }

    if (!is_array($data)) {
        throw new ApiException('INVALID_JSON', '요청 데이터 형식이 올바르지 않습니다.', 400);
    }

    return $data;
}

function json_response(mixed $data = null, int $status = 200, array $extra = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');

    echo json_encode(
        array_merge(['ok' => true, 'data' => $data], $extra),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function json_error(ApiException $error): never
{
    http_response_code($error->httpStatus);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('X-Content-Type-Options: nosniff');

    echo json_encode([
        'ok' => false,
        'error' => [
            'code' => $error->apiCode,
            'message' => $error->getMessage(),
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function assert_same_origin(): void
{
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));

    if ($origin === '') {
        return;
    }

    $originHost = strtolower((string)parse_url($origin, PHP_URL_HOST));
    $requestHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $requestHost = explode(':', $requestHost, 2)[0];

    if ($originHost === '' || !hash_equals($requestHost, $originHost)) {
        throw new ApiException('INVALID_ORIGIN', '허용되지 않은 요청 출처입니다.', 403);
    }
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function require_csrf(): void
{
    $sent = trim((string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
    $stored = (string)($_SESSION['csrf_token'] ?? '');

    if ($sent === '' || $stored === '' || !hash_equals($stored, $sent)) {
        throw new ApiException('INVALID_CSRF', '보안 토큰이 만료되었습니다. 다시 로그인해 주세요.', 403);
    }
}

function current_admin(bool $required = false): ?array
{
    $adminId = (int)($_SESSION['admin_id'] ?? 0);

    if ($adminId <= 0) {
        if ($required) {
            throw new ApiException('ADMIN_REQUIRED', '관리자 로그인이 필요합니다.', 401);
        }

        return null;
    }

    $statement = db()->prepare(
        'SELECT id, email, display_name, is_active, created_at
         FROM admins
         WHERE id = ? AND is_active = 1
         LIMIT 1'
    );
    $statement->execute([$adminId]);
    $admin = $statement->fetch();

    if (!$admin) {
        unset($_SESSION['admin_id'], $_SESSION['csrf_token']);

        if ($required) {
            throw new ApiException('ADMIN_REQUIRED', '관리자 로그인이 필요합니다.', 401);
        }

        return null;
    }

    return $admin;
}

function require_admin(bool $withCsrf = false): array
{
    $admin = current_admin(true);

    if ($withCsrf) {
        require_csrf();
    }

    return $admin;
}

function text_length(string $text): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($text, 'UTF-8')
        : strlen($text);
}

function normalize_text(mixed $value, int $maxLength, string $code, bool $allowEmpty = false): string
{
    $text = trim((string)$value);
    $length = text_length($text);

    if ((!$allowEmpty && $length < 1) || $length > $maxLength) {
        throw new ApiException($code, '입력값의 길이가 올바르지 않습니다.', 422);
    }

    return $text;
}

function normalize_bool(mixed $value): int
{
    return filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
}

function parse_date(string $value, string $code = 'INVALID_DATE'): DateTimeImmutable
{
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    $errors = DateTimeImmutable::getLastErrors();

    if (
        !$date ||
        ($errors !== false && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) ||
        $date->format('Y-m-d') !== $value
    ) {
        throw new ApiException($code, '날짜 형식이 올바르지 않습니다.', 422);
    }

    return $date;
}

function calculate_stay_price(DateTimeImmutable $start, DateTimeImmutable $end): int
{
    $total = 0;
    // 입실일부터 퇴실 전날까지: 월~목 35,000원, 금~일 50,000원.
    for ($date = $start; $date < $end; $date = $date->modify('+1 day')) {
        $total += (int)$date->format('N') <= 4 ? 35000 : 50000;
    }
    return $total;
}

function mysql_datetime(mixed $value): string
{
    if ($value === null || trim((string)$value) === '') {
        return date('Y-m-d H:i:s');
    }

    try {
        return (new DateTimeImmutable((string)$value))
            ->setTimezone(new DateTimeZone((string)app_config('timezone')))
            ->format('Y-m-d H:i:s');
    } catch (Throwable) {
        return date('Y-m-d H:i:s');
    }
}

function uuid_v4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function public_request_cooldown(string $key, int $seconds): void
{
    $sessionKey = 'cooldown_' . preg_replace('/[^a-z0-9_\-]/i', '_', $key);
    $last = (int)($_SESSION[$sessionKey] ?? 0);
    $now = time();

    if ($last > 0 && ($now - $last) < $seconds) {
        throw new ApiException('TOO_MANY_REQUESTS', '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    $_SESSION[$sessionKey] = $now;
}
