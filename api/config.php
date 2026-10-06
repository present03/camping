<?php
declare(strict_types=1);

/*
 * 월촌캠핑장 가비아 MySQL 연결 설정
 *
 * 중요:
 * - 이 파일은 브라우저용 JavaScript가 아니라 PHP 서버에서만 읽습니다.
 * - db_password와 setup_secret만 실제 값으로 바꿉니다.
 * - DB 비밀번호를 JS/HTML에 입력하지 마세요.
 */

return [
    'db_host' => '211.47.74.49',
    'db_port' => 3306,
    'db_name' => 'dbwolchoncamping',
    'db_user' => 'wolchoncamping',
    'db_password' => 'er!nck92m3#nvhd',

    // 관리자 최초 생성 페이지에서 사용할 임시 보안문구입니다.
    // 영문 대/소문자, 숫자, 특수문자를 섞어 24자 이상으로 바꾸세요.
    'setup_secret' => '!@#WolchonCampingSetupSecretKey1234567890',

    'timezone' => 'Asia/Seoul',
];
