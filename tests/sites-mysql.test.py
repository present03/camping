"""Integration test against a disposable local MariaDB socket (never production).

Set SITE_TEST_SOCKET to the temporary server's socket, PHP_BIN/PHP_ARGS and
MYSQL_CLIENT as needed. Creates and removes its own random database/user.
The real API and db() run unchanged; only php://input becomes php://stdin
in the temporary CLI copy. Requires PDO MySQL and CREATE USER privileges on
the disposable server. No operating-site config or data is read.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOCKET = os.environ.get('SITE_TEST_SOCKET', '/tmp/wolchon-sites-db/mysql.sock')
PHP = [os.environ.get('PHP_BIN', 'php'), *shlex.split(os.environ.get('PHP_ARGS', ''))]
CLIENT = os.environ.get('MYSQL_CLIENT', 'mariadb')
MAPPING = {'오토1':'1','오토2':'2','오토3':'3','오토4':'10','오토5':'11','오토6':'12',
           '일반1':'13','일반2':'14','일반3':'15','오토7':'16','오토8':'17','오토9':'18','오토10':'21','오토11':'24'}


class SitesMySQLTest(unittest.TestCase):
    @classmethod
    def root_sql(cls, sql):
        return subprocess.run([CLIENT, '--no-defaults', '--socket=' + SOCKET, '-uroot'], input=sql,
                              text=True, check=True, capture_output=True)

    @classmethod
    def setUpClass(cls):
        if not Path(SOCKET).resolve().is_relative_to('/tmp'):
            raise RuntimeError('Use a disposable test socket under /tmp')
        suffix = uuid.uuid4().hex[:10]
        cls.database = 'wolchon_sites_test_' + suffix
        cls.user = 'wolchon_test_' + suffix
        cls.temp = tempfile.TemporaryDirectory(prefix='wolchon-sites-api-')
        cls.directory = Path(cls.temp.name)
        shutil.copytree(ROOT / 'api', cls.directory / 'api', ignore=shutil.ignore_patterns('config.php', 'maintenance.json'))
        cls.root_sql(f"""
            CREATE DATABASE {cls.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            CREATE USER '{cls.user}'@'localhost' IDENTIFIED BY 'test-only-password';
            GRANT ALL ON {cls.database}.* TO '{cls.user}'@'localhost';
            USE {cls.database};
            CREATE TABLE reservation_locks (site VARCHAR(50) PRIMARY KEY) ENGINE=InnoDB;
            CREATE TABLE reservations (
                id VARCHAR(36) PRIMARY KEY, name VARCHAR(30), phone VARCHAR(30), car VARCHAR(30),
                people INT, request TEXT, reservation_start DATE, reservation_end DATE,
                reservation_date VARCHAR(100), site VARCHAR(50), price INT, status VARCHAR(30),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME
            ) ENGINE=InnoDB;
        """)
        (cls.directory / 'api/config.php').write_text(f"""<?php return [
            'db_host'=>'localhost', 'db_port'=>3306, 'db_name'=>'{cls.database}',
            'db_user'=>'{cls.user}', 'db_password'=>'test-only-password', 'timezone'=>'Asia/Seoul'
        ];""")
        bootstrap = cls.directory / 'api/bootstrap.php'
        bootstrap.write_text(bootstrap.read_text().replace("'php://input'", "'php://stdin'"))
        (cls.directory / 'entry.php').write_text("<?php $_SERVER['REQUEST_METHOD']='POST'; $_SERVER['HTTP_HOST']='localhost'; require __DIR__.'/api/index.php';")
        (cls.directory / 'query.php').write_text("""<?php
            require __DIR__.'/api/bootstrap.php';
            $input = json_decode(file_get_contents('php://stdin'), true);
            $statement = db()->prepare($input['sql']);
            $statement->execute($input['params'] ?? []);
            echo json_encode($statement->fetchAll(), JSON_UNESCAPED_UNICODE);
        """)

    @classmethod
    def tearDownClass(cls):
        cls.root_sql(f"DROP DATABASE {cls.database}; DROP USER '{cls.user}'@'localhost';")
        cls.temp.cleanup()

    def run_php(self, file, payload):
        process = subprocess.run([*PHP, '-d', 'pdo_mysql.default_socket=' + SOCKET,
                                  '-d', 'session.save_path=' + str(self.directory), str(self.directory / file)],
                                 input=json.dumps(payload), text=True, capture_output=True, check=True, timeout=15)
        return json.loads(process.stdout)

    def sql(self, sql, params=None):
        return self.run_php('query.php', {'sql': sql, 'params': params or []})

    def rpc(self, name, params=None):
        return self.run_php('entry.php', {'action': 'rpc', 'name': name, 'params': params or {}})

    def setUp(self):
        self.sql('DELETE FROM reservations')
        self.sql('DELETE FROM reservation_locks')

    def seed(self, site, status='예약완료', start='2099-10-10', end='2099-10-12'):
        id = str(uuid.uuid4())
        self.sql('INSERT INTO reservations (id,name,phone,site,price,status,reservation_start,reservation_end,reservation_date,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                 [id, '테스트', '01000000000', site, 100000, status, start, end, start+' ~ '+end, '2099-10-10 12:00:00'])
        return id

    def create(self, site, start='2099-10-10', end='2099-10-12'):
        return self.rpc('create_reservation', {'p_name':'테스트','p_phone':'01000000000','p_people':2,
                       'p_start':start,'p_end':end,'p_site':site,'p_option_total':0})

    def test_all_legacy_reservations_block_new_numbers_without_rewriting_data(self):
        for old, number in MAPPING.items():
            id = self.seed(old)
            result = self.create(number)
            self.assertEqual(result['error']['code'], 'ALREADY_BOOKED', (old, number, result))
            self.assertEqual(self.sql('SELECT site,price FROM reservations WHERE id=?', [id]), [{'site':old,'price':100000}])
        data = self.rpc('get_booked_sites', {'p_start':'2099-10-10','p_end':'2099-10-12'})['data']
        self.assertEqual({row['site'] for row in data}, set(MAPPING.values()))

    def test_numeric_alias_also_blocks_legacy_client(self):
        self.seed('16')
        self.assertEqual(self.create('오토7')['error']['code'], 'ALREADY_BOOKED')

    def test_all_24_numbers_create_with_stable_storage_keys(self):
        reverse = {value:key for key,value in MAPPING.items()}
        for number in map(str, range(1,25)):
            result = self.create(number)
            self.assertTrue(result['ok'], (number, result))
            stored = self.sql('SELECT site FROM reservations WHERE id=?', [result['data']])[0]['site']
            self.assertEqual(stored, reverse.get(number, number))

    def test_checkout_boundary_and_cancelled_sites_are_available(self):
        self.seed('오토7')
        self.assertTrue(self.create('16', start='2099-10-12', end='2099-10-13')['ok'])
        self.seed('일반1', status='취소됨')
        self.assertTrue(self.create('13')['ok'])

    def test_receipt_and_lookup_show_new_number_preserving_price(self):
        id = self.seed('오토11')
        receipt = self.rpc('get_reservation_receipt', {'p_id':id})['data'][0]
        self.assertEqual((receipt['site'], receipt['price']), ('24', 100000))
        rows = self.rpc('find_reservations', {'p_name':'테스트','p_phone':'01000000000'})['data']
        self.assertEqual(rows[0]['site'], '24')

    def test_invalid_sites_cannot_be_inserted(self):
        for site in ['0','25','A1','오토12','1 OR 1=1']:
            self.assertEqual(self.create(site)['error']['code'], 'INVALID_SITE')
        self.assertEqual(self.sql('SELECT COUNT(*) AS n FROM reservations')[0]['n'], 0)

    def test_concurrent_legacy_and_number_requests_share_one_lock(self):
        for requests in [['오토7','16']*4, ['4']*8]:
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(self.create, requests))
            self.assertEqual(sum(result['ok'] for result in results), 1, results)
            self.assertTrue(all(r['ok'] or r['error']['code']=='ALREADY_BOOKED' for r in results), results)


if __name__ == '__main__':
    unittest.main(verbosity=2)
