<?php

const API = 'https://api.addons.prestashop.com/request/seller';
const TTL = 15 * 60;
const FIRST_YEAR = 2015;

header('Content-Type: application/json');

function fail(string $message, int $status = 502): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

function apiKey(): string
{
    $env = @parse_ini_file(__DIR__ . '/.env', false, INI_SCANNER_RAW);
    $key = $env['API_KEY'] ?? getenv('API_KEY');
    if (!$key) fail('API_KEY missing (set it in .env)', 500);
    return $key;
}

function handle(string $path, array $params): CurlHandle
{
    $ch = curl_init(API . "/$path?" . http_build_query(['api_key' => apiKey()] + $params));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60]);
    return $ch;
}

function decode(CurlHandle $ch, string $path): array
{
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = json_decode((string) curl_multi_getcontent($ch), true);
    if ($status !== 200) fail("Addons API /$path returned $status");
    if (empty($json['success'])) fail("Addons API /$path returned success=false");
    return $json;
}

function fetchAll(string $path, array $paramSets): array
{
    $mh = curl_multi_init();
    $handles = [];
    foreach ($paramSets as $params) {
        $handles[] = $ch = handle($path, $params);
        curl_multi_add_handle($mh, $ch);
    }
    do {
        curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh);
    } while ($running);
    $out = array_map(fn($ch) => decode($ch, $path), $handles);
    foreach ($handles as $ch) curl_multi_remove_handle($mh, $ch);
    return $out;
}

function num($v): float|int
{
    return is_numeric($v) ? $v + 0 : 0;
}

function normalize(array $r): array
{
    return [
        'id' => num($r['id_seller_history'] ?? 0),
        'pid' => num($r['id_product'] ?? 0),
        'type' => (string) ($r['type'] ?? ''),
        'amount' => num($r['amount'] ?? 0),
        'order' => num($r['id_order'] ?? 0),
        'date' => (string) ($r['order_date'] ?? ''),
        'name' => (string) ($r['product_name'] ?? ''),
        'source' => num($r['order_source'] ?? 0),
        'iso' => (string) ($r['iso_code'] ?? ''),
        'ptype' => (string) ($r['product_type'] ?? ''),
        'qty' => num($r['product_quantity'] ?? 0),
        'qtyRefunded' => num($r['product_quantity_refunded'] ?? 0),
        'customer' => (string) ($r['customer_hash'] ?? ''),
        'discount' => (string) ($r['discount_name'] ?? ''),
        'discountValue' => num($r['discount_value'] ?? 0),
        'promo' => num($r['contributor_promo'] ?? 0),
    ];
}

function sales(): array
{
    $sets = array_map(
        fn($y) => ['date_from' => "$y-01-01", 'date_to' => "$y-12-31"],
        range(FIRST_YEAR, (int) date('Y')),
    );
    $byId = [];
    foreach (fetchAll('orders', $sets) as $chunk) {
        foreach ($chunk['sales'] ?? [] as $r) {
            $row = normalize($r);
            $byId[$row['id']] = $row;
        }
    }
    $rows = array_values($byId);
    usort($rows, fn($a, $b) => [$a['date'], $a['id']] <=> [$b['date'], $b['id']]);
    return ['fetchedAt' => gmdate('Y-m-d\TH:i:s.v\Z'), 'rows' => $rows];
}

function products(): array
{
    $names = [];
    foreach (fetchAll('products', [[]])[0]['products'] ?? [] as $p) {
        $names[(int) num($p['id_product'] ?? 0)] = (string) ($p['name'] ?? $p['product_name']['name'] ?? '');
    }
    return $names;
}

$routes = ['sales' => 'sales', 'products' => 'products'];
$route = $_GET['r'] ?? '';
if (!isset($routes[$route])) fail('Not found', 404);

$dir = __DIR__ . '/cache';
$file = "$dir/$route.json";
$force = ($_GET['refresh'] ?? '') === '1';

if (!$force && is_file($file) && time() - filemtime($file) < TTL) {
    readfile($file);
    exit;
}

$body = json_encode($routes[$route](), $route === 'products' ? JSON_FORCE_OBJECT : 0);
if (!is_dir($dir)) mkdir($dir, 0755, true);
file_put_contents("$file.tmp", $body);
rename("$file.tmp", $file);
echo $body;
