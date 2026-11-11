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
    clients: {}
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
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'karao-navy.vercel.app';
        const remoteUrl = `${proto}://${host}/remote.html`;
        return res.status(200).json({
            ok: true,
            roomId: memoryState.roomId,
            remoteUrl,
            hostOnline: (now - memoryState.hostLastSeen) < 15000
        });
    }

    if (action === 'sync_host') {
        let payload = req.body || {};
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
        }
        memoryState.hostLastSeen = now;
        if (typeof payload.isPlaying !== 'undefined') memoryState.isPlaying = Boolean(payload.isPlaying);
        if (typeof payload.volume !== 'undefined') memoryState.volume = Number(payload.volume);
        if (typeof payload.isMuted !== 'undefined') memoryState.isMuted = Boolean(payload.isMuted);
        if (typeof payload.isCompeteMode !== 'undefined') memoryState.isCompeteMode = Boolean(payload.isCompeteMode);
        if (typeof payload.isHomeOpen !== 'undefined') memoryState.isHomeOpen = Boolean(payload.isHomeOpen);
        if (typeof payload.liveScore !== 'undefined') memoryState.liveScore = Number(payload.liveScore);
        if (typeof payload.liveEvalText !== 'undefined') memoryState.liveEvalText = payload.liveEvalText;
        if (typeof payload.liveNote !== 'undefined') memoryState.liveNote = payload.liveNote;
        if (typeof payload.nowPlaying !== 'undefined') memoryState.nowPlaying = payload.nowPlaying;
        if (Array.isArray(payload.queue)) memoryState.queue = payload.queue;
        if (Array.isArray(payload.leaderboard)) memoryState.leaderboard = payload.leaderboard;

        // Clean inactive clients (> 15s)
        const activeClients = {};
        for (const [cid, lastSeen] of Object.entries(memoryState.clients || {})) {
            if (now - lastSeen <= 15000) {
                activeClients[cid] = lastSeen;
            }
        }
        memoryState.clients = activeClients;

        // Pop pending commands to execute on host
        const pendingCommands = [...(memoryState.commands || [])];
        memoryState.commands = [];

        return res.status(200).json({
            ok: true,
            commands: pendingCommands,
            clientCount: Object.keys(activeClients).length
        });
    }

    if (action === 'command') {
        let payload = req.body || {};
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
        }

        const clientId = payload.clientId || ('mobile_' + Math.random().toString(36).substr(2, 6));
        if (!memoryState.clients) memoryState.clients = {};
        memoryState.clients[clientId] = now;

        const cmdId = 'cmd_' + now + '_' + Math.random().toString(36).substr(2, 5);
        const newCmd = {
            id: cmdId,
            type: payload.type,
            payload: payload.payload !== undefined ? payload.payload : null,
            sender: payload.sender || 'รีโมทมือถือ',
            timestamp: Math.floor(now / 1000)
        };

        if (!Array.isArray(memoryState.commands)) memoryState.commands = [];
        memoryState.commands.push(newCmd);

        // Keep at most 30 commands in buffer
        if (memoryState.commands.length > 30) {
            memoryState.commands = memoryState.commands.slice(-30);
        }

        return res.status(200).json({ ok: true, id: cmdId });
    }

    if (action === 'state') {
        const clientId = req.query.clientId;
        if (clientId) {
            if (!memoryState.clients) memoryState.clients = {};
            memoryState.clients[clientId] = now;
        }
        return res.status(200).json({
            ok: true,
            ...memoryState,
            hostOnline: (now - memoryState.hostLastSeen) < 15000
        });
    }

    return res.status(200).json({ ok: true, ...memoryState });
}
