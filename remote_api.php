<?php
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    exit(0);
}

$stateFile = __DIR__ . '/remote_state.json';
$action = isset($_GET['action']) ? $_GET['action'] : 'state';

function getDefaultState() {
    return [
        'roomId' => 'KTV-888',
        'hostLastSeen' => 0,
        'isPlaying' => false,
        'volume' => 100,
        'isMuted' => false,
        'isCompeteMode' => false,
        'isHomeOpen' => true,
        'liveScore' => 0,
        'liveEvalText' => 'รอเสียงร้อง...',
        'liveNote' => '-',
        'nowPlaying' => null,
        'queue' => [],
        'leaderboard' => [],
        'commands' => [],
        'clients' => []
    ];
}

function readState($stateFile) {
    if (!file_exists($stateFile)) {
        return getDefaultState();
    }
    $content = @file_get_contents($stateFile);
    if (!$content) return getDefaultState();
    $data = json_decode($content, true);
    if (!is_array($data)) return getDefaultState();
    return array_merge(getDefaultState(), $data);
}

function writeState($stateFile, $state) {
    @file_put_contents($stateFile, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

function getLocalIpAddresses() {
    $ips = [];
    // Method 1: Windows ipconfig parsing for accurate Wi-Fi / LAN IPv4
    if (stripos(PHP_OS, 'WIN') !== false) {
        $output = @shell_exec('ipconfig');
        if ($output && preg_match_all('/IPv4[^:]*:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/i', $output, $matches)) {
            foreach ($matches[1] as $ip) {
                if ($ip !== '127.0.0.1' && strpos($ip, '169.254.') !== 0) {
                    $ips[] = $ip;
                }
            }
        }
    }
    // Method 2: PHP getHostByName
    $hostIp = @getHostByName(@getHostName());
    if ($hostIp && $hostIp !== '127.0.0.1' && !in_array($hostIp, $ips) && filter_var($hostIp, FILTER_VALIDATE_IP)) {
        $ips[] = $hostIp;
    }
    // Sort to prefer 192.168.x.x or 10.x.x.x or 172.x.x.x
    usort($ips, function($a, $b) {
        $scoreA = (strpos($a, '192.168.') === 0) ? 3 : ((strpos($a, '10.') === 0 || strpos($a, '172.') === 0) ? 2 : 1);
        $scoreB = (strpos($b, '192.168.') === 0) ? 3 : ((strpos($b, '10.') === 0 || strpos($b, '172.') === 0) ? 2 : 1);
        return $scoreB - $scoreA;
    });
    if (empty($ips)) {
        $ips[] = $_SERVER['SERVER_ADDR'] ?? '127.0.0.1';
    }
    return array_values(array_unique($ips));
}

if ($action === 'info') {
    $ips = getLocalIpAddresses();
    $primaryIp = $ips[0] ?? 'localhost';
    $port = $_SERVER['SERVER_PORT'] ?? '80';
    $portSuffix = ($port !== '80' && $port !== '443') ? ':' . $port : '';
    $basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
    $remoteUrl = "http://{$primaryIp}{$portSuffix}{$basePath}/remote.html";

    echo json_encode([
        'ok' => true,
        'primaryIp' => $primaryIp,
        'allIps' => $ips,
        'port' => $port,
        'basePath' => $basePath,
        'remoteUrl' => $remoteUrl
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'sync_host') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true) ?: [];
    $state = readState($stateFile);

    $state['hostLastSeen'] = time();
    if (isset($payload['roomId'])) $state['roomId'] = $payload['roomId'];
    if (isset($payload['isPlaying'])) $state['isPlaying'] = (bool)$payload['isPlaying'];
    if (isset($payload['volume'])) $state['volume'] = (int)$payload['volume'];
    if (isset($payload['isMuted'])) $state['isMuted'] = (bool)$payload['isMuted'];
    if (isset($payload['isCompeteMode'])) $state['isCompeteMode'] = (bool)$payload['isCompeteMode'];
    if (isset($payload['isHomeOpen'])) $state['isHomeOpen'] = (bool)$payload['isHomeOpen'];
    if (isset($payload['liveScore'])) $state['liveScore'] = (int)$payload['liveScore'];
    if (isset($payload['liveEvalText'])) $state['liveEvalText'] = $payload['liveEvalText'];
    if (isset($payload['liveNote'])) $state['liveNote'] = $payload['liveNote'];
    if (array_key_exists('nowPlaying', $payload)) $state['nowPlaying'] = $payload['nowPlaying'];
    if (isset($payload['queue']) && is_array($payload['queue'])) $state['queue'] = $payload['queue'];
    if (isset($payload['leaderboard']) && is_array($payload['leaderboard'])) $state['leaderboard'] = $payload['leaderboard'];

    // Prune inactive mobile clients (> 15 seconds)
    $now = time();
    $activeClients = [];
    if (isset($state['clients']) && is_array($state['clients'])) {
        foreach ($state['clients'] as $cid => $lastSeen) {
            if ($now - $lastSeen <= 15) {
                $activeClients[$cid] = $lastSeen;
            }
        }
    }
    $state['clients'] = $activeClients;

    // Pop pending commands to execute on host
    $pendingCommands = $state['commands'] ?? [];
    $state['commands'] = [];

    writeState($stateFile, $state);

    echo json_encode([
        'ok' => true,
        'commands' => $pendingCommands,
        'clientCount' => count($activeClients)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'command') {
    $raw = file_get_contents('php://input');
    $cmd = json_decode($raw, true);
    if (!$cmd || empty($cmd['type'])) {
        echo json_encode(['ok' => false, 'error' => 'Invalid command']);
        exit;
    }

    $state = readState($stateFile);
    $clientId = $cmd['clientId'] ?? ('mobile_' . substr(md5($_SERVER['REMOTE_ADDR'] ?? 'local'), 0, 6));
    $state['clients'][$clientId] = time();

    $newCommand = [
        'id' => uniqid('cmd_', true),
        'type' => $cmd['type'],
        'payload' => $cmd['payload'] ?? null,
        'sender' => $cmd['sender'] ?? 'รีโมทมือถือ',
        'timestamp' => time()
    ];

    if (!isset($state['commands']) || !is_array($state['commands'])) {
        $state['commands'] = [];
    }
    $state['commands'][] = $newCommand;
    // Keep max 30 commands in buffer
    if (count($state['commands']) > 30) {
        $state['commands'] = array_slice($state['commands'], -30);
    }

    writeState($stateFile, $state);

    echo json_encode([
        'ok' => true,
        'command' => $newCommand
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Default: GET ?action=state (Polled by mobile remote)
$state = readState($stateFile);
$clientId = isset($_GET['clientId']) ? $_GET['clientId'] : null;
if ($clientId) {
    $state['clients'][$clientId] = time();
    writeState($stateFile, $state);
}

$hostOnline = (time() - ($state['hostLastSeen'] ?? 0)) < 10;

echo json_encode([
    'ok' => true,
    'hostOnline' => $hostOnline,
    'roomId' => $state['roomId'],
    'isPlaying' => $state['isPlaying'],
    'volume' => $state['volume'],
    'isMuted' => $state['isMuted'],
    'isCompeteMode' => $state['isCompeteMode'],
    'isHomeOpen' => $state['isHomeOpen'],
    'liveScore' => $state['liveScore'],
    'liveEvalText' => $state['liveEvalText'],
    'liveNote' => $state['liveNote'],
    'nowPlaying' => $state['nowPlaying'],
    'queue' => $state['queue'],
    'leaderboard' => $state['leaderboard'],
    'clientCount' => count($state['clients'] ?? [])
], JSON_UNESCAPED_UNICODE);
?>
