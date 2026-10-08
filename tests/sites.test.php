<?php
declare(strict_types=1);
require __DIR__ . '/../api/bootstrap.php';
require __DIR__ . '/../api/sites.php';

$expected = [
    '오토1' => '1', '오토2' => '2', '오토3' => '3',
    '오토4' => '10', '오토5' => '11', '오토6' => '12',
    '일반1' => '13', '일반2' => '14', '일반3' => '15',
    '오토7' => '16', '오토8' => '17', '오토9' => '18', '오토10' => '21', '오토11' => '24',
];
foreach ($expected as $legacy => $number) {
    if (site_number($legacy) !== $number || site_storage_key($number) !== $legacy || site_storage_key($legacy) !== $legacy || site_aliases($number) !== [$legacy, $number]) {
        throw new RuntimeException('Site mapping mismatch: ' . $legacy);
    }
}
foreach (range(1, 24) as $number) {
    if (site_number(site_storage_key((string)$number)) !== (string)$number) {
        throw new RuntimeException('Number round trip failed');
    }
}
foreach (['0', '25', '-1', '01', '1.5', 'A1', '오토12', '일반4', '1 OR 1=1'] as $invalid) {
    try {
        site_storage_key($invalid);
        throw new RuntimeException('Invalid site accepted');
    } catch (ApiException $error) {
        if ($error->apiCode !== 'INVALID_SITE') throw $error;
    }
}
$rows = [['id' => 'old', 'site' => '오토7', 'price' => 50000], ['site' => '19']];
$converted = numbered_site_rows($rows);
if ($rows[0]['site'] !== '오토7' || $converted[0] !== ['id' => 'old', 'site' => '16', 'price' => 50000]) {
    throw new RuntimeException('Display conversion must not rewrite stored rows or prices');
}
echo "PASS: 14 legacy mappings, 24 site round trips, invalid sites, non-mutating display\n";
