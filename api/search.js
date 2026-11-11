// Vercel Serverless Function: YouTube Karaoke Search API
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const q = req.query.q || '';
    if (!q || !q.trim()) {
        return res.status(200).json([]);
    }

    let searchQuery = q.trim();
    if (!searchQuery.toLowerCase().includes('karaoke') && !searchQuery.includes('คาราโอเกะ')) {
        searchQuery += ' คาราโอเกะ';
    }

    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(searchQuery);

    try {
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Cookie': 'CONSENT=YES+cb.20210328-17-p0.th+FX+110'
            }
        });

        const html = await response.text();
        const match = html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
        if (!match) {
            return res.status(200).json([]);
        }

        const data = JSON.parse(match[1]);
        const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

        const strictResults = [];
        const fallbackResults = [];

        for (const section of contents) {
            const items = section?.itemSectionRenderer?.contents || [];
            for (const item of items) {
                const video = item?.videoRenderer;
                if (!video) continue;

                const id = video.videoId;
                const title = video.title?.runs?.[0]?.text;
                const artist = video.ownerText?.runs?.[0]?.text || 'YouTube Karaoke';

                if (id && title) {
                    const titleLower = title.toLowerCase();
                    const artistLower = artist.toLowerCase();

                    // Skip Official MVs without karaoke backing track
                    if (titleLower.includes('official mv') || titleLower.includes('official music video') || titleLower.includes('official audio')) {
                        continue;
                    }

                    const isKaraoke = (
                        titleLower.includes('karaoke') ||
                        title.includes('คาราโอเกะ') ||
                        titleLower.includes('instrumental') ||
                        titleLower.includes('backing track') ||
                        title.includes('ตัดเสียงร้อง') ||
                        title.includes('ดนตรีสด') ||
                        artistLower.includes('karaoke') ||
                        artist.includes('คาราโอเกะ')
                    );

                    const entry = { ytId: id, title, artist, isKaraoke };
                    if (isKaraoke) {
                        strictResults.push(entry);
                    } else {
                        fallbackResults.push(entry);
                    }
                }
                if (strictResults.length >= 15) break;
            }
            if (strictResults.length >= 15) break;
        }

        const finalResults = [...strictResults, ...fallbackResults].slice(0, 15);
        return res.status(200).json(finalResults);
    } catch (err) {
        console.error('Vercel Search API error:', err);
        return res.status(200).json([]);
    }
}

