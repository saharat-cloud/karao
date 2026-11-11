// Vercel Serverless Function: YouTube Karaoke Search API with Intelligent Fallback

const PRESET_SONGS = [
    { ytId: 'tTJc3wIdXX0', title: "ดาวหางฮัลเลย์ (Halley's Comet) [คาราโอเกะ]", artist: 'fellow fellow' },
    { ytId: 'yQnM24qkvqI', title: 'ซ่อน(ไม่)หา (Ghost) [คาราโอเกะ]', artist: 'Jeff Satur' },
    { ytId: '3tmd-ClpJxA', title: 'Hit Me Up [คาราโอเกะ]', artist: 'ธามไท (TIMETHAI)' },
    { ytId: 'rKgIYKk--hs', title: 'พี่ชอบหนูที่สุดเลย (I Like You The Most) [คาราโอเกะ]', artist: 'PONCHET feat. VARINZ' },
    { ytId: '3kWXCvbavGk', title: 'ยินดีด้วยนะ (Glad) [คาราโอเกะ]', artist: 'Ink Waruntorn' },
    { ytId: 'cq2Ef6rvL6g', title: 'ทรงอย่างแบด (Bad Boy) [คาราโอเกะ]', artist: 'Paper Planes' },
    { ytId: 'fJ9rUzIMcZQ', title: 'ลืมไปแล้วว่าลืมยังไง (Fade) [คาราโอเกะ]', artist: 'Jeff Satur' },
    { ytId: 'kXYiU_JCYtU', title: 'นะหน้าทอง [คาราโอเกะ]', artist: 'โจอี้ ภูวศิษฐ์' },
    { ytId: 'eVTXPUF4Oz4', title: 'วาดไว้ (recall) [คาราโอเกะ]', artist: 'BOWKYLION' },
    { ytId: '60ItHLz5WEA', title: 'เพื่อนเล่น ไม่เล่นเพื่อน (Just Being Friendly) [คาราโอเกะ]', artist: 'Tilly Birds feat. MILLI' },
    { ytId: 'RgKAFK5djSk', title: 'เลือดกรุ๊ปบี (B Blood Type) [คาราโอเกะ]', artist: 'CHRRISSA (เอิ้ก ชาลิสา)' },
    { ytId: 'JGwWNGJdvx8', title: 'ถ้าเราเจอกันอีก (Until Then) [คาราโอเกะ]', artist: 'Tilly Birds' },
    { ytId: '09R8_2nJtjg', title: 'สลักจิต [คาราโอเกะ]', artist: 'ป๊อบ ปองกูล ft. ดา เอ็นโดรฟิน' },
    { ytId: 'OPf0YbXqDm0', title: 'ซ่อนกลิ่น [คาราโอเกะ]', artist: 'ปาล์มมี่ (PALMY)' },
    { ytId: 'CevxZvSJLk8', title: 'เลิกคุยทั้งอำเภอเพื่อเธอคนเดียว [คาราโอเกะ]', artist: 'ลิลลี่ ได้หมดถ้าสดชื่น' },
    { ytId: 'YQHsXMglC9A', title: 'รักติดไซเรน (My Ambulance) [คาราโอเกะ]', artist: 'ไอซ์ พาริส & แพรวา ณิชาภัทร' },
    { ytId: 'pRpeEdMmmQ0', title: 'สแตนด์บายหล่อ [คาราโอเกะ]', artist: 'New Country' },
    { ytId: 'hT_nvWreIhg', title: 'ทน (TON) [คาราโอเกะ]', artist: 'SPRITE x GUYGEEGEE' },
    { ytId: 'ktvTqknDobU', title: 'ความเชื่อ [คาราโอเกะ]', artist: 'Bodyslam feat. แอ๊ด คาราบาว' },
    { ytId: '3tmd-ClpJxA', title: 'แสงสุดท้าย [คาราโอเกะ]', artist: 'Bodyslam' },
    { ytId: 'uelHwf8o7_U', title: 'ใจสั่งมา [คาราโอเกะ]', artist: 'LOSO (เสก โลโซ)' },
    { ytId: '2Vv-BfVoq4g', title: 'งมงาย [คาราโอเกะ]', artist: 'Bodyslam' },
    { ytId: 'lp-EO5I60KA', title: 'โต๊ะริม (Melt) [คาราโอเกะ]', artist: 'NONT TANONT (นนท์ ธนนท์)' },
    { ytId: '0KSOMA3QBU0', title: 'พิง (เพลงประกอบละคร กระเช้าสีดา) [คาราโอเกะ]', artist: 'NONT TANONT (นนท์ ธนนท์)' },
    { ytId: 'hLQl3WQQoQ0', title: 'ฝนตกไหม [คาราโอเกะ]', artist: 'Three Man Down' },
    { ytId: 'pt8VYOfr8To', title: 'คำถามโง่ๆ [คาราโอเกะ]', artist: 'BOYdPOD' },
    { ytId: 'ru0K8uYEZWw', title: 'รักแรก (First Love) [คาราโอเกะ]', artist: 'NONT TANONT (นนท์ ธนนท์)' },
    { ytId: 'fWNaR-rxAic', title: 'คาเฟอีน [คาราโอเกะ]', artist: 'หญิงลี ศรีจุมพล' },
    { ytId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up [Karaoke]', artist: 'Rick Astley' },
    { ytId: 'ulOb9gIGGd0', title: 'My Love [Karaoke]', artist: 'Westlife' }
];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const q = (req.query.q || '').trim();
    if (!q) {
        return res.status(200).json(PRESET_SONGS.slice(0, 10));
    }

    const qLower = q.toLowerCase();
    const localMatches = PRESET_SONGS.filter(s =>
        s.title.toLowerCase().includes(qLower) || s.artist.toLowerCase().includes(qLower)
    );

    let searchQuery = q;
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
            return res.status(200).json(localMatches.length > 0 ? localMatches : PRESET_SONGS.slice(0, 6));
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

        const ytResults = [...strictResults, ...fallbackResults].slice(0, 15);
        if (ytResults.length > 0) {
            // Combine with local matches avoiding duplicates
            const seen = new Set();
            const combined = [];
            for (const item of [...localMatches, ...ytResults]) {
                if (!seen.has(item.ytId)) {
                    seen.add(item.ytId);
                    combined.push(item);
                }
            }
            return res.status(200).json(combined.slice(0, 15));
        }

        return res.status(200).json(localMatches.length > 0 ? localMatches : PRESET_SONGS.slice(0, 6));
    } catch (err) {
        console.error('Vercel Search API error:', err);
        return res.status(200).json(localMatches.length > 0 ? localMatches : PRESET_SONGS.slice(0, 6));
    }
}
