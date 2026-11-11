// Vercel Serverless Function: Remote Control Sync API
let memoryState = {
    roomId: 'KTV-888',
    hostLastSeen: Date.now(),
    isPlaying: false,
    volume: 100,
    isMuted: false,
    isCompeteMode: false,
    isHomeOpen: true,
    liveScore: 0,
    liveEvalText: 'รอเสียงร้อง...',
    liveNote: '-',
    nowPlaying: null,
    queue: [],
    leaderboard: [],
    commands: [],
    clients: []
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action || 'state';
    const now = Date.now();

    if (action === 'info') {
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const remoteUrl = `${proto}://${host}/remote.html`;
        return res.status(200).json({
            ok: true,
            roomId: memoryState.roomId,
            remoteUrl,
            hostOnline: (now - memoryState.hostLastSeen) < 15000
        });
    }

    if (action === 'state') {
        // Clean commands older than 30s
        memoryState.commands = memoryState.commands.filter(c => (now - (c.time || 0)) < 30000);
        return res.status(200).json(memoryState);
    }

    if (action === 'sync_host') {
        let payload = req.body || {};
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
        }
        memoryState.hostLastSeen = now;
        if (typeof payload.isPlaying !== 'undefined') memoryState.isPlaying = payload.isPlaying;
        if (typeof payload.volume !== 'undefined') memoryState.volume = payload.volume;
        if (typeof payload.isMuted !== 'undefined') memoryState.isMuted = payload.isMuted;
        if (typeof payload.isHomeOpen !== 'undefined') memoryState.isHomeOpen = payload.isHomeOpen;
        if (typeof payload.nowPlaying !== 'undefined') memoryState.nowPlaying = payload.nowPlaying;
        if (Array.isArray(payload.queue)) memoryState.queue = payload.queue;
        if (Array.isArray(payload.leaderboard)) memoryState.leaderboard = payload.leaderboard;

        return res.status(200).json({ ok: true, state: memoryState });
    }

    if (action === 'send_cmd') {
        let payload = req.body || {};
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
        }
        const cmdId = 'cmd_' + now + '_' + Math.random().toString(36).substr(2, 5);
        const newCmd = {
            id: cmdId,
            cmd: payload.cmd,
            data: payload.data || {},
            user: payload.user || 'Guest',
            time: now
        };
        memoryState.commands.push(newCmd);

        // Keep at most 20 recent commands
        if (memoryState.commands.length > 20) {
            memoryState.commands = memoryState.commands.slice(-20);
        }

        return res.status(200).json({ ok: true, cmdId });
    }

    return res.status(200).json(memoryState);
}

