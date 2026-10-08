<?php
declare(strict_types=1);

// Display numbers may change; retain historical DB/lock keys for existing sites.
const LEGACY_SITE_NUMBERS = [
    '오토1' => '1', '오토2' => '2', '오토3' => '3',
    '오토4' => '10', '오토5' => '11', '오토6' => '12',
    '일반1' => '13', '일반2' => '14', '일반3' => '15',
    '오토7' => '16', '오토8' => '17', '오토9' => '18',
    '오토10' => '21', '오토11' => '24',
];

function site_number(string $site): string
{
    $site = trim($site);
    return LEGACY_SITE_NUMBERS[$site] ?? $site;
}

function site_storage_key(string $site): string
{
    $number = site_number($site);
    if (!preg_match('/\A(?:[1-9]|1[0-9]|2[0-4])\z/', $number)) {
        throw new ApiException('INVALID_SITE', '1~24번 중 예약할 구역을 선택해 주세요.', 422);
    }
    $legacy = array_search($number, LEGACY_SITE_NUMBERS, true);
    return $legacy === false ? $number : $legacy;
}

function site_aliases(string $site): array
{
    return array_values(array_unique([site_storage_key($site), site_number($site)]));
}

function numbered_site_rows(array $rows): array
{
    foreach ($rows as &$row) {
        if (isset($row['site'])) {
            $row['site'] = site_number((string)$row['site']);
        }
    }
    unset($row);
    return $rows;
}
