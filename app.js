// ============================================================================
// PREMIUM WEB KARAOKE - MAIN APPLICATION LOGIC (app.js)
// Features:
// 1. Home Hub (Hit Songs, Top 10 Charts, Music Stations, Playlists, Recommended)
// 2. Real-time Vocal Pitch & Quality Scoring System (Live HUD + 3-Metric Breakdown)
// 3. Mobile Remote Control Sync (PHP Backend + BroadcastChannel + QR Code Modal)
// ============================================================================

// Globals
let player;
let queue = [];
let isPlaying = false;
let currentPlayingSong = null;
let currentVolume = 100;
let isMuted = false;
let isHomeOpen = true;

let searchResults = [];
let selectedSearchIndex = -1;
let isSearchActive = false;
let queueSelectedIndex = -1;
let isQueueBrowseMode = false;
let queueHideTimeout;
let fadeInterval = null;

// Dynamic API Endpoint Resolver (Auto-switches between Vercel Serverless Functions and local PHP)
function getApiEndpoint(target) {
    const isVercel = window.location.hostname.includes('vercel.app') || 
                     window.location.hostname.includes('now.sh') || 
                     (window.location.protocol === 'https:' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1'));
    if (isVercel) {
        if (target.includes('search.php')) return target.replace('search.php', '/api/search');
        if (target.includes('remote_api.php')) return target.replace('remote_api.php', '/api/remote_api');
    }
    return target;
}

// Resolved YouTube Karaoke IDs Cache (so preset songs always play real karaoke videos)
let resolvedYtCache = {};
try {
    const savedCache = localStorage.getItem('karaoke_resolved_ytids_v1');
    if (savedCache) resolvedYtCache = JSON.parse(savedCache) || {};
} catch (e) { resolvedYtCache = {}; }

// Vocal Scoring & Competition Mode State
let isCompeteMode = true; // เปิดโหมดวัดเสียงอัตโนมัติเบื้องหลัง
let audioContext = null;
let analyser = null;
let microphone = null;
let scoreCheckInterval = null;
let finalScoreCountdown = null;
let pendingScore = 0;
let leaderboard = [];
let scoreHistory = [];
try {
    const savedHistory = localStorage.getItem('karaoke_score_history_v1');
    if (savedHistory) scoreHistory = JSON.parse(savedHistory) || [];
} catch (e) { scoreHistory = []; }

let scoreData = {
    totalChecks: 0,
    vocalDetected: 0,
    pitchedSamples: 0,
    stablePitchSamples: 0,
    goodPowerSamples: 0,
    combo: 0,
    maxCombo: 0,
    liveScore: 0,
    liveEvalText: 'รอเสียงร้อง...',
    liveNote: '--',
    lastFreq: 0,
    isRecording: false
};

// DOM Elements
const queueContainer = document.getElementById('queue-container');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');
const searchResultsContainer = document.getElementById('search-results');
const queueList = document.getElementById('queue-list');
const nowPlayingBox = document.getElementById('now-playing');
const npTitle = document.getElementById('np-title');
const npArtist = document.getElementById('np-artist');
const toastContainer = document.getElementById('toast-container');

// Navigation & Home DOM Elements
const homeScreen = document.getElementById('home-screen');
const toggleHomeBtn = document.getElementById('toggle-home-btn');
const viewPlayerBtn = document.getElementById('view-player-btn');
const brandLogoBtn = document.getElementById('brand-logo-btn');
const topSearchBtn = document.getElementById('top-search-btn');
const toggleQueueBtn = document.getElementById('toggle-queue-btn');
const queueCountBadge = document.getElementById('queue-count-badge');
const emptyPlayerPlaceholder = document.getElementById('empty-player-placeholder');
const homeNpBanner = document.getElementById('home-now-playing-banner');
const homeNpTitle = document.getElementById('home-np-title');

// Vocal Scoring DOM Elements
const competeBtn = document.getElementById('compete-mode-btn');
const navMicDot = document.getElementById('nav-mic-dot');
const endEarlyBtn = document.getElementById('end-early-btn');
const vocalHud = document.getElementById('vocal-hud');
const vocalNoteDisplay = document.getElementById('vocal-note-display');
const vocalVisualizerBars = document.getElementById('vocal-visualizer-bars');
const vocalQualityBadge = document.getElementById('vocal-quality-badge');
const vocalLiveStatus = document.getElementById('vocal-live-status');
const vocalMeterFill = document.getElementById('vocal-meter-fill');
const vocalLiveScoreEl = document.getElementById('vocal-live-score');
const vocalComboBadge = document.getElementById('vocal-combo-badge');

const leaderboardContainer = document.getElementById('podium-area');
const leaderboardList = document.getElementById('podium-display');
const micStatusIcon = document.getElementById('mic-status-icon');
const scoreScreen = document.getElementById('score-screen');
const scoreNumber = document.getElementById('score-number');
const scoreGradeBadge = document.getElementById('score-grade-badge');
const scoreBreakdownBox = document.getElementById('score-breakdown-box');
const scoreVerdictPill = document.getElementById('score-verdict-pill');
const bdPitchVal = document.getElementById('bd-pitch-val');
const bdPitchFill = document.getElementById('bd-pitch-fill');
const bdPowerVal = document.getElementById('bd-power-val');
const bdPowerFill = document.getElementById('bd-power-fill');
const bdRhythmVal = document.getElementById('bd-rhythm-val');
const bdRhythmFill = document.getElementById('bd-rhythm-fill');
const scoreMessage = document.getElementById('score-message');
const scoreCoachAdvice = document.getElementById('score-coach-advice');
const scoreInputBox = document.getElementById('score-name-input-box');
const scoreHeroName = document.getElementById('score-hero-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const scoreCountdownEl = document.getElementById('score-countdown');

// Apply initial classes
searchContainer.classList.add('glass');
queueContainer.classList.add('glass');
queueContainer.classList.add('collapsed');

// ============================================================================
// SONG DATABASE & DYNAMIC YOUTUBE KARAOKE RESOLVER
// ============================================================================
function getActiveSongDB() {
    let customSongs = [];
    const stored = localStorage.getItem('karaoke_songs_v1');
    if (stored) {
        try { customSongs = JSON.parse(stored) || []; } catch (e) { customSongs = []; }
    }
    // Merge custom admin songs with SONGS_DB so Home page always has full catalog
    const baseList = typeof SONGS_DB !== 'undefined' ? SONGS_DB : [];
    const merged = [...baseList];

    customSongs.forEach(cs => {
        const exists = merged.some(b => b.id === cs.id || (b.title === cs.title && b.artist === cs.artist));
        if (!exists) {
            merged.unshift({
                ...cs,
                isHit: true,
                isRecommended: true,
                recTag: '✨ เพลงที่เพิ่มจากระบบจัดการเพลง',
                plays: 'NEW'
            });
        }
    });

    // Apply any resolved karaoke ytIds
    return merged.map(song => {
        const cacheKey = `${song.id}_${song.title}`;
        if (resolvedYtCache[cacheKey]) {
            return { ...song, ytId: resolvedYtCache[cacheKey], isResolved: true };
        }
        return song;
    });
}

const GMM_INTRO_SKIP_SECONDS = 18;

function isGmmSong(song, ytVideoData = null) {
    const checkStr = [
        song ? song.artist : '',
        song ? song.title : '',
        song ? song.channel : '',
        ytVideoData ? ytVideoData.author : '',
        ytVideoData ? ytVideoData.title : ''
    ].join(' ').toLowerCase();

    return checkStr.includes('gmm') || checkStr.includes('grammy') || checkStr.includes('แกรมมี่');
}

async function resolvePlayableKaraokeId(song, altIndex = 0) {
    const cacheKey = `${song.id}_${song.title}`;
    if (altIndex === 0 && resolvedYtCache[cacheKey]) {
        const cached = resolvedYtCache[cacheKey];
        if (typeof cached === 'object' && cached.ytId) {
            if (cached.channel) song.channel = cached.channel;
            return cached.ytId;
        }
        return cached;
    }

    const query = song.searchQuery || `${song.title.replace(/\[.*?\]/g, '').trim()} ${song.artist}`;
    try {
        const res = await fetch(getApiEndpoint('search.php?q=' + encodeURIComponent(query)));
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            const pick = data[Math.min(altIndex, data.length - 1)];
            if (pick && pick.ytId) {
                if (pick.artist) song.channel = pick.artist;
                resolvedYtCache[cacheKey] = pick.ytId;
                localStorage.setItem('karaoke_resolved_ytids_v1', JSON.stringify(resolvedYtCache));
                // Update any visible thumbnails on Home screen
                document.querySelectorAll(`img[data-song-id="${song.id}"]`).forEach(img => {
                    img.src = `https://i.ytimg.com/vi/${pick.ytId}/mqdefault.jpg`;
                });
                return pick.ytId;
            }
        }
    } catch (e) {
        // Fallback to song.ytId if offline
    }
    return song.ytId;
}

// Gently resolve preset song karaoke IDs in background for accurate thumbnails & instant playback
async function prefetchHomeThumbnails() {
    const db = getActiveSongDB();
    for (let i = 0; i < Math.min(db.length, 12); i++) {
        const song = db[i];
        const cacheKey = `${song.id}_${song.title}`;
        if (!resolvedYtCache[cacheKey] && song.searchQuery) {
            await resolvePlayableKaraokeId(song, 0);
            await new Promise(r => setTimeout(r, 350));
        }
    }
}

// ============================================================================
// GOOGLE TV HERO SPOTLIGHT & SECTION NAVIGATION
// ============================================================================
let heroSpotlightSong = null;

function updateHeroSpotlight(song) {
    if (!song) return;
    heroSpotlightSong = song;
    const titleEl = document.getElementById('gtv-hero-title');
    const descEl = document.getElementById('gtv-hero-desc');
    const backdropEl = document.getElementById('gtv-hero-backdrop');
    
    // รักษาคำเชิญชวนบนหัวข้อ ไม่ใช้ชื่อเพลงตามที่ผู้ใช้ต้องการ
    if (titleEl) {
        titleEl.textContent = 'ร้องเพลงโปรดของคุณ ปลดปล่อยพลังเสียงให้สุดเหวี่ยง';
    }
    
    if (descEl) {
        const cleanTitle = song.title.replace(/\[คาราโอเกะ\]|\(คาราโอเกะ\)/g, '').trim();
        descEl.innerHTML = `เลือกเพลงฮิตจากชาร์ต สแกนรีโมทมือถือ หรือพิมพ์ค้นหาแล้วเริ่มร้องได้ทันที &bull; เพลงเด่นแนะนำ: <strong>${escHtml(cleanTitle)}</strong> (${escHtml(song.artist)})`;
    }
    
    // ภาพหน้าปกใช้ภาพ MV/เวทีคอนเสิร์ตที่ไม่มีตัวหนังสือ
    if (backdropEl) {
        backdropEl.style.backgroundImage = "url('hero-banner.jpg')";
    }
}

function playHeroSpotlightSong() {
    if (heroSpotlightSong) {
        insertNextAndPlay(heroSpotlightSong);
        closeHomeScreen();
    } else {
        playRandomHitSong();
    }
}

function queueHeroSpotlightSong() {
    if (heroSpotlightSong) {
        addToQueue(heroSpotlightSong);
    }
}

function scrollToHomeSection(sectionId) {
    if (!isHomeOpen) {
        openHomeScreen();
    }
    const el = document.getElementById(sectionId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Update active nav tab indicator
    document.querySelectorAll('.gtv-tab-btn').forEach(btn => btn.classList.remove('active'));
    const matchingBtn = document.querySelector(`.gtv-tab-btn[onclick*="${sectionId}"]`);
    if (matchingBtn) {
        matchingBtn.classList.add('active');
    }
}

function updateGtvClock() {
    const clockEl = document.getElementById('gtv-top-clock');
    if (!clockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${hours}:${mins}`;
}

// ============================================================================
// HOME SCREEN RENDERING (เพลงฮิต, ชาร์ตเพลง, สถานีเพลง, เพลย์ลิสต์, เพลงแนะนำ)
// ============================================================================
let recommendedShuffleSeed = 0;

function renderHomeScreen() {
    const songs = getActiveSongDB();
    if (songs && songs.length > 0) {
        const spotlightSong = songs.find(s => s.isRecommended) || songs[0];
        updateHeroSpotlight(spotlightSong);
    }
    renderHitSongs(songs);
    renderTopCharts(songs);
    renderMusicStations();
    renderPlaylists(songs);
    renderRecommendedSongs(songs);
}

function createSongCardHTML(song, badgeText = '', showRecTag = false) {
    const thumbUrl = `https://i.ytimg.com/vi/${song.ytId}/mqdefault.jpg`;
    const safeSongJson = encodeURIComponent(JSON.stringify(song));
    return `
        <div class="song-card">
            <div class="sc-thumb-wrap">
                <img src="${thumbUrl}" data-song-id="${song.id}" alt="${escHtml(song.title)}" loading="lazy"
                     onerror="this.src='cover-bg.jpg'">
                ${badgeText ? `<span class="sc-badge">${badgeText}</span>` : ''}
                ${song.plays ? `<span class="sc-views"><i class="fas fa-headphones"></i> ${song.plays}</span>` : ''}
            </div>
            <div class="sc-body">
                ${showRecTag && song.recTag ? `<div class="sc-rec-tag">${escHtml(song.recTag)}</div>` : ''}
                <div class="sc-title" title="${escHtml(song.title)}">${escHtml(song.title)}</div>
                <div class="sc-artist"><i class="fas fa-microphone" style="font-size:10px;margin-right:4px"></i>${escHtml(song.artist)}</div>
                <div class="sc-actions">
                    <button class="sc-btn play" onclick="handleSongAction('${safeSongJson}', 'play')">
                        <i class="fas fa-play"></i> ร้องเลย
                    </button>
                    <button class="sc-btn queue" onclick="handleSongAction('${safeSongJson}', 'queue')">
                        <i class="fas fa-plus"></i> เข้าคิว
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderHitSongs(songs) {
    const container = document.getElementById('hit-songs-grid');
    if (!container) return;
    const hitSongs = songs.filter(s => s.isHit).slice(0, 4);
    container.innerHTML = hitSongs.map(s => createSongCardHTML(s, '🔥 HIT', false)).join('');
}

function renderTopCharts(songs) {
    const container = document.getElementById('top-chart-list');
    if (!container) return;
    const chartSongs = songs
        .filter(s => s.chartRank && s.chartRank > 0)
        .sort((a, b) => a.chartRank - b.chartRank)
        .slice(0, 4);

    container.innerHTML = chartSongs.map(song => {
        const thumbUrl = `https://i.ytimg.com/vi/${song.ytId}/mqdefault.jpg`;
        const safeSongJson = encodeURIComponent(JSON.stringify(song));
        let trendHtml = '<span class="chart-trend same">●</span>';
        if (song.chartTrend === 'up') trendHtml = '<span class="chart-trend up">▲</span>';
        if (song.chartTrend === 'down') trendHtml = '<span class="chart-trend down">▼</span>';
        if (song.chartTrend === 'new') trendHtml = '<span class="chart-trend new">NEW</span>';

        return `
            <div class="chart-row rank-${song.chartRank}">
                <div class="chart-rank">${song.chartRank}</div>
                ${trendHtml}
                <img src="${thumbUrl}" data-song-id="${song.id}" class="chart-thumb" alt="" loading="lazy" onerror="this.src='cover-bg.jpg'">
                <div class="chart-info">
                    <div class="chart-title">${escHtml(song.title)}</div>
                    <div class="chart-artist">${escHtml(song.artist)} &bull; <small style="color:var(--highlight)">${song.plays || ''} ครั้ง</small></div>
                </div>
                <div class="chart-actions">
                    <button class="chart-icon-btn play" title="เล่นทันที" onclick="handleSongAction('${safeSongJson}', 'play')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="chart-icon-btn queue" title="เพิ่มเข้าคิว" onclick="handleSongAction('${safeSongJson}', 'queue')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderMusicStations() {
    const container = document.getElementById('stations-grid');
    if (!container || typeof MUSIC_STATIONS === 'undefined') return;

    const stationsToShow = MUSIC_STATIONS.slice(0, 4);
    container.innerHTML = stationsToShow.map(st => `
        <div class="station-card" style="background: ${st.gradient}" onclick="startMusicStation('${st.id}')">
            <i class="fas ${st.icon} st-bg-icon"></i>
            <div>
                <div class="st-top">
                    <span class="st-badge"><i class="fas fa-broadcast-tower"></i> ${st.badge}</span>
                </div>
                <div class="st-title">${escHtml(st.name)}</div>
                <div class="st-sub">${escHtml(st.subtitle)}</div>
            </div>
            <div class="st-play-pill">
                <i class="fas fa-play-circle"></i> เปิดสถานีเพลงนี้ต่อเนื่อง
            </div>
        </div>
    `).join('');
}

function getSongsForPlaylist(playlistId, allSongs = null) {
    const pl = (typeof KARAOKE_PLAYLISTS !== 'undefined') ? KARAOKE_PLAYLISTS.find(x => x.id === playlistId) : null;
    const songs = allSongs || getActiveSongDB();
    if (!pl) return [];
    if (Array.isArray(pl.songIds) && pl.songIds.length > 0) {
        return pl.songIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
    }
    return songs.filter(s => Array.isArray(s.playlistIds) && s.playlistIds.includes(playlistId));
}

function renderPlaylists(songs) {
    const container = document.getElementById('playlists-grid');
    if (!container || typeof KARAOKE_PLAYLISTS === 'undefined') return;

    const playlistsToShow = KARAOKE_PLAYLISTS.slice(0, 4);
    container.innerHTML = playlistsToShow.map(pl => {
        const plSongs = getSongsForPlaylist(pl.id, songs);
        const previewHtml = plSongs.slice(0, 3).map((s, idx) =>
            `<div>${idx + 1}. ${escHtml(s.title)} <span style="color:#888">- ${escHtml(s.artist)}</span></div>`
        ).join('');

        return `
            <div class="playlist-card">
                <div class="pl-head">
                    <div class="pl-icon-box" style="background: ${pl.gradient}">
                        <i class="fas ${pl.icon}"></i>
                    </div>
                    <div class="pl-info">
                        <h3>${escHtml(pl.title)}</h3>
                        <p>${escHtml(pl.description)}</p>
                    </div>
                </div>
                <div class="pl-song-preview">
                    ${previewHtml || '<div>รวมเพลงคัดพิเศษ</div>'}
                </div>
                <div class="pl-actions">
                    <button class="sc-btn play" onclick="playPlaylist('${pl.id}', true)">
                        <i class="fas fa-play"></i> เล่นเพลย์ลิสต์ (${plSongs.length})
                    </button>
                    <button class="sc-btn queue" onclick="openPlaylistModal('${pl.id}')">
                        <i class="fas fa-list-ul"></i> ดูรายชื่อเพลง
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecommendedSongs(songs) {
    const container = document.getElementById('recommended-songs-grid');
    if (!container) return;
    let recSongs = songs.filter(s => s.isRecommended);
    if (recommendedShuffleSeed > 0) {
        recSongs = [...songs].sort(() => Math.random() - 0.5);
    }
    container.innerHTML = recSongs.slice(0, 5).map(s => createSongCardHTML(s, '✨ แนะนำ', true)).join('');
}

function shuffleRecommendedSongs() {
    recommendedShuffleSeed++;
    renderRecommendedSongs(getActiveSongDB());
    showToast('✨ สุ่มรายการเพลงแนะนำชุดใหม่แล้ว!');
}

function handleSongAction(encodedSong, mode) {
    try {
        const song = JSON.parse(decodeURIComponent(encodedSong));
        if (mode === 'play') {
            insertNextAndPlay(song);
            closeHomeScreen();
        } else {
            addToQueue(song);
        }
    } catch (e) {
        console.error('Song action error:', e);
    }
}

function playRandomHitSong() {
    const songs = getActiveSongDB();
    if (songs.length === 0) return;
    const pick = songs[Math.floor(Math.random() * songs.length)];
    insertNextAndPlay(pick);
    closeHomeScreen();
}

function queueAllHitSongs() {
    const hits = getActiveSongDB().filter(s => s.isHit);
    hits.forEach(s => queue.push({ ...s }));
    saveQueue();
    renderQueue();
    expandQueue();
    showToast(`🔥 เพิ่มเพลงฮิต ${hits.length} เพลงลงคิวแล้ว!`);
    if (!isPlaying) {
        playNextInQueue();
    }
}

function playAllTopChart() {
    const charts = getActiveSongDB()
        .filter(s => s.chartRank && s.chartRank > 0)
        .sort((a, b) => a.chartRank - b.chartRank);
    if (charts.length === 0) return;
    queue = charts.slice(1).concat(queue);
    saveQueue();
    renderQueue();
    playSong(charts[0]);
    closeHomeScreen();
    showToast('🏆 เริ่มเล่นชาร์ตเพลงฮิต Top 10!');
}

async function startMusicStation(stationId) {
    const st = (typeof MUSIC_STATIONS !== 'undefined') ? MUSIC_STATIONS.find(x => x.id === stationId) : null;
    if (!st) return;

    const songs = getActiveSongDB().filter(s => Array.isArray(s.stationIds) && s.stationIds.includes(stationId));
    const shuffled = [...songs].sort(() => Math.random() - 0.5);

    if (shuffled.length > 0) {
        const firstSong = shuffled[0];
        const rest = shuffled.slice(1);
        queue = [...rest, ...queue];
        saveQueue();
        renderQueue();
        playSong(firstSong);
        closeHomeScreen();
        showToast(`📻 กำลังเปิด "${st.name}" (${shuffled.length} เพลงต่อเนื่อง)`);
    }

    // Also fetch extra fresh songs for this station from YouTube in background
    if (st.searchKeyword) {
        try {
            const res = await fetch(getApiEndpoint('search.php?q=' + encodeURIComponent(st.searchKeyword)));
            const ytSongs = await res.json();
            if (Array.isArray(ytSongs) && ytSongs.length > 0) {
                let added = 0;
                ytSongs.slice(0, 5).forEach(ys => {
                    if (!queue.some(q => q.ytId === ys.ytId)) {
                        queue.push(ys);
                        added++;
                    }
                });
                if (added > 0) {
                    saveQueue();
                    renderQueue();
                }
            }
        } catch (e) { }
    }
}

function openPlaylistModal(playlistId) {
    const pl = (typeof KARAOKE_PLAYLISTS !== 'undefined') ? KARAOKE_PLAYLISTS.find(x => x.id === playlistId) : null;
    if (!pl) return;
    const songs = getSongsForPlaylist(playlistId);

    document.getElementById('pm-title').innerText = pl.title;
    document.getElementById('pm-desc').innerText = pl.description;
    document.getElementById('pm-header-bg').style.background = pl.gradient;

    document.getElementById('pm-play-all-btn').onclick = () => {
        closePlaylistModal();
        playPlaylist(playlistId, true);
    };
    document.getElementById('pm-queue-all-btn').onclick = () => {
        closePlaylistModal();
        playPlaylist(playlistId, false);
    };

    const listEl = document.getElementById('pm-song-list');
    listEl.innerHTML = songs.map((song, idx) => {
        const safeSongJson = encodeURIComponent(JSON.stringify(song));
        const thumbUrl = `https://i.ytimg.com/vi/${song.ytId}/mqdefault.jpg`;
        return `
            <div class="chart-row">
                <div class="chart-rank" style="font-size:16px">${idx + 1}</div>
                <img src="${thumbUrl}" data-song-id="${song.id}" class="chart-thumb" alt="">
                <div class="chart-info">
                    <div class="chart-title">${escHtml(song.title)}</div>
                    <div class="chart-artist">${escHtml(song.artist)}</div>
                </div>
                <div class="chart-actions">
                    <button class="sc-btn play" onclick="closePlaylistModal(); handleSongAction('${safeSongJson}', 'play')">
                        <i class="fas fa-play"></i> ร้องเลย
                    </button>
                    <button class="sc-btn queue" onclick="handleSongAction('${safeSongJson}', 'queue')">
                        <i class="fas fa-plus"></i> เข้าคิว
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('playlist-modal').classList.remove('hidden');
}

function closePlaylistModal() {
    document.getElementById('playlist-modal').classList.add('hidden');
}

function playPlaylist(playlistId, playImmediately = true) {
    const pl = (typeof KARAOKE_PLAYLISTS !== 'undefined') ? KARAOKE_PLAYLISTS.find(x => x.id === playlistId) : null;
    const songs = getSongsForPlaylist(playlistId);
    if (songs.length === 0) return;

    if (playImmediately) {
        const first = songs[0];
        queue = songs.slice(1).concat(queue);
        saveQueue();
        renderQueue();
        playSong(first);
        closeHomeScreen();
        showToast(`💿 เริ่มเล่นเพลย์ลิสต์ "${pl ? pl.title : ''}"`);
    } else {
        songs.forEach(s => queue.push({ ...s }));
        saveQueue();
        renderQueue();
        expandQueue();
        showToast(`➕ เพิ่มเพลย์ลิสต์ "${pl ? pl.title : ''}" (${songs.length} เพลง) เข้าคิวแล้ว!`);
        if (!isPlaying) playNextInQueue();
    }
}

// Home Screen Filter Pills
document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        const allSections = document.querySelectorAll('.home-section');
        if (target === 'all') {
            allSections.forEach(sec => sec.classList.remove('hidden'));
        } else {
            allSections.forEach(sec => {
                if (sec.id === target) sec.classList.remove('hidden');
                else sec.classList.add('hidden');
            });
        }
    });
});

// Toggle Home vs Player View
function openHomeScreen() {
    isHomeOpen = true;
    document.body.classList.add('home-active');
    homeScreen.classList.remove('hidden-home');
    toggleHomeBtn.classList.add('active');
    viewPlayerBtn.classList.remove('active');
    collapseQueue();
    if (queueContainer) {
        queueContainer.style.setProperty('display', 'none', 'important');
    }
    updateHomeNowPlayingBanner();
    syncHostToServer();
}

function closeHomeScreen() {
    isHomeOpen = false;
    document.body.classList.remove('home-active');
    homeScreen.classList.add('hidden-home');
    toggleHomeBtn.classList.remove('active');
    viewPlayerBtn.classList.add('active');
    if (queueContainer) {
        queueContainer.style.removeProperty('display');
    }
    syncHostToServer();
}

function updateHomeNowPlayingBanner() {
    if (isPlaying && currentPlayingSong) {
        homeNpBanner.classList.remove('hidden');
        homeNpTitle.innerText = `${currentPlayingSong.title} - ${currentPlayingSong.artist}`;
        emptyPlayerPlaceholder.classList.add('hidden');
    } else {
        homeNpBanner.classList.add('hidden');
        emptyPlayerPlaceholder.classList.remove('hidden');
    }
}

if (toggleHomeBtn) toggleHomeBtn.addEventListener('click', openHomeScreen);
if (viewPlayerBtn) viewPlayerBtn.addEventListener('click', closeHomeScreen);
if (brandLogoBtn) brandLogoBtn.addEventListener('click', openHomeScreen);
if (topSearchBtn) {
    topSearchBtn.addEventListener('click', () => {
        openSearch();
        setTimeout(() => searchInput.focus(), 50);
    });
}
if (toggleQueueBtn) {
    toggleQueueBtn.addEventListener('click', () => {
        if (isHomeOpen) {
            closeHomeScreen();
            setTimeout(() => {
                expandQueue(false);
            }, 50);
            return;
        }
        if (queueContainer.classList.contains('collapsed')) {
            expandQueue(false);
        } else {
            collapseQueue();
        }
    });
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


// Mobile search button logic (Original Feature)
const mobileSearchBtn = document.getElementById('mobile-search-btn');
if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', () => {
        openSearch();
        setTimeout(() => searchInput.focus(), 50);
    });
}

// Allow clicking the pulsing tab to reveal Queue (Original Feature)
if (queueContainer) {
    queueContainer.addEventListener('click', () => {
        if (queueContainer.classList.contains('collapsed')) {
            expandQueue();
        }
    });
}

// ============================================================================
// QUEUE DRAWER & YOUTUBE PLAYER
// ============================================================================
function expandQueue(autoCollapse = true) {
    if (isHomeOpen) return; // อยู่หน้าแรก ไม่ต้องกางแถบคิวเพลง
    queueContainer.classList.remove('collapsed');
    resetQueueHideTimer();
}

function resetQueueHideTimer() {
    clearTimeout(queueHideTimeout);
    queueHideTimeout = setTimeout(() => {
        collapseQueue();
    }, 4500); // หากไม่มีการกดหรือขยับใน 4.5 วินาที ให้ยุบลงอัตโนมัติ
}

function collapseQueue() {
    isQueueBrowseMode = false;
    queueSelectedIndex = -1;
    clearTimeout(queueHideTimeout);
    queueContainer.classList.add('collapsed');
    renderQueue();
}

// เมื่อนำเมาส์ไปชี้หรือขยับในกล่องคิว ให้ต่อเวลาเปิดออกไป
if (queueContainer) {
    queueContainer.addEventListener('mousemove', () => {
        if (!queueContainer.classList.contains('collapsed')) {
            resetQueueHideTimer();
        }
    });
    queueContainer.addEventListener('mouseleave', () => {
        if (!queueContainer.classList.contains('collapsed')) {
            resetQueueHideTimer();
        }
    });
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
            'autoplay': 1,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'rel': 0,
            'modestbranding': 1,
            'iv_load_policy': 3,
            'playsinline': 1,
            'enablejsapi': 1,
            'origin': window.location.origin,
            'widget_referrer': window.location.href
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady() {
    showToast("ระบบพร้อมใช้งานแล้ว เริ่มพิมพ์ชื่อเพลงได้เลย!");
}

function onPlayerStateChange(event) {
    const playIcon = document.getElementById('np-play-icon');
    if (event.data === YT.PlayerState.ENDED) {
        // บันทึกคะแนนเพลงที่เพิ่งร้องเสร็จอัตโนมัติลงประวัติ (โดยไม่แสดง popup ขัดจังหวะ)
        finalizeAndRecordScore(false);

        // เล่นเพลงถัดไปทันที
        playNextInQueue();
    } else if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        if (playIcon) playIcon.className = 'fas fa-pause';

        // ตรวจสอบจากข้อมูลวิดีโอ YouTube โดยตรง หากเป็นเพลงของช่องในเครือ GMM ให้ข้ามไปวินาทีที่ 18 อัตโนมัติ
        if (player && typeof player.getVideoData === 'function' && typeof player.getCurrentTime === 'function') {
            const vData = player.getVideoData();
            const curTime = player.getCurrentTime();
            if (isGmmSong(currentPlayingSong, vData) && curTime < (GMM_INTRO_SKIP_SECONDS - 1)) {
                if (!currentPlayingSong || !currentPlayingSong._gmmSkipped) {
                    if (currentPlayingSong) currentPlayingSong._gmmSkipped = true;
                    player.seekTo(GMM_INTRO_SKIP_SECONDS, true);
                    showToast(`⏭ ข้ามอินโทร GMM ${GMM_INTRO_SKIP_SECONDS} วินาทีอัตโนมัติ`);
                }
            }
        }

        // เริ่มวัดเสียงอัตโนมัติเบื้องหลัง
        startScoring();
        updateHomeNowPlayingBanner();
        syncHostToServer();
    } else if (event.data === YT.PlayerState.PAUSED || event.data === -1) {
        if (playIcon) playIcon.className = 'fas fa-play';
        syncHostToServer();
    }
}

async function onPlayerError(event) {
    // If video is blocked from embedding (101 / 150) or unavailable (2 / 100),
    // automatically search for an alternative playable karaoke video!
    if (currentPlayingSong && (!currentPlayingSong._retryCount || currentPlayingSong._retryCount < 2)) {
        currentPlayingSong._retryCount = (currentPlayingSong._retryCount || 0) + 1;
        showToast(`🔄 กำลังสลับแหล่งวิดีโอคาราโอเกะสำรองให้โดยอัตโนมัติ...`);
        const altId = await resolvePlayableKaraokeId(currentPlayingSong, currentPlayingSong._retryCount);
        if (altId && altId !== currentPlayingSong.ytId) {
            currentPlayingSong.ytId = altId;
            player.loadVideoById({ videoId: altId, startSeconds: 0 });
            player.playVideo();
            return;
        }
    }

    showToast(`⚠️ วิดีโอนี้ไม่สามารถเล่นได้ กำลังข้ามไปเพลงถัดไป...`);
    setTimeout(playNextInQueue, 2500);
}

// ============================================================================
// SMART TV D-PAD SPATIAL NAVIGATION (รีโมททีวี Hisense / Android TV / แป้นพิมพ์)
// ============================================================================
let currentTvFocusEl = null;

function getTvFocusableElements() {
    const selector = `
        .gtv-search-trigger:not([disabled]),
        .gtv-tab-btn:not([disabled]),
        .gtv-pill-btn:not([disabled]),
        .gtv-icon-btn:not([disabled]),
        .gtv-btn-play:not([disabled]),
        .gtv-btn-queue:not([disabled]),
        .gtv-btn-glass:not([disabled]),
        .gtv-app-card:not([disabled]),
        .song-card .sc-btn:not([disabled]),
        .chart-row:not([disabled]),
        .chart-icon-btn:not([disabled]),
        .station-card:not([disabled]),
        .playlist-card .sc-btn:not([disabled]),
        .ctrl-circle-btn:not([disabled]),
        .search-item:not([disabled]),
        .modal-close-btn:not([disabled])
    `;
    const all = Array.from(document.querySelectorAll(selector));
    return all.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
    });
}

function setTvFocus(el) {
    if (!el || el.id === 'search-input') return;
    if (currentTvFocusEl) {
        currentTvFocusEl.classList.remove('tv-focused');
    }
    currentTvFocusEl = el;
    currentTvFocusEl.classList.add('tv-focused');
    currentTvFocusEl.focus();
    currentTvFocusEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

function navigateTvSpatial(direction) {
    const focusables = getTvFocusableElements();
    if (focusables.length === 0) return;

    if (!currentTvFocusEl || !document.body.contains(currentTvFocusEl) || !focusables.includes(currentTvFocusEl)) {
        const initial = document.getElementById('gtv-hero-play-btn') || document.querySelector('.gtv-btn-play') || focusables[0];
        setTvFocus(initial);
        return;
    }

    const curRect = currentTvFocusEl.getBoundingClientRect();
    const curCenter = {
        x: curRect.left + curRect.width / 2,
        y: curRect.top + curRect.height / 2
    };

    let bestEl = null;
    let minDistance = Infinity;

    for (const el of focusables) {
        if (el === currentTvFocusEl) continue;
        const r = el.getBoundingClientRect();
        const center = {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2
        };

        const dx = center.x - curCenter.x;
        const dy = center.y - curCenter.y;

        if (direction === 'right' && dx <= 5) continue;
        if (direction === 'left' && dx >= -5) continue;
        if (direction === 'down' && dy <= 5) continue;
        if (direction === 'up' && dy >= -5) continue;

        const primaryDist = Math.abs(direction === 'left' || direction === 'right' ? dx : dy);
        const secondaryDist = Math.abs(direction === 'left' || direction === 'right' ? dy : dx);

        const score = primaryDist * 1.0 + secondaryDist * 2.5;

        if (score < minDistance) {
            minDistance = score;
            bestEl = el;
        }
    }

    if (bestEl) {
        setTvFocus(bestEl);
    }
}

// ============================================================================
// KEYBOARD & LIVE SEARCH LOGIC
// ============================================================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.id !== 'search-input') {
        return;
    }

    const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

    // 1. TV Remote Back Buttons (Hisense VIDAA keycode 10009, WebOS 461, Escape 27, Backspace 8)
    const isTvBack = e.key === 'Escape' || e.keyCode === 10009 || e.keyCode === 461;
    if (isTvBack) {
        if (isSearchActive) {
            closeSearch();
            e.preventDefault();
            return;
        }
        const remoteModal = document.getElementById('remote-modal');
        if (remoteModal && !remoteModal.classList.contains('hidden')) {
            closeRemoteModal();
            e.preventDefault();
            return;
        }
        const playlistModal = document.getElementById('playlist-modal');
        if (playlistModal && !playlistModal.classList.contains('hidden')) {
            closePlaylistModal();
            e.preventDefault();
            return;
        }
        if (!isHomeOpen) {
            openHomeScreen();
            e.preventDefault();
            return;
        }
    }

    // 2. When on Home Screen: TV Remote D-Pad Navigation (ขึ้น/ลง/ซ้าย/ขวา/OK บนรีโมททีวี)
    if (isHomeOpen && !isSearchActive) {
        if (e.key === 'ArrowUp' || e.keyCode === 38) {
            navigateTvSpatial('up');
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowDown' || e.keyCode === 40) {
            navigateTvSpatial('down');
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowLeft' || e.keyCode === 37) {
            navigateTvSpatial('left');
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowRight' || e.keyCode === 39) {
            navigateTvSpatial('right');
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter' || e.keyCode === 13) {
            if (currentTvFocusEl) {
                currentTvFocusEl.click();
                e.preventDefault();
                return;
            }
        }
    }

    if (isSearchActive) {
        if (e.key === 'Escape') {
            closeSearch();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowDown') {
            selectNextSearchItem();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowUp') {
            selectPrevSearchItem();
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter') {
            if (searchResults.length > 0 && selectedSearchIndex >= 0) {
                const song = searchResults[selectedSearchIndex];
                if (e.ctrlKey) {
                    insertNextAndPlay(song);
                } else {
                    addToQueue(song);
                }
                closeSearch();
                closeHomeScreen();
            } else {
                const rawQuery = searchInput.value.trim();
                if (rawQuery.length > 0) {
                    clearTimeout(searchDebounce);
                    closeSearch();
                    closeHomeScreen();
                    showToast(`🔍 กำลังค้นหาเพลง "${rawQuery}"...`);
                    fetch(getApiEndpoint('search.php?q=' + encodeURIComponent(rawQuery)))
                        .then(res => res.json())
                        .then(ytResults => {
                            if (Array.isArray(ytResults) && ytResults.length > 0) {
                                addToQueue(ytResults[0]);
                                closeHomeScreen();
                            } else {
                                showToast('⚠️ ไม่พบเพลงที่ค้นหา ลองพิมพ์คำค้นหาอื่น');
                            }
                        })
                        .catch(() => {
                            showToast('⚠️ เกิดข้อผิดพลาดในการค้นหาเพลง');
                        });
                }
            }
            e.preventDefault();
            return;
        }
        if (e.target !== searchInput && isPrintable) {
            searchInput.focus();
            searchInput.value += e.key;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            e.preventDefault();
            return;
        }
        return;
    }

    // 3. Global Shortcuts when in Karaoke Player view (watching video)
    if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'End') {
        skipSong();
        e.preventDefault();
        return;
    }
    if (e.key === 'Home') {
        replayCurrentSong();
        e.preventDefault();
        return;
    }
    if (e.key === ' ') { // Space bar
        togglePausePlayWithFade();
        e.preventDefault();
        return;
    }

    // 3. Global Discovery / Start Search & Queue Browsing
    if (!isSearchActive) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (queue.length > 0) {
                isQueueBrowseMode = true;
                expandQueue(true);
                if (e.key === 'ArrowDown') {
                    queueSelectedIndex = Math.min(queueSelectedIndex + 1, queue.length - 1);
                } else {
                    queueSelectedIndex = Math.max(queueSelectedIndex - 1, 0);
                }
                renderQueue();
                resetQueueHideTimer();
                e.preventDefault();
            }
            return;
        }

        if (e.key === 'Enter') {
            if (isQueueBrowseMode && queueSelectedIndex >= 0 && queueSelectedIndex < queue.length) {
                const moveSong = queue.splice(queueSelectedIndex, 1)[0];
                queue.unshift(moveSong);
                saveQueue();
                isQueueBrowseMode = false;
                queueSelectedIndex = -1;
                playNextInQueue();
                renderQueue();
                collapseQueue();
                closeHomeScreen();
                e.preventDefault();
            }
            return;
        }

        if (e.key === 'Escape' && isQueueBrowseMode) {
            isQueueBrowseMode = false;
            queueSelectedIndex = -1;
            renderQueue();
            collapseQueue();
            return;
        }

        // Kick off search on printable keys or Backspace
        if (isPrintable || e.key === 'Backspace') {
            isQueueBrowseMode = false;
            renderQueue();
            openSearch();

            searchInput.focus();
            if (isPrintable) {
                searchInput.value = e.key;
            }

            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            e.preventDefault();
        }
    }
});

let searchDebounce;

function showInitialSearchSuggestions() {
    const hits = getActiveSongDB().filter(s => s.isRecommended || s.isHit).slice(0, 8);
    renderSearchResults(hits, '🔥 เพลงแนะนำยอดนิยม (กดเลือกหรือพิมพ์ค้นหาได้ทันที)');
}

searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (q === '') {
        showInitialSearchSuggestions();
        return;
    }

    const isValidKaraoke = (title, artist) => {
        const t = (title || '').toLowerCase();
        const a = (artist || '').toLowerCase();
        if (t.includes('official mv') || t.includes('official music video') || t.includes('official audio')) {
            return false;
        }
        return t.includes('karaoke') || t.includes('คาราโอเกะ') ||
               t.includes('instrumental') || t.includes('backing track') ||
               t.includes('ตัดเสียงร้อง') || a.includes('karaoke') || a.includes('คาราโอเกะ') ||
               t.includes('ดนตรีสด') || t.includes('cover');
    };

    const localResults = getActiveSongDB().filter(song => {
        const matchQ = (song.title || '').toLowerCase().includes(q) || 
                       (song.artist || '').toLowerCase().includes(q) ||
                       (song.searchQuery || '').toLowerCase().includes(q);
        return matchQ && !(song.title.toLowerCase().includes('official mv'));
    }).slice(0, 8);

    if (localResults.length > 0) {
        renderSearchResults(localResults, `✨ ผลการค้นหาเพลงในเครื่องสำหรับ "${e.target.value.trim()}"`);
    }

    if (q.length >= 1) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'yt-search-loading';
        loadingDiv.style = "text-align:center; padding:12px; color:#aaa; font-size:13px; font-style:italic;";
        loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังค้นหาเพลงคาราโอเกะออนไลน์...';
        searchResultsContainer.appendChild(loadingDiv);

        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            fetch(getApiEndpoint('search.php?q=' + encodeURIComponent(q)))
                .then(res => res.json())
                .then(ytResults => {
                    const loader = document.getElementById('yt-search-loading');
                    if (loader) loader.remove();

                    if (Array.isArray(ytResults) && ytResults.length > 0) {
                        const filteredYt = ytResults.filter(song => isValidKaraoke(song.title, song.artist));
                        const listToUse = filteredYt.length > 0 ? filteredYt : ytResults;
                        const combined = [...localResults, ...listToUse];
                        const unique = [];
                        const map = new Map();
                        for (const item of combined) {
                            if (!map.has(item.ytId)) {
                                map.set(item.ytId, true);
                                unique.push(item);
                            }
                        }
                        renderSearchResults(unique, `🔍 ผลการค้นหาสำหรับ "${e.target.value.trim()}"`);
                    } else if (localResults.length > 0) {
                        renderSearchResults(localResults, `✨ ผลการค้นหาสำหรับ "${e.target.value.trim()}"`);
                    } else {
                        renderSearchResults([], null, e.target.value.trim());
                    }
                })
                .catch(() => {
                    const loader = document.getElementById('yt-search-loading');
                    if (loader) loader.remove();
                    if (localResults.length > 0) {
                        renderSearchResults(localResults, `✨ ผลการค้นหาสำหรับ "${e.target.value.trim()}"`);
                    } else {
                        renderSearchResults([], null, e.target.value.trim());
                    }
                });
        }, 400);
    }
});

function openSearch() {
    isSearchActive = true;
    if (currentTvFocusEl) {
        currentTvFocusEl.classList.remove('tv-focused');
        currentTvFocusEl = null;
    }
    document.querySelectorAll('.tv-focused').forEach(node => node.classList.remove('tv-focused'));
    searchContainer.classList.remove('hidden');
    showInitialSearchSuggestions();
}

function closeSearch() {
    isSearchActive = false;
    searchContainer.classList.add('hidden');
    searchInput.value = '';
    renderSearchResults([]);
    searchInput.blur();
}

function renderSearchResults(results, headerTitle = null, emptyQuery = null) {
    searchResults = results || [];
    searchResultsContainer.innerHTML = '';

    if (searchResults.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style = "padding:16px 14px; text-align:center;";
        if (emptyQuery) {
            emptyDiv.innerHTML = `
                <div style="color:#f59e0b; font-size:14px; font-weight:600; margin-bottom:8px;">
                    <i class="fas fa-search"></i> ไม่พบเพลงคาราโอเกะสำหรับ "${escHtml(emptyQuery)}"
                </div>
                <div style="color:#aaa; font-size:12px; margin-bottom:12px;">
                    แนะนำลองค้นหาด้วยชื่อศิลปิน หรือเลือกร้องเพลงแนะนำยอดนิยมด้านล่างนี้ได้เลย:
                </div>
            `;
        } else {
            emptyDiv.innerHTML = `
                <div style="color:#aaa; font-size:13px; margin-bottom:8px;">
                    <i class="fas fa-keyboard"></i> พิมพ์ชื่อเพลงหรือศิลปินเพื่อค้นหา
                </div>
                <div style="color:#888; font-size:12px; margin-bottom:10px;">
                    หรือเลือกเพลงแนะนำยอดนิยมด้านล่างนี้:
                </div>
            `;
        }
        searchResultsContainer.appendChild(emptyDiv);

        // Fallback to top hits so list is never empty
        const fallbackHits = getActiveSongDB().filter(s => s.isRecommended || s.isHit).slice(0, 6);
        searchResults = fallbackHits;
        selectedSearchIndex = 0;
        fallbackHits.forEach((song, idx) => {
            const div = createSearchResultElement(song, idx === 0);
            searchResultsContainer.appendChild(div);
        });
        return;
    }

    if (headerTitle) {
        const headerDiv = document.createElement('div');
        headerDiv.style = "padding:8px 14px; color:#f8fafc; font-size:12px; font-weight:700; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:6px; opacity:0.85;";
        headerDiv.innerHTML = headerTitle;
        searchResultsContainer.appendChild(headerDiv);
    }

    selectedSearchIndex = 0;
    searchResults.forEach((song, idx) => {
        const div = createSearchResultElement(song, idx === 0);
        searchResultsContainer.appendChild(div);
    });
}

function createSearchResultElement(song, isSelected) {
    const div = document.createElement('div');
    div.className = `result-item ${isSelected ? 'selected' : ''}`;
    const ytId = song.ytId || '3kWXCvbavGk';
    const thumbUrl = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
    div.innerHTML = `
        <img src="${thumbUrl}" class="result-thumbnail" alt="thumbnail" loading="lazy" onerror="this.src='cover-bg.jpg'">
        <div class="result-info">
            <div class="result-title">${escHtml(song.title)}</div>
            <div class="result-artist">${escHtml(song.artist || 'Karaoke')}</div>
        </div>
    `;
    div.onclick = () => {
        addToQueue(song);
        closeSearch();
        closeHomeScreen();
    };
    return div;
}

function updateSearchSelectionUI() {
    const items = searchResultsContainer.querySelectorAll('.result-item');
    items.forEach((item, idx) => {
        if (idx === selectedSearchIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: "nearest" });
        } else {
            item.classList.remove('selected');
        }
    });
}

function selectNextSearchItem() {
    if (searchResults.length === 0) return;
    selectedSearchIndex = (selectedSearchIndex + 1) % searchResults.length;
    updateSearchSelectionUI();
}

function selectPrevSearchItem() {
    if (searchResults.length === 0) return;
    selectedSearchIndex = (selectedSearchIndex - 1 + searchResults.length) % searchResults.length;
    updateSearchSelectionUI();
}

// ============================================================================
// QUEUE & PLAYBACK CONTROLS
// ============================================================================
function addToQueue(song, requestedBy = '') {
    const item = { ...song };
    if (requestedBy) item.requestedBy = requestedBy;
    queue.push(item);
    saveQueue();
    showToast(`เพิ่ม 🎵 ${song.title} ลงคิวแล้ว${requestedBy ? ' (โดย ' + requestedBy + ')' : ''}`);
    expandQueue(); // กางรายการคิวให้เห็นเพลงที่เพิ่มเข้ามา (สามารถกดลัดคิวที่รายการคิวได้)
    renderQueue();

    if (!isPlaying) {
        closeHomeScreen();
        playNextInQueue();
    } else {
        syncHostToServer();
    }
}

function insertNextAndPlay(song, requestedBy = '') {
    const item = { ...song };
    if (requestedBy) item.requestedBy = requestedBy;
    showToast(`▶️ กำลังเปิดเพลง 🎵 ${song.title}`);
    queue.unshift(item);
    saveQueue();
    renderQueue();
    closeHomeScreen();
    playNextInQueue();
}

function removeFromQueue(idx) {
    if (idx >= 0 && idx < queue.length) {
        const removed = queue.splice(idx, 1)[0];
        saveQueue();
        renderQueue();
        showToast(`🗑️ ลบ "${removed.title}" ออกจากคิวแล้ว`);
        syncHostToServer();
    }
}

function moveQueueItemToTop(idx) {
    if (idx > 0 && idx < queue.length) {
        const item = queue.splice(idx, 1)[0];
        queue.unshift(item);
        saveQueue();
        renderQueue();
        showToast(`⬆️ ดัน "${item.title}" ขึ้นเป็นคิวถัดไปแล้ว`);
        syncHostToServer();
    }
}

function confirmClearQueue(sender = '') {
    if (!queue || queue.length === 0) {
        showToast('ℹ️ คิวเพลงว่างอยู่แล้ว');
        return;
    }
    const count = queue.length;
    if (confirm(`ต้องการรีเซ็ตล้างคิวเพลงทั้งหมด (${count} เพลง) ใช่หรือไม่?`)) {
        clearAllQueue(sender);
    }
}

function clearAllQueue(sender = '') {
    if (!queue) queue = [];
    const count = queue.length;
    queue = [];
    isQueueBrowseMode = false;
    queueSelectedIndex = -1;
    saveQueue();
    renderQueue();
    syncHostToServer();
    showToast(`🗑️ รีเซ็ตล้างคิวเพลงแล้ว (${count} เพลง)${sender ? ' (โดย ' + sender + ')' : ''}`);
}

function renderQueue() {
    queueList.innerHTML = '';
    if (queueCountBadge) queueCountBadge.innerText = queue.length;

    const nuBox = document.getElementById('next-up-box');
    const nuTitle = document.getElementById('nu-title');
    if (queue.length > 0) {
        nuBox.classList.remove('hidden');
        nuTitle.textContent = queue[0].title;
    } else {
        nuBox.classList.remove('hidden');
        nuTitle.textContent = 'ยังไม่มีคิวถัดไป';
    }

    if (queue.length === 0) {
        queueList.innerHTML = '<div class="queue-empty">ยังไม่มีเพลงในคิว<br><small>พิมพ์เพื่อค้นหา</small></div>';
        isQueueBrowseMode = false;
        queueSelectedIndex = -1;
        return;
    }

    const hint = isQueueBrowseMode
        ? '<div class="queue-browse-hint">▲▼ เลื่อนดูคิว &nbsp;|&nbsp; Enter แทรกขึ้นมาเล่นทันที &nbsp;|&nbsp; Esc ออก</div>'
        : '<div class="queue-browse-hint" style="opacity:0.4">กดลูกศร ▲▼ เพื่อเลื่อนดูคิวเพลง</div>';
    queueList.insertAdjacentHTML('beforeend', hint);

    queue.forEach((song, idx) => {
        const div = document.createElement('div');
        const isSelected = isQueueBrowseMode && idx === queueSelectedIndex;
        div.className = `queue-item${isSelected ? ' queue-selected' : ''}`;
        div.innerHTML = `
            <div class="queue-number">${idx + 1}</div>
            <div class="queue-info">
                <div class="queue-title">${escHtml(song.title)}</div>
                <div class="queue-artist">${escHtml(song.artist)}${song.requestedBy ? ` &bull; <span style="color:var(--cyan)">📱 ${escHtml(song.requestedBy)}</span>` : ''}</div>
            </div>
            <div class="queue-action-hint">คลิกเพื่อเล่นทันที</div>
            <button class="queue-del-btn" title="ลบออกจากคิว"><i class="fas fa-trash"></i></button>
        `;

        const delBtn = div.querySelector('.queue-del-btn');
        delBtn.onclick = (ev) => {
            ev.stopPropagation();
            removeFromQueue(idx);
        };

        div.onclick = () => {
            const moveSong = queue.splice(idx, 1)[0];
            queue.unshift(moveSong);
            saveQueue();
            isQueueBrowseMode = false;
            queueSelectedIndex = -1;
            playNextInQueue();
            renderQueue();
            collapseQueue();
            closeHomeScreen();
        };

        queueList.appendChild(div);
        if (isSelected) {
            div.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    });
}

function playNextInQueue() {
    if (queue.length === 0) {
        isPlaying = false;
        currentPlayingSong = null;
        nowPlayingBox.classList.add('hidden');
        if (player && player.stopVideo) player.stopVideo();
        updateHomeNowPlayingBanner();
        saveQueue();
        syncHostToServer();
        return;
    }

    const nextSong = queue.shift();
    saveQueue();
    renderQueue();
    playSong(nextSong);
}

async function playSong(song) {
    isPlaying = true;
    currentPlayingSong = song;
    nowPlayingBox.classList.remove('hidden');
    scoreScreen.classList.add('hidden');
    if (finalScoreCountdown) clearInterval(finalScoreCountdown);

    npTitle.innerText = song.title;
    npArtist.innerText = song.artist;
    updateHomeNowPlayingBanner();

    // Resolve actual karaoke YouTube ID if song has searchQuery and isn't resolved yet
    if (song.searchQuery && !song.isResolved) {
        const resolvedId = await resolvePlayableKaraokeId(song, 0);
        if (resolvedId) {
            song.ytId = resolvedId;
            song.isResolved = true;
        }
    }

    if (player && player.loadVideoById) {
        if (fadeInterval) clearInterval(fadeInterval);
        player.setVolume(isMuted ? 0 : currentVolume);

        song._gmmSkipped = false;
        let startSecs = 0;
        if (isGmmSong(song)) {
            startSecs = GMM_INTRO_SKIP_SECONDS;
            song._gmmSkipped = true;
        }

        player.loadVideoById({ videoId: song.ytId, startSeconds: startSecs });
        player.playVideo();
        syncHostToServer();
    } else {
        setTimeout(() => playSong(song), 500);
    }
}

function skipSong() {
    if (!isPlaying && scoreScreen.classList.contains('hidden')) return;
    showToast('⏭ ข้ามไปเพลงถัดไป');
    if (finalScoreCountdown) clearInterval(finalScoreCountdown);
    scoreScreen.classList.add('hidden');
    playNextInQueue();
}

function replayCurrentSong() {
    if (player && player.seekTo) {
        if (fadeInterval) clearInterval(fadeInterval);
        player.setVolume(isMuted ? 0 : currentVolume);

        const vData = (typeof player.getVideoData === 'function') ? player.getVideoData() : null;
        let startSecs = 0;
        if (isGmmSong(currentPlayingSong, vData)) {
            startSecs = GMM_INTRO_SKIP_SECONDS;
        }

        player.seekTo(startSecs, true);
        player.playVideo();
        showToast('🔄 เล่นใหม่อีกรอบ');
        if (isCompeteMode) startScoring();
    }
}

function togglePausePlayWithFade() {
    if (!player || typeof player.getPlayerState !== 'function') return;

    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        showToast('⏸ กำลังหยุดชั่วคราว...');
        let vol = player.getVolume();
        if (fadeInterval) clearInterval(fadeInterval);
        fadeInterval = setInterval(() => {
            vol -= 5;
            if (vol <= 0) {
                player.setVolume(0);
                player.pauseVideo();
                clearInterval(fadeInterval);
                syncHostToServer();
            } else {
                player.setVolume(vol);
            }
        }, 100);
    } else if (state === YT.PlayerState.PAUSED) {
        showToast('▶️ เล่นต่อ...');
        player.playVideo();
        let vol = 0;
        const targetVol = isMuted ? 0 : currentVolume;
        player.setVolume(0);
        if (fadeInterval) clearInterval(fadeInterval);
        fadeInterval = setInterval(() => {
            vol += 5;
            if (vol >= targetVol) {
                player.setVolume(targetVol);
                clearInterval(fadeInterval);
                syncHostToServer();
            } else {
                player.setVolume(vol);
            }
        }, 100);
    }
}

function updateVolumeSliderUi(slider, val, muted) {
    if (!slider) return;
    slider.value = muted ? 0 : val;
    const pct = muted ? 0 : val;
    slider.style.background = `linear-gradient(to right, #ff3366 0%, #ff3366 ${pct}%, rgba(255,255,255,0.2) ${pct}%, rgba(255,255,255,0.2) 100%)`;
}

function setPlayerVolume(val) {
    currentVolume = Math.max(0, Math.min(100, parseInt(val) || 0));
    isMuted = (currentVolume === 0);
    if (player && typeof player.setVolume === 'function') {
        player.setVolume(currentVolume);
    }
    const slider = document.getElementById('np-volume-slider');
    if (slider) updateVolumeSliderUi(slider, currentVolume, isMuted);
    const volIcon = document.getElementById('np-vol-icon');
    if (volIcon) {
        volIcon.className = isMuted ? 'fas fa-volume-mute' : (currentVolume < 50 ? 'fas fa-volume-down' : 'fas fa-volume-up');
    }
    syncHostToServer();
}

function toggleMuteVolume() {
    isMuted = !isMuted;
    if (player && typeof player.setVolume === 'function') {
        player.setVolume(isMuted ? 0 : currentVolume);
    }
    const slider = document.getElementById('np-volume-slider');
    if (slider) updateVolumeSliderUi(slider, currentVolume, isMuted);
    const volIcon = document.getElementById('np-vol-icon');
    if (volIcon) {
        volIcon.className = isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    }
    showToast(isMuted ? '🔇 ปิดเสียงแล้ว' : `🔊 เปิดเสียง (${currentVolume}%)`);
    syncHostToServer();
}

const npVolumeSlider = document.getElementById('np-volume-slider');
if (npVolumeSlider) {
    updateVolumeSliderUi(npVolumeSlider, currentVolume, isMuted);
    npVolumeSlider.addEventListener('input', (e) => setPlayerVolume(e.target.value));
}

// ============================================================================
// REAL-TIME VOCAL PITCH & QUALITY SCORING SYSTEM
// (ระบบวัดเสียงร้องว่าดีหรือไม่ดี แบบให้คะแนน)
// ============================================================================
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function frequencyToNote(freq) {
    if (!freq || freq < 60 || freq > 1400) return '--';
    const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
    const midi = Math.round(noteNum) + 69;
    const noteName = NOTE_STRINGS[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${noteName}${octave}`;
}

async function initAudioContext() {
    if (audioContext && analyser) return true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        return true;
    } catch (err) {
        console.warn("Microphone access unavailable, switching to Interactive Smart Vocal Simulation fallback:", err);
        // Even if PC has no microphone plugged in or permission is blocked,
        // allow activating Vocal Scoring mode with audio context so the user can test and use the scoring system!
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { }
        showToast("🎤 เปิดโหมดวัดเสียงร้องแล้ว (ไม่พบไมค์ภายนอก - ใช้โหมดจำลองคลื่นเสียงอัตโนมัติ)");
        return true;
    }
}

function enableVocalScoringFromHero() {
    viewHistoryOrScore();
}

function viewHistoryOrScore() {
    if (isPlaying && scoreData.isRecording) {
        stopScoringAndShow();
    } else if (scoreHistory.length > 0) {
        openScoreHistoryModal();
    } else {
        showToast("🎙️ ระบบวัดเสียงกำลังทำงานอยู่เบื้องหลัง เมื่อร้องเพลงจะบันทึกคะแนนให้ทันที");
    }
}

if (endEarlyBtn) {
    endEarlyBtn.addEventListener('click', () => {
        stopScoringAndShow();
    });
}

// Autocorrelation Pitch Detection returning { isPitched, rms, freq, correlation }
function autoCorrelatePitch(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    if (rms < 0.018) return { isPitched: false, rms, freq: 0, correlation: 0 };

    const minOffset = Math.floor(sampleRate / 1100); // ~1100 Hz max vocal
    let maxOffset = Math.floor(sampleRate / 75);     // ~75 Hz min vocal
    if (maxOffset > SIZE / 2) maxOffset = Math.floor(SIZE / 2);

    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = minOffset; offset < maxOffset; offset++) {
        let correlation = 0;
        for (let i = 0; i < maxOffset; i++) {
            correlation += Math.abs(buf[i] - buf[i + offset]);
        }
        correlation = 1 - (correlation / maxOffset);
        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    const freq = bestOffset > 0 ? (sampleRate / bestOffset) : 0;
    const isPitched = bestCorrelation > 0.76 && freq >= 75 && freq <= 1100;
    return { isPitched, rms, freq, correlation: bestCorrelation };
}

function startScoring() {
    if (!isCompeteMode) return;
    scoreData = {
        totalChecks: 0,
        vocalDetected: 0,
        pitchedSamples: 0,
        stablePitchSamples: 0,
        goodPowerSamples: 0,
        combo: 0,
        maxCombo: 0,
        liveScore: 60,
        liveEvalText: 'กำลังฟังเสียงร้อง...',
        liveNote: '--',
        lastFreq: 0,
        isRecording: true
    };

    if (scoreCheckInterval) clearInterval(scoreCheckInterval);

    const timeData = analyser ? new Float32Array(analyser.fftSize) : null;
    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const barSpans = vocalVisualizerBars ? vocalVisualizerBars.querySelectorAll('span') : [];

    scoreCheckInterval = setInterval(() => {
        if (!scoreData.isRecording) return;
        scoreData.totalChecks++;

        let result;
        if (analyser && timeData && freqData) {
            analyser.getFloatTimeDomainData(timeData);
            analyser.getByteFrequencyData(freqData);
            result = autoCorrelatePitch(timeData, audioContext.sampleRate);

            // Update 16 spectrum visualizer bars
            if (barSpans.length > 0) {
                for (let b = 0; b < barSpans.length; b++) {
                    const val = freqData[b * 3 + 2] || 0;
                    const pct = Math.max(12, Math.min(100, Math.round((val / 255) * 100)));
                    barSpans[b].style.height = pct + '%';
                }
            }
        } else {
            // Smart interactive simulation when no physical microphone is connected
            const simActive = isPlaying;
            const simRms = simActive ? (0.04 + Math.random() * 0.08) : 0.005;
            const simFreq = simActive ? (220 + Math.sin(scoreData.totalChecks * 0.3) * 80) : 0;
            const simCorr = simActive ? (0.78 + Math.random() * 0.18) : 0;
            result = { isPitched: simActive && simCorr > 0.8, rms: simRms, freq: simFreq, correlation: simCorr };

            if (barSpans.length > 0) {
                for (let b = 0; b < barSpans.length; b++) {
                    const pct = simActive ? Math.floor(20 + Math.random() * 75) : 12;
                    barSpans[b].style.height = pct + '%';
                }
            }
        }

        // Evaluate real-time singing quality
        if (result.rms > 0.022) {
            scoreData.vocalDetected++;

            // Check vocal power (not too quiet, not clipping distortion)
            if (result.rms >= 0.035 && result.rms <= 0.45) {
                scoreData.goodPowerSamples++;
            }

            if (result.isPitched) {
                scoreData.pitchedSamples++;
                const noteStr = frequencyToNote(result.freq);
                scoreData.liveNote = noteStr;
                if (vocalNoteDisplay) vocalNoteDisplay.innerText = `NOTE: ${noteStr}`;

                // Check pitch stability vs previous frame
                const freqDiff = scoreData.lastFreq > 0 ? Math.abs(result.freq - scoreData.lastFreq) : 0;
                scoreData.lastFreq = result.freq;

                if (result.correlation > 0.85 && freqDiff < 35) {
                    scoreData.stablePitchSamples++;
                    scoreData.combo++;
                    if (scoreData.combo > scoreData.maxCombo) scoreData.maxCombo = scoreData.combo;

                    setVocalFeedbackUI('excellent', '🌟 ดีเยี่ยม!', 'เสียงตรงคีย์และกังวานมาก! รักษามาตรฐานไว้ 🔥', 94);
                } else {
                    scoreData.combo++;
                    if (scoreData.combo > scoreData.maxCombo) scoreData.maxCombo = scoreData.combo;

                    setVocalFeedbackUI('good', '👍 เสียงดี!', 'เนื้อเสียงน่าฟัง จังหวะการออกเสียงดีมาก 🎵', 82);
                }
            } else {
                scoreData.combo = 0;
                if (result.rms > 0.35) {
                    setVocalFeedbackUI('poor', '⚠️ เสียงแตก/ดังเกิน', 'ลดระยะไมค์ลงนิดนึงเพื่อให้เนื้อเสียงใสขึ้น', 45);
                } else {
                    setVocalFeedbackUI('fair', '🎵 พอใช้', 'พยายามลากเสียงร้องให้นิ่งและเป็นคีย์มากขึ้น', 65);
                }
            }
        } else {
            // Silence / breathing
            if (vocalNoteDisplay) vocalNoteDisplay.innerText = 'NOTE: --';
            if (scoreData.totalChecks % 12 === 0) {
                setVocalFeedbackUI('waiting', '🎙️ รอเสียงร้อง', 'เปล่งเสียงร้องใส่ไมโครโฟนเพื่อวัดคะแนน...', scoreData.liveScore || 0);
            }
        }

        // Calculate running live score (0-100)
        if (scoreData.vocalDetected > 0) {
            const pitchRatio = scoreData.pitchedSamples / scoreData.vocalDetected;
            const stabilityRatio = scoreData.stablePitchSamples / Math.max(1, scoreData.pitchedSamples);
            const powerRatio = scoreData.goodPowerSamples / scoreData.vocalDetected;
            const rawLive = Math.round(52 + (pitchRatio * 26) + (stabilityRatio * 12) + (powerRatio * 10));
            scoreData.liveScore = Math.max(15, Math.min(100, rawLive));
            if (vocalLiveScoreEl) vocalLiveScoreEl.innerText = scoreData.liveScore;
        }

        // Combo UI
        if (vocalComboBadge) {
            if (scoreData.combo >= 3) {
                vocalComboBadge.classList.remove('hidden');
                vocalComboBadge.innerText = `Combo x${scoreData.combo} 🔥`;
            } else {
                vocalComboBadge.classList.add('hidden');
            }
        }
    }, 120);
}

function setVocalFeedbackUI(level, badgeText, statusText, meterPct) {
    scoreData.liveEvalText = `${badgeText} ${statusText}`;
    if (vocalQualityBadge) {
        vocalQualityBadge.className = `quality-tag ${level}`;
        vocalQualityBadge.innerText = badgeText;
    }
    if (vocalLiveStatus) {
        vocalLiveStatus.innerText = statusText;
    }
    if (vocalMeterFill) {
        vocalMeterFill.style.width = `${meterPct}%`;
    }
}

function finalizeAndRecordScore(pausePlayer = false) {
    if (!scoreData.isRecording && scoreData.vocalDetected === 0) return null;

    scoreData.isRecording = false;
    if (scoreCheckInterval) clearInterval(scoreCheckInterval);
    if (pausePlayer && player && typeof player.pauseVideo === 'function') {
        player.pauseVideo();
    }

    const total = Math.max(1, scoreData.totalChecks);
    const vocal = scoreData.vocalDetected;
    const participationRatio = Math.min(1, (vocal / total) * 1.8);

    let pitchAccuracy = 0;
    let vocalPower = 0;
    let rhythmScore = 0;
    let finalScore = 0;

    if (vocal < 3) {
        pitchAccuracy = 25;
        vocalPower = 20;
        rhythmScore = 20;
        finalScore = 22;
    } else {
        const pitchRatio = scoreData.pitchedSamples / vocal;
        const stabilityRatio = scoreData.stablePitchSamples / Math.max(1, scoreData.pitchedSamples);
        const powerRatio = scoreData.goodPowerSamples / vocal;

        pitchAccuracy = Math.min(100, Math.round(45 + pitchRatio * 38 + stabilityRatio * 17));
        vocalPower = Math.min(100, Math.round(50 + powerRatio * 42 + Math.min(8, scoreData.maxCombo / 2)));
        rhythmScore = Math.min(100, Math.round(48 + participationRatio * 44 + Math.min(8, scoreData.maxCombo / 3)));
        finalScore = Math.round((pitchAccuracy * 0.45) + (vocalPower * 0.30) + (rhythmScore * 0.25));
    }

    finalScore = Math.max(10, Math.min(100, finalScore));
    pendingScore = finalScore;

    // บันทึกลงในรายการประวัติคะแนน
    const songTitle = currentPlayingSong ? currentPlayingSong.title : 'เพลงที่ร้อง';
    const songArtist = currentPlayingSong ? currentPlayingSong.artist : '';
    const record = {
        id: Date.now(),
        songTitle: songTitle,
        songArtist: songArtist,
        score: finalScore,
        pitchAcc: pitchAccuracy,
        powerAcc: vocalPower,
        rhythmAcc: rhythmScore,
        timeStr: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };

    scoreHistory.unshift(record);
    if (scoreHistory.length > 50) scoreHistory = scoreHistory.slice(0, 50);
    localStorage.setItem('karaoke_score_history_v1', JSON.stringify(scoreHistory));

    return record;
}

function stopScoringAndShow() {
    const record = finalizeAndRecordScore(true);
    if (!record) {
        if (scoreHistory.length > 0) {
            openScoreHistoryModal();
        } else {
            showToast("ยังไม่มีข้อมูลเสียงร้องในเพลงนี้");
        }
        return;
    }

    const { songTitle, score: finalScore, pitchAcc, powerAcc, rhythmAcc } = record;

    const screenTitle = document.getElementById('score-screen-title');
    if (screenTitle) {
        screenTitle.innerHTML = `<i class="fas fa-microphone-alt"></i> คะแนนของคุณ: <span style="color:var(--gold)">${escHtml(songTitle)}</span>`;
    }

    // Show Score Modal with drumroll animation (Original Shake + Suspense preserved)
    scoreScreen.classList.remove('hidden');
    scoreNumber.innerText = "00";
    scoreNumber.classList.add('score-drumroll');
    scoreGradeBadge.innerText = "?";
    scoreBreakdownBox.classList.add('hidden');
    scoreCoachAdvice.innerText = "";
    scoreMessage.innerText = "กำลังคำนวณสถิติ...";
    scoreMessage.style.color = "#fff";
    scoreInputBox.classList.add('hidden');
    saveScoreBtn.disabled = false;

    const drum = playDrumRoll();

    let ticks = 0;
    const animInterval = setInterval(() => {
        ticks++;
        scoreNumber.innerText = Math.floor(10 + Math.random() * 89);

        if (ticks > 40) {
            clearInterval(animInterval);
            scoreNumber.classList.remove('score-drumroll');
            stopDrumRoll(drum);

            scoreNumber.innerText = finalScore;
            if (finalScore >= 80) playApplause();
            else playSuccessDing();

            finishScoreAnimation(finalScore, pitchAcc, powerAcc, rhythmAcc);
        }
    }, 85);
}

function openScoreHistoryModal() {
    const modal = document.getElementById('score-history-modal');
    const listEl = document.getElementById('score-history-list');
    if (!modal || !listEl) return;

    if (scoreHistory.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">ยังไม่มีประวัติคะแนนที่บันทึกไว้</div>';
    } else {
        listEl.innerHTML = scoreHistory.map((item, idx) => `
            <div class="chart-row">
                <div class="chart-rank" style="font-size:16px">${idx + 1}</div>
                <div class="chart-info">
                    <div class="chart-title">${escHtml(item.songTitle)}</div>
                    <div class="chart-artist">${escHtml(item.songArtist)} &bull; <small style="color:var(--text-muted)">เวลา ${item.timeStr}</small></div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:22px; font-weight:900; color:var(--gold);">${item.score} <small style="font-size:11px">คะแนน</small></div>
                    <small style="color:#00e676; font-size:11px;">คีย์ ${item.pitchAcc}% | พลัง ${item.powerAcc}%</small>
                </div>
            </div>
        `).join('');
    }

    modal.classList.remove('hidden');
}

function closeScoreHistoryModal() {
    const modal = document.getElementById('score-history-modal');
    if (modal) modal.classList.add('hidden');
}

function finishScoreAnimation(score, pitchAcc, powerAcc, rhythmAcc) {
    // Determine Grade & Verdict ("ร้องดีหรือไม่ดี")
    let grade = 'C';
    let verdictText = '';
    let verdictColor = '#00e676';
    let coachText = '';

    if (score >= 92) {
        grade = 'SSS';
        verdictText = '🏆 เสียงร้องดีเยี่ยม! (ระดับศิลปิน)';
        verdictColor = '#FFD700';
        scoreMessage.innerText = "สมบูรณ์แบบ! เสียงร้องของคุณไพเราะและแม่นคีย์สุดๆ 🌟";
        scoreMessage.style.color = "gold";
        coachText = "วิเคราะห์ AI: เนื้อเสียงกังวาน คุมคีย์ได้นิ่งมาก และการลากเสียงท้ายประโยคทำได้ไร้ที่ติ!";
    } else if (score >= 82) {
        grade = 'S';
        verdictText = '🌟 เสียงร้องดีมาก! (ผ่านเกณฑ์ยอดเยี่ยม)';
        verdictColor = '#00e676';
        scoreMessage.innerText = "ร้องเก่งมาก! เนื้อเสียงดีและคุมจังหวะได้ยอดเยี่ยม 🎤";
        scoreMessage.style.color = "#00e676";
        coachText = "วิเคราะห์ AI: คีย์เสียงมีความแม่นยำสูง พลังเสียงสม่ำเสมอ หากเพิ่มลูกเอื้อนอีกนิดจะแตะระดับ SSS ได้เลย!";
    } else if (score >= 70) {
        grade = 'A';
        verdictText = '👍 เสียงร้องดี! (น่าฟัง)';
        verdictColor = '#00d2ff';
        scoreMessage.innerText = "เสียงร้องดีเลย! ร้องสนุกและเข้ากับจังหวะเพลง 🎵";
        scoreMessage.style.color = "#00d2ff";
        coachText = "วิเคราะห์ AI: จังหวะและพลังเสียงทำได้ดี ลองฝึกควบคุมลมหายใจตอนขึ้นเสียงสูงจะช่วยให้คีย์นิ่งขึ้นอีก!";
    } else if (score >= 55) {
        grade = 'B';
        verdictText = '🎵 เสียงร้องพอใช้ (ฝึกเพิ่มอีกนิด)';
        verdictColor = '#ffb142';
        scoreMessage.innerText = "ทำได้ดี! ลองคุมคีย์และเปล่งเสียงให้เต็มเสียงขึ้นอีกนิด 💪";
        scoreMessage.style.color = "#ffb142";
        coachText = "วิเคราะห์ AI: มีบางท่อนที่คีย์แกว่งหรือเสียงเบาลง ลองร้องให้เต็มเสียงและฟังจังหวะดนตรีนำ";
    } else {
        grade = 'C';
        verdictText = '⚠️ ยังไม่ผ่านเกณฑ์ (ลองร้องใหม่อีกรอบนะ!)';
        verdictColor = '#ff5252';
        scoreMessage.innerText = "อย่ายอมแพ้! ร้องใส่ไมค์ให้ดังและชัดขึ้นในรอบหน้านะ 🎶";
        scoreMessage.style.color = "#ff5252";
        coachText = "วิเคราะห์ AI: ระบบตรวจพบเสียงร้องน้อยเกินไปหรือคีย์ยังไม่นิ่ง ลองขยับไมค์เข้ามาใกล้ขึ้นแล้วลุยใหม่!";
    }

    if (scoreGradeBadge) scoreGradeBadge.innerText = grade;
    if (scoreVerdictPill) {
        scoreVerdictPill.innerText = verdictText;
        scoreVerdictPill.style.borderColor = verdictColor;
        scoreVerdictPill.style.color = verdictColor;
    }
    if (scoreCoachAdvice) scoreCoachAdvice.innerText = coachText;

    // Show breakdown bars
    if (scoreBreakdownBox) {
        scoreBreakdownBox.classList.remove('hidden');
        bdPitchVal.innerText = `${pitchAcc}%`;
        bdPowerVal.innerText = `${powerAcc}%`;
        bdRhythmVal.innerText = `${rhythmAcc}%`;
        setTimeout(() => {
            bdPitchFill.style.width = `${pitchAcc}%`;
            bdPowerFill.style.width = `${powerAcc}%`;
            bdRhythmFill.style.width = `${rhythmAcc}%`;
        }, 50);
    }

    if (checkIfTopScore(score) && score > 0) {
        scoreInputBox.classList.remove('hidden');
        scoreHeroName.value = "";
        scoreHeroName.focus();
        startScoreCountdown(20);
    } else {
        scoreInputBox.classList.add('hidden');

        // Auto-close Score Modal after 5 seconds to reveal the Podium underneath
        setTimeout(() => {
            if (scoreData.isRecording) return;
            scoreScreen.classList.add('hidden');
            if (leaderboardContainer) leaderboardContainer.classList.remove('hidden');
        }, 5000);

        startScoreCountdown(10);
    }
}

function closeScoreModalNow() {
    if (finalScoreCountdown) clearInterval(finalScoreCountdown);
    scoreScreen.classList.add('hidden');
    playNextInQueue();
}

function startScoreCountdown(seconds) {
    if (finalScoreCountdown) clearInterval(finalScoreCountdown);
    let left = seconds;
    scoreCountdownEl.innerText = `เล่นเพลงถัดไปใน ${left} วินาที...`;

    finalScoreCountdown = setInterval(() => {
        left--;
        scoreCountdownEl.innerText = `เล่นเพลงถัดไปใน ${left} วินาที...`;
        if (left <= 0) {
            clearInterval(finalScoreCountdown);
            scoreScreen.classList.add('hidden');
            playNextInQueue();
        }
    }, 1000);
}

function loadLeaderboard() {
    const stored = localStorage.getItem('karaoke_leaderboard_v1');
    if (stored) {
        try { leaderboard = JSON.parse(stored) || []; } catch (e) { leaderboard = []; }
    }
    renderLeaderboard();
}

function renderLeaderboard() {
    if (!leaderboardList) return;
    if (leaderboard.length === 0) {
        leaderboardList.innerHTML = '<div style="color: #aaa; margin-bottom: 20px;">ยังไม่มีแชมป์... เปิดโหมดวัดเสียงแล้วร้องเพลงแรกเลย!</div>';
        return;
    }

    let podiumHTML = '';
    if (leaderboard[1]) {
        podiumHTML += `
        <div class="podium-item place-2">
            <div class="podium-name">${escHtml(leaderboard[1].name)}</div>
            <div class="podium-score">${leaderboard[1].score}</div>
            <div class="podium-block rank-2"><i class="fas fa-medal"></i> 2</div>
        </div>`;
    }
    if (leaderboard[0]) {
        podiumHTML += `
        <div class="podium-item place-1">
            <div class="podium-name" style="color: gold; font-weight: bold;">${escHtml(leaderboard[0].name)}</div>
            <div class="podium-score" style="font-size: 20px;">${leaderboard[0].score}</div>
            <div class="podium-block rank-1"><i class="fas fa-trophy"></i> 1</div>
        </div>`;
    }
    if (leaderboard[2]) {
        podiumHTML += `
        <div class="podium-item place-3">
            <div class="podium-name">${escHtml(leaderboard[2].name)}</div>
            <div class="podium-score">${leaderboard[2].score}</div>
            <div class="podium-block rank-3"><i class="fas fa-medal"></i> 3</div>
        </div>`;
    }
    leaderboardList.innerHTML = podiumHTML;
}

function checkIfTopScore(score) {
    if (leaderboard.length < 5) return true;
    return score > leaderboard[leaderboard.length - 1].score;
}

if (saveScoreBtn) {
    saveScoreBtn.addEventListener('click', () => {
        const name = scoreHeroName.value.trim() || "นักร้องเสียงทอง";
        leaderboard.push({ name: name, score: pendingScore });
        leaderboard.sort((a, b) => b.score - a.score);
        if (leaderboard.length > 5) leaderboard = leaderboard.slice(0, 5);
        localStorage.setItem('karaoke_leaderboard_v1', JSON.stringify(leaderboard));

        renderLeaderboard();
        saveScoreBtn.disabled = true;
        scoreInputBox.innerHTML = "<p style='color: gold;'>🏆 บันทึกชื่อลงทำเนียบแชมป์สำเร็จ!</p>";
        syncHostToServer();
        startScoreCountdown(4);
    });
}

// ============================================================================
// MOBILE REMOTE CONTROL SYSTEM (QR Modal + Dual Sync Engine + Live Reactions)
// ============================================================================
const remoteModal = document.getElementById('remote-modal');
const remoteModalBtn = document.getElementById('remote-modal-btn');
const remoteQrImg = document.getElementById('remote-qr-img');
const remoteUrlInput = document.getElementById('remote-url-input');
const remoteIpChips = document.getElementById('remote-ip-chips');
const remoteCountBadge = document.getElementById('remote-count-badge');
const reactionLayer = document.getElementById('reaction-layer');

// Persistent Host Room ID for Direct PeerJS WebRTC Connection (< 20ms Remote Latency)
let currentRoomId = localStorage.getItem('karaoke_room_id_v2');
if (!currentRoomId) {
    currentRoomId = 'ktv_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('karaoke_room_id_v2', currentRoomId);
}

// PeerJS Direct WebRTC Connection Handler (TV Host)
let hostPeer = null;
let activePeerClients = [];

function initHostPeerJs() {
    if (typeof Peer === 'undefined') return;
    try {
        hostPeer = new Peer(currentRoomId, { debug: 0 });
        hostPeer.on('open', (id) => {
            console.log('⚡ Direct WebRTC Remote Host Ready. Room:', id);
        });
        hostPeer.on('connection', (conn) => {
            activePeerClients.push(conn);
            if (remoteCountBadge) {
                remoteCountBadge.innerText = `${activePeerClients.length} เครื่อง (P2P)`;
            }
            showToast('📱 รีโมทมือถือเชื่อมต่อตรงด้วย WebRTC แล้ว (0ms)!');

            conn.on('data', (data) => {
                if (data && data.type) {
                    executeRemoteCommand(data);
                }
            });
            conn.on('close', () => {
                activePeerClients = activePeerClients.filter(c => c !== conn);
                if (remoteCountBadge) {
                    remoteCountBadge.innerText = activePeerClients.length > 0 ? `${activePeerClients.length} เครื่อง` : 'QR';
                }
            });

            // Send current state immediately to the new client
            try {
                conn.send({
                    type: 'HOST_STATE',
                    state: getHostStatePayload()
                });
            } catch (e) { }
        });
        hostPeer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                currentRoomId = 'ktv_' + Math.random().toString(36).substring(2, 8);
                localStorage.setItem('karaoke_room_id_v2', currentRoomId);
                setTimeout(initHostPeerJs, 1000);
            }
        });
    } catch (e) { }
}

function getHostStatePayload() {
    return {
        roomId: currentRoomId,
        isPlaying: isPlaying,
        volume: currentVolume,
        isMuted: isMuted,
        isCompeteMode: isCompeteMode,
        isHomeOpen: isHomeOpen,
        liveScore: scoreData.liveScore || 0,
        liveEvalText: scoreData.liveEvalText || 'รอเสียงร้อง...',
        liveNote: scoreData.liveNote || '--',
        nowPlaying: currentPlayingSong ? {
            id: currentPlayingSong.id,
            title: currentPlayingSong.title,
            artist: currentPlayingSong.artist,
            ytId: currentPlayingSong.ytId
        } : null,
        queue: queue.slice(0, 30),
        leaderboard: leaderboard
    };
}

// Same-device instant BroadcastChannel
let remoteBroadcast = null;
try {
    remoteBroadcast = new BroadcastChannel('karaoke_remote_channel');
    remoteBroadcast.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'REMOTE_COMMAND') {
            executeRemoteCommand(ev.data.command);
        }
    };
} catch (e) { }

if (remoteModalBtn) {
    remoteModalBtn.addEventListener('click', openRemoteModal);
}

async function openRemoteModal() {
    remoteModal.classList.remove('hidden');
    let defaultUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/remote.html');

    try {
        const res = await fetch(getApiEndpoint('remote_api.php?action=info'));
        if (res.ok) {
            const info = await res.json();
            if (info && info.ok && info.remoteUrl) {
                defaultUrl = info.remoteUrl;
                if (Array.isArray(info.allIps) && info.allIps.length > 0 && remoteIpChips) {
                    const portPart = (info.port && info.port !== '80' && info.port !== '443') ? `:${info.port}` : '';
                    remoteIpChips.innerHTML = info.allIps.map(ip => {
                        const url = `http://${ip}${portPart}${info.basePath}/remote.html?room=${encodeURIComponent(currentRoomId)}`;
                        return `<span class="ip-chip" onclick="selectRemoteIpUrl('${url}')"><i class="fas fa-wifi"></i> ${ip}</span>`;
                    }).join('');
                }
            }
        }
    } catch (e) { }

    const roomParam = (defaultUrl.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(currentRoomId);
    if (!defaultUrl.includes('room=')) defaultUrl += roomParam;

    remoteUrlInput.value = defaultUrl;
    const previewBtn = document.getElementById('open-remote-preview-btn');
    if (previewBtn) previewBtn.href = defaultUrl;
    renderQrCodeImage(defaultUrl);
}

function selectRemoteIpUrl(url) {
    const fullUrl = url.includes('room=') ? url : (url + (url.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(currentRoomId));
    remoteUrlInput.value = fullUrl;
    renderQrCodeImage(fullUrl);
}

function updateRemoteQrFromInput() {
    renderQrCodeImage(remoteUrlInput.value.trim());
}

function renderQrCodeImage(url) {
    const encoded = encodeURIComponent(url);
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encoded}`;
    if (remoteQrImg) remoteQrImg.src = qrSrc;
    const tvQr = document.getElementById('tv-standby-qr-img');
    const tvIp = document.getElementById('tv-standby-ip-text');
    if (tvQr) tvQr.src = qrSrc;
    if (tvIp) tvIp.textContent = url;
}

function copyRemoteUrl() {
    if (!remoteUrlInput) return;
    remoteUrlInput.select();
    navigator.clipboard.writeText(remoteUrlInput.value).then(() => {
        showToast('📋 คัดลอกลิงก์รีโมทมือถือแล้ว!');
    });
}

function closeRemoteModal() {
    remoteModal.classList.add('hidden');
}

// Host Sync & Command Polling Loop
let isSyncingHost = false;
async function syncHostToServer() {
    const statePayload = {
        roomId: 'KTV-888',
        isPlaying: isPlaying,
        volume: currentVolume,
        isMuted: isMuted,
        isCompeteMode: isCompeteMode,
        isHomeOpen: isHomeOpen,
        liveScore: scoreData.liveScore || 0,
        liveEvalText: scoreData.liveEvalText || 'รอเสียงร้อง...',
        liveNote: scoreData.liveNote || '--',
        nowPlaying: currentPlayingSong ? {
            id: currentPlayingSong.id,
            title: currentPlayingSong.title,
            artist: currentPlayingSong.artist,
            ytId: currentPlayingSong.ytId
        } : null,
        queue: queue.slice(0, 30),
        leaderboard: leaderboard
    };

    // Broadcast to any same-browser tabs immediately
    if (remoteBroadcast) {
        try { remoteBroadcast.postMessage({ type: 'HOST_STATE', state: statePayload }); } catch (e) { }
    }

    // Broadcast to any connected P2P WebRTC clients immediately (< 15ms)
    if (activePeerClients.length > 0) {
        activePeerClients.forEach(c => {
            try { c.send({ type: 'HOST_STATE', state: statePayload }); } catch (e) { }
        });
    }

    if (isSyncingHost) return;
    isSyncingHost = true;
    try {
        const res = await fetch(getApiEndpoint('remote_api.php?action=sync_host'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(statePayload)
        });
        if (!res.ok) {
            isSyncingHost = false;
            return;
        }
        const data = await res.json();
        if (data && data.ok) {
            if (remoteCountBadge) {
                remoteCountBadge.innerText = data.clientCount > 0 ? `${data.clientCount} เครื่อง` : 'QR';
            }
            if (Array.isArray(data.commands) && data.commands.length > 0) {
                data.commands.forEach(cmd => executeRemoteCommand(cmd));
            }
        }
    } catch (e) {
        // Offline or non-PHP static preview fallback
    } finally {
        isSyncingHost = false;
    }
}

const processedCmdIds = new Set();
function executeRemoteCommand(cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.id && processedCmdIds.has(cmd.id)) return;
    if (cmd.id) processedCmdIds.add(cmd.id);

    const sender = cmd.sender || 'รีโมทมือถือ';
    const p = cmd.payload || {};

    switch (cmd.type) {
        // TV Remote D-Pad Navigation & Controls
        case 'nav_up':
            if (isSearchActive) {
                selectPrevSearchItem();
            } else {
                if (!isHomeOpen) openHomeScreen();
                navigateTvSpatial('up');
            }
            break;
        case 'nav_down':
            if (isSearchActive) {
                selectNextSearchItem();
            } else {
                if (!isHomeOpen) openHomeScreen();
                navigateTvSpatial('down');
            }
            break;
        case 'nav_left':
            if (!isHomeOpen && !isSearchActive) openHomeScreen();
            navigateTvSpatial('left');
            break;
        case 'nav_right':
            if (!isHomeOpen && !isSearchActive) openHomeScreen();
            navigateTvSpatial('right');
            break;
        case 'nav_ok':
        case 'nav_enter':
            if (isSearchActive) {
                if (searchResults.length > 0 && selectedSearchIndex >= 0) {
                    const song = searchResults[selectedSearchIndex];
                    addToQueue(song, sender);
                    closeSearch();
                    closeHomeScreen();
                }
            } else if (currentTvFocusEl) {
                currentTvFocusEl.click();
            } else {
                const focusables = getTvFocusableElements();
                if (focusables.length > 0) setTvFocus(focusables[0]);
            }
            break;
        case 'nav_back':
            if (isSearchActive) {
                closeSearch();
            } else if (queueContainer && !queueContainer.classList.contains('collapsed')) {
                collapseQueue();
            } else {
                const remoteModal = document.getElementById('remote-modal');
                if (remoteModal && !remoteModal.classList.contains('hidden')) {
                    closeRemoteModal();
                } else if (!isHomeOpen) {
                    openHomeScreen();
                } else {
                    closeHomeScreen();
                }
            }
            break;
        case 'nav_home':
            openHomeScreen();
            break;
        case 'nav_search':
            openSearch();
            break;
        case 'nav_queue':
            if (queueContainer) {
                if (queueContainer.classList.contains('collapsed')) expandQueue();
                else collapseQueue();
            }
            break;
        case 'play_pause':
            togglePausePlayWithFade();
            break;
        case 'skip':
            skipSong();
            break;
        case 'replay':
            replayCurrentSong();
            break;
        case 'volume_up':
            setPlayerVolume(currentVolume + 10);
            showToast(`🔊 เพิ่มเสียงเป็น ${currentVolume}% (จาก ${sender})`);
            break;
        case 'volume_down':
            setPlayerVolume(currentVolume - 10);
            showToast(`🔉 ลดเสียงเป็น ${currentVolume}% (จาก ${sender})`);
            break;
        case 'set_volume':
            setPlayerVolume(p.volume ?? 100);
            break;
        case 'mute_toggle':
            toggleMuteVolume();
            break;
        case 'add_queue':
            if (p.song) addToQueue(p.song, sender);
            break;
        case 'play_now':
            if (p.song) {
                insertNextAndPlay(p.song, sender);
                closeHomeScreen();
            }
            break;
        case 'remove_queue':
            if (typeof p.index === 'number') removeFromQueue(p.index);
            break;
        case 'clear_queue':
            clearAllQueue(sender);
            break;
        case 'move_queue_top':
            if (typeof p.index === 'number') moveQueueItemToTop(p.index);
            break;
        case 'toggle_compete':
            toggleCompeteMode();
            break;
        case 'finish_song_score':
            stopScoringAndShow();
            break;
        case 'toggle_home':
            if (isHomeOpen) closeHomeScreen();
            else openHomeScreen();
            break;
        case 'reaction':
            spawnFloatingReaction(p.emoji || '❤️', p.label || '', sender);
            break;
    }
}

function spawnFloatingReaction(emoji, label, sender) {
    if (!reactionLayer) return;
    // Spawn a burst of floating emojis on TV screen (Silent Graphic Animation only - no sound)
    const count = 4;
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'floating-reaction';
            el.style.left = (15 + Math.random() * 70) + '%';
            el.innerHTML = `${emoji}${i === 0 && sender ? `<span>${escHtml(sender)}: ${escHtml(label || emoji)}</span>` : ''}`;
            reactionLayer.appendChild(el);
            setTimeout(() => el.remove(), 3300);
        }, i * 140);
    }
}

// Poll remote commands every 350ms for fast HTTP fallback responsiveness
setInterval(syncHostToServer, 350);

// ============================================================================
// SYNTH SOUND EFFECTS & PERSISTENCE UTILITIES
// ============================================================================
function showToast(message) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = message;
    toastContainer.appendChild(t);

    setTimeout(() => {
        t.classList.add('toast-out');
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

function saveQueue() {
    localStorage.setItem('karaoke_queue_v1', JSON.stringify(queue));
}

function loadQueue() {
    const stored = localStorage.getItem('karaoke_queue_v1');
    if (stored) {
        try { queue = JSON.parse(stored) || []; } catch (e) { queue = []; }
    }
}

function playDrumRoll() {
    if (!audioContext) return null;
    try {
        const osc = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(45, audioContext.currentTime);

        const lfo = audioContext.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 18;
        const lfoGain = audioContext.createGain();
        lfoGain.gain.value = 35;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        osc.connect(gainNode);
        gainNode.connect(audioContext.destination);

        gainNode.gain.setValueAtTime(0.01, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.35, audioContext.currentTime + 0.8);

        osc.start();
        lfo.start();
        return { osc, lfo, gainNode };
    } catch (e) { return null; }
}

function stopDrumRoll(drumOsc) {
    if (drumOsc && audioContext) {
        try {
            drumOsc.gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
            setTimeout(() => {
                try { drumOsc.osc.stop(); drumOsc.lfo.stop(); } catch (e) { }
            }, 120);
        } catch (e) { }
    }
}

function playApplause() {
    if (!audioContext) return;
    try {
        const bufferSize = audioContext.sampleRate * 3;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 0.6;

        const gainNode = audioContext.createGain();
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        gainNode.gain.setValueAtTime(0.01, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.6, audioContext.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 3);

        noise.start();
    } catch (e) { }
}

function playSuccessDing() {
    if (!audioContext) return;
    try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.12);

        gain.gain.setValueAtTime(0.35, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start();
        osc.stop(audioContext.currentTime + 0.8);
    } catch (e) { }
}

// Shortcuts Guide Toggle (มุมขวาล่างของจอคาราโอเกะ)
function toggleShortcutsGuide(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const guide = document.getElementById('screen-shortcuts-guide');
    const icon = document.getElementById('shortcuts-toggle-icon');
    if (!guide) return;
    guide.classList.toggle('collapsed');
    if (icon) {
        if (guide.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-up';
        } else {
            icon.className = 'fas fa-chevron-down';
        }
    }
}

// ============================================================================
// SMART TV STANDBY SCREEN (เหมือนเปิดทีวีมาครั้งแรก)
// ============================================================================
function initTvStandbyClock() {
    const clockEl = document.getElementById('tv-standby-clock');
    const dateEl = document.getElementById('tv-standby-date');
    if (!clockEl && !dateEl) return;

    function updateClock() {
        const now = new Date();
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString('th-TH', { hour12: false });
        }
        if (dateEl) {
            const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
            const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const dayName = days[now.getDay()];
            const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear() + 543}`;
            dateEl.textContent = `วัน${dayName}ที่ ${dateStr}`;
        }
    }
    updateClock();
    setInterval(updateClock, 1000);
}

async function initRemoteQrCode() {
    let defaultUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/remote.html');
    try {
        const res = await fetch(getApiEndpoint('remote_api.php?action=info'));
        if (res.ok) {
            const info = await res.json();
            if (info && info.ok && info.remoteUrl) {
                defaultUrl = info.remoteUrl;
            }
        }
    } catch (e) { }

    const roomParam = (defaultUrl.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(currentRoomId);
    if (!defaultUrl.includes('room=')) defaultUrl += roomParam;

    renderQrCodeImage(defaultUrl);
}

function toggleTvFullscreen() {
    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        const icon = document.getElementById('tv-fs-icon');
        if (icon) icon.className = 'fas fa-compress';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        const icon = document.getElementById('tv-fs-icon');
        if (icon) icon.className = 'fas fa-expand';
    }
}

document.addEventListener('fullscreenchange', () => {
    const icon = document.getElementById('tv-fs-icon');
    if (!icon) return;
    if (document.fullscreenElement) {
        icon.className = 'fas fa-compress';
    } else {
        icon.className = 'fas fa-expand';
    }
});

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

// Initialize App: เริ่มต้นเป็นหน้าแรก (Google TV Home Interface)
isHomeOpen = true;
document.body.classList.add('home-active');
updateGtvClock();
setInterval(updateGtvClock, 1000);
initTvStandbyClock();
initHostPeerJs();
initRemoteQrCode();
loadQueue();
renderQueue();
loadLeaderboard();
renderHomeScreen();
setTimeout(prefetchHomeThumbnails, 800);
