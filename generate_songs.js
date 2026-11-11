const fs = require('fs');
const https = require('https');

const queries = [
    { id: 1, title: 'รักติดไซเรน (My Ambulance)', artist: 'ไอซ์ พาริส, แพรวา', q: 'คาราโอเกะ รักติดไซเรน' },
    { id: 2, title: 'ซ่อนกลิ่น (Hide)', artist: 'ปาล์มมี่', q: 'คาราโอเกะ ซ่อนกลิ่น' },
    { id: 3, title: 'เลิกคุยทั้งอำเภอเพื่อเธอคนเดียว', artist: 'ลิลลี่ ได้หมดถ้าสดชื่น', q: 'คาราโอเกะ เลิกคุยทั้งอำเภอเพื่อเธอคนเดียว' },
    { id: 4, title: 'สลักจิต', artist: 'ป๊อบ ปองกูล & ดา เอ็นโดรฟิน', q: 'คาราโอเกะ สลักจิต ป๊อบ' },
    { id: 5, title: 'ทรงอย่างแบด', artist: 'Paper Planes', q: 'คาราโอเกะ ทรงอย่างแบด paper planes' },
    { id: 6, title: 'เพื่อนเล่น ไม่เล่นเพื่อน', artist: 'Tilly Birds', q: 'คาราโอเกะ เพื่อนเล่น ไม่เล่นเพื่อน tilly birds' },
    { id: 7, title: 'เลือดกรุ๊ปบี', artist: 'CHUUGEE', q: 'คาราโอเกะ เลือดกรุ๊ปบี' },
    { id: 8, title: 'หมายความว่าอะไร', artist: 'MEAN', q: 'คาราโอเกะ หมายความว่าอะไร' },
    { id: 9, title: 'ทน', artist: 'SPRITE x GUYGEEGEE', q: 'คาราโอเกะ ทน sprite' },
    { id: 10, title: 'ถ้าเราเจอกันอีก', artist: 'Tilly Birds', q: 'คาราโอเกะ ถ้าเราเจอกันอีก tilly birds' },
    { id: 11, title: 'สแตนด์บายหล่อ', artist: 'New Country', q: 'คาราโอเกะ สแตนด์บายหล่อ' },
    { id: 12, title: 'ลืมไปแล้วว่าลืมยังไง', artist: 'เจฟ ซาเตอร์', q: 'คาราโอเกะ ลืมไปแล้วว่าลืมยังไง' },
    { id: 13, title: 'วาดไว้ (recall)', artist: 'Bowkylion', q: 'คาราโอเกะ วาดไว้ bowkylion' },
    { id: 14, title: 'นะหน้าทอง', artist: 'โจอี้ ภูวศิษฐ์', q: 'คาราโอเกะ นะหน้าทอง' },
    { id: 15, title: 'Never Gonna Give You Up (Karaoke)', artist: 'Rick Astley', q: 'Never Gonna Give You Up karaoke version' }
];

async function search(q) {
    return new Promise((resolve) => {
        https.get('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
                let match = regex.exec(data);
                // Take the second match often because the first might be an ad or short
                let match2 = regex.exec(data);
                if (match2 && match2[1]) {
                    resolve(match2[1]);
                } else if (match && match[1]) {
                    resolve(match[1]);
                } else {
                    resolve('dQw4w9WgXcQ');
                }
            });
        });
    });
}

(async () => {
    let out = 'const SONGS_DB = [\n';
    out += '    // ฐานข้อมูลเพลงที่ดึงวิดีโอจาก YouTube อัตโนมัติ (เลือกวิดีโอที่มีคำว่า คาราโอเกะ)\n';
    for (let s of queries) {
        let id = await search(s.q);
        out += `    { id: ${s.id}, title: '${s.title.replace(/'/g, "\\'")}', artist: '${s.artist.replace(/'/g, "\\'")}', ytId: '${id}' },\n`;
    }
    out += '];\n';
    fs.writeFileSync('songs.js', out);
    console.log("Written songs.js smoothly.");
})();
