<?php
declare(strict_types=1);
// Run: php tests/pricing.test.php. Does not connect to the database.
require __DIR__ . '/../api/bootstrap.php';
$cases = json_decode(file_get_contents(__DIR__ . '/pricing-cases.json'), true, 512, JSON_THROW_ON_ERROR);
foreach ($cases as $case) {
    $actual = calculate_stay_price(parse_date($case['start']), parse_date($case['end']));
    if ($actual !== $case['expected']) {
        throw new RuntimeException($case['name'] . ': expected ' . $case['expected'] . ', got ' . $actual);
    }
}
echo 'PASS: ' . count($cases) . " server stay ranges\n";
