<?php
/**
 * search_proxy.php
 * Server-side proxy to bypass CORS issues when calling the Invidious API.
 * Called by admin.js with: /karaoke/search_proxy.php?q=ชื่อเพลง
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

$q = isset($_GET['q']) ? trim($_GET['q']) : '';
if (empty($q)) {
    echo json_encode(['error' => 'No query provided']);
    exit;
}

$data = null;
$error_log = [];

// DIRECT YOUTUBE SCRAPING: Most reliable method without an API key
$searchQuery = urlencode($q . ' คาราโอเกะ');
$url = "https://www.youtube.com/results?search_query={$searchQuery}";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 8);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
// Set Thai language headers and generic User-Agent to avoid consent pages where possible
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Accept-Language: th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cookie: CONSENT=YES+cb.20210328-17-p0.th+FX+110"
]);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

$resp = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($resp !== false && $httpCode >= 200 && $httpCode < 300) {
    // Extract ytInitialData which contains all the JSON for the page
    if (preg_match('/ytInitialData\s*=\s*({.+?});\s*<\/script>/is', $resp, $matches)) {
        $json = json_decode($matches[1], true);

        $mappedArray = [];
        try {
            // Drill down into the complex YouTube JSON structure safely
            $contents = $json['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents'] ?? [];

            foreach ($contents as $item) {
                if (isset($item['videoRenderer'])) {
                    $vr = $item['videoRenderer'];
                    $mappedArray[] = [
                        'videoId' => $vr['videoId'] ?? '',
                        'title' => $vr['title']['runs'][0]['text'] ?? 'Unknown Title',
                        'author' => $vr['ownerText']['runs'][0]['text'] ?? 'Unknown Channel'
                    ];
                }
            }

            if (count($mappedArray) > 0) {
                $data = $mappedArray;
            } else {
                $error_log[] = "ไม่พบข้อมูล videoRenderer";
            }
        } catch (Exception $e) {
            $error_log[] = "แยกโครงสร้างข้อมูลล้มเหลว: " . $e->getMessage();
        }
    } else {
        $error_log[] = "ไม่พบ ytInitialData บนหน้าเว็บ";
    }
} else {
    $error_log[] = "HTTP $httpCode, CurlErr: $curlError";
}

if ($data === null) {
    // Return all errors combined for better debugging
    echo json_encode(['error' => 'ดึงข้อมูลจาก YouTube ล้มเหลว: ' . implode(" | ", $error_log)]);
    exit;
}

// Return cleaned up result
$results = array_slice($data, 0, 10);
echo json_encode($results);
?>