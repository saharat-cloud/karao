const https = require('https');
const query = process.argv[2] || 'คาราโอเกะ';
https.get('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
        let match;
        let ids = [];
        while ((match = regex.exec(data)) !== null) {
            if (!ids.includes(match[1])) ids.push(match[1]);
        }
        console.log(ids.slice(0, 3).join(', '));
    });
}).on('error', err => {
    console.error('Error fetching:', err);
});
