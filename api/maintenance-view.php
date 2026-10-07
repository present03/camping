<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>페이지 점검중입니다 | 월촌캠핑장</title>
    <link rel="stylesheet" href="css/maintenance.css">
    <script src="js/maintenance.js?v=20261008-1" defer></script>
</head>
<body class="maintenance-active">
    <main id="maintenance-screen" class="maintenance-screen" role="status" aria-live="polite">
        <div class="maintenance-card">
            <p class="maintenance-brand">월촌캠핑장</p>
            <h1>페이지 점검중입니다</h1>
            <p>더 나은 서비스를 위해 홈페이지를 업데이트하고 있습니다.<br>잠시 후 다시 방문해 주세요.</p>
            <p id="maintenance-end"><?php
                $end = $state['expected_end'] ?? null;
                echo $end ? '예상 종료: ' . htmlspecialchars(
                    (new DateTimeImmutable($end))->setTimezone(new DateTimeZone('Asia/Seoul'))->format('Y-m-d H:i'),
                    ENT_QUOTES, 'UTF-8'
                ) . ' (한국 시간)' : '종료 시간은 확인 중입니다.';
            ?></p>
            <p>점검 상황에 따라 종료 시간이 달라질 수 있습니다.</p>
            <a href="admin_login.html">관리자 로그인</a>
        </div>
    </main>
</body>
</html>
