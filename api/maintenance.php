<?php
declare(strict_types=1);

// Runtime state stays on the hosting server; no database migration is needed.
function maintenance_path(): string
{
    return __DIR__ . '/runtime/maintenance.json';
}

function maintenance_read(?string $path = null): array
{
    $path ??= maintenance_path();
    if (!file_exists($path)) {
        return ['enabled' => false, 'expected_end' => null];
    }
    $file = fopen($path, 'rb');
    if ($file === false) {
        throw new RuntimeException('Cannot read maintenance state');
    }
    try {
        if (!flock($file, LOCK_SH)) {
            throw new RuntimeException('Cannot lock maintenance state');
        }
        $state = json_decode(stream_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($state) || !isset($state['enabled']) || !is_bool($state['enabled'])) {
            throw new RuntimeException('Invalid maintenance state');
        }
        $end = $state['expected_end'] ?? null;
        if ($end !== null && (!is_string($end) ||
            !preg_match('/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00\z/', $end))) {
            throw new RuntimeException('Invalid maintenance end time');
        }
        return ['enabled' => $state['enabled'], 'expected_end' => $end];
    } finally {
        fclose($file);
    }
}

function maintenance_write(bool $enabled, ?string $expectedEnd, ?string $path = null): array
{
    $state = ['enabled' => $enabled, 'expected_end' => $enabled ? $expectedEnd : null];
    $json = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $path ??= maintenance_path();
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('Cannot create maintenance directory');
    }
    $file = fopen($path, 'c+b');
    if ($file === false) {
        throw new RuntimeException('Cannot write maintenance state');
    }
    try {
        if (!flock($file, LOCK_EX) || !ftruncate($file, 0) ||
            fwrite($file, $json) !== strlen($json) || !fflush($file)) {
            throw new RuntimeException('Cannot save maintenance state');
        }
    } finally {
        fclose($file);
    }
    return $state;
}

function maintenance_expected_end(string $value): string
{
    $zone = new DateTimeZone('Asia/Seoul');
    $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $value, $zone);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && ($errors['warning_count'] || $errors['error_count'])) ||
        $date->format('Y-m-d\TH:i') !== $value || $date <= new DateTimeImmutable('now', $zone)) {
        throw new InvalidArgumentException('예상 종료 시간을 현재보다 이후로 입력해 주세요. (한국 시간)');
    }
    return $date->format(DATE_ATOM);
}
