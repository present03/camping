<?php
declare(strict_types=1);
require __DIR__ . '/maintenance.php';

$page = (string)($_GET['page'] ?? 'index.html');
if (!preg_match('/\A(?!admin_|naver)[A-Za-z0-9_-]+\.html\z/', $page) ||
    !is_file(dirname(__DIR__) . '/' . $page)) {
    http_response_code(404);
    exit('Not found');
}
header('Cache-Control: no-store');
header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
try {
    $state = maintenance_read();
} catch (Throwable $error) {
    error_log('[Wolchon maintenance] ' . $error->getMessage());
    $state = ['enabled' => true, 'expected_end' => null];
}
if (!$state['enabled']) {
    readfile(dirname(__DIR__) . '/' . $page);
    exit;
}
http_response_code(503);
header('Retry-After: 60');
require __DIR__ . '/maintenance-view.php';
