<?php
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

$q = isset($argv[1]) ? $argv[1] : (isset($_GET['q']) ? trim($_GET['q']) : '');
if (empty($q)) {
    echo json_encode([]);
    exit;
}

// Avoid duplicating คาราโอเกะ if already present in query
if (stripos($q, 'karaoke') === false && strpos($q, 'คาราโอเกะ') === false) {
    $searchQuery = urlencode($q . ' คาราโอเกะ');
} else {
    $searchQuery = urlencode($q);
}

$url = "https://www.youtube.com/results?search_query=" . $searchQuery;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Accept-Language: th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cookie: CONSENT=YES+cb.20210328-17-p0.th+FX+110"
]);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

$html = curl_exec($ch);
curl_close($ch);

if (!$html) {
    echo json_encode([]);
    exit;
}

if (preg_match('/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/is', $html, $matches)) {
    $data = json_decode($matches[1], true);
    $strictResults = [];
    $fallbackResults = [];

    $contents = $data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents'] ?? [];

    foreach ($contents as $section) {
        $items = $section['itemSectionRenderer']['contents'] ?? [];
        foreach ($items as $item) {
            if (isset($item['videoRenderer'])) {
                $video = $item['videoRenderer'];
                $id = $video['videoId'] ?? '';
                $title = $video['title']['runs'][0]['text'] ?? '';
                $artist = $video['ownerText']['runs'][0]['text'] ?? 'YouTube Karaoke';

                if (!empty($id) && !empty($title)) {
                    $titleLower = strtolower($title);
                    $artistLower = strtolower($artist);

                    // Skip Official MVs
                    if (strpos($titleLower, 'official mv') !== false ||
                        strpos($titleLower, 'official music video') !== false ||
                        strpos($titleLower, 'official audio') !== false) {
                        continue;
                    }

                    $isKaraoke = (
                        strpos($titleLower, 'karaoke') !== false ||
                        strpos($title, 'คาราโอเกะ') !== false ||
                        strpos($titleLower, 'instrumental') !== false ||
                        strpos($titleLower, 'backing track') !== false ||
                        strpos($title, 'ตัดเสียงร้อง') !== false ||
                        strpos($title, 'ดนตรีสด') !== false ||
                        strpos($artistLower, 'karaoke') !== false ||
                        strpos($artist, 'คาราโอเกะ') !== false
                    );

                    $entry = [
                        'ytId' => $id,
                        'title' => $title,
                        'artist' => $artist,
                        'isKaraoke' => $isKaraoke
                    ];

                    if ($isKaraoke) {
                        $strictResults[] = $entry;
                    } else {
                        $fallbackResults[] = $entry;
                    }
                }
            }
            if (count($strictResults) >= 15) break;
        }
        if (count($strictResults) >= 15) break;
    }

    $final = array_merge($strictResults, $fallbackResults);
    $final = array_slice($final, 0, 15);

    echo json_encode($final, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} else {
    echo json_encode([]);
}
?>
