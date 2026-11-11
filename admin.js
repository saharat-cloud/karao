// ==========================================
// Admin Panel Logic - admin.js
// ==========================================

const STORAGE_KEY = 'karaoke_songs_v1';

// Load songs: prefer localStorage, fallback to SONGS_DB from songs.js
function loadSongs() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    return SONGS_DB.map(s => ({ ...s }));
}

function saveSongs(songs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
    // Also expose to the karaoke player via same localStorage
}

let songs = loadSongs();

// ==========================================
// Navigation
// ==========================================
document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = link.dataset.section;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        link.classList.add('active');
        document.getElementById('section-' + sec).classList.add('active');
    });
});

// ==========================================
// Render Song List
// ==========================================
function renderSongList(filterText = '') {
    const container = document.getElementById('song-list-container');
    const filtered = songs.filter(s =>
        s.title.toLowerCase().includes(filterText.toLowerCase()) ||
        s.artist.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--muted)">ไม่พบเพลงที่ค้นหา</div>';
        return;
    }

    container.innerHTML = filtered.map((s, idx) => `
        <div class="song-row" id="song-row-${s.id}">
            <div class="song-num">${idx + 1}</div>
            <div class="song-info">
                <div class="song-title">${escHtml(s.title)}</div>
                <div class="song-artist"><i class="fas fa-user" style="color:var(--muted);font-size:11px;margin-right:6px"></i>${escHtml(s.artist)}</div>
                <div class="song-ytid"><i class="fab fa-youtube" style="color:#FF0000;margin-right:6px"></i>${s.ytId} &nbsp;&bull;&nbsp; <a href="https://youtu.be/${s.ytId}" target="_blank" style="color:var(--accent)">ดูในYouTube</a></div>
            </div>
            <div class="song-controls">
                <button class="btn btn-secondary btn-sm" onclick="openEdit(${s.id})"><i class="fas fa-edit"></i> แก้ไข</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSong(${s.id})"><i class="fas fa-trash"></i> ลบ</button>
            </div>
        </div>
    `).join('');
}

function filterSongs(text) { renderSongList(text); }

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// Add Song Manually
// ==========================================
function parseYouTubeUrl(val) {
    const ytIdField = document.getElementById('form-ytid');
    const match = val.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
        ytIdField.value = match[1];
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(val.trim())) {
        ytIdField.value = val.trim();
    } else {
        ytIdField.value = '';
    }
}

function testVideo() {
    const ytId = document.getElementById('form-ytid').value.trim();
    if (!ytId) { showToast('กรุณาใส่ URL หรือ Video ID ก่อน', 'error'); return; }
    const preview = document.getElementById('preview-container');
    const iframe = document.getElementById('preview-player');
    iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1`;
    preview.classList.remove('hidden');
}

function addSong() {
    const title = document.getElementById('form-title').value.trim();
    const artist = document.getElementById('form-artist').value.trim();
    const ytId = document.getElementById('form-ytid').value.trim();
    if (!title || !artist || !ytId) { showToast('กรุณากรอกข้อมูลให้ครบก่อนบันทึก', 'error'); return; }

    const newId = Date.now();
    songs.push({ id: newId, title, artist, ytId });
    saveSongs(songs);
    renderSongList();
    clearForm();
    showToast('บันทึกเพลง "' + title + '" สำเร็จ!', 'success');

    // Switch to song list view
    document.querySelector('[data-section="songs"]').click();
}

function clearForm() {
    ['form-title', 'form-artist', 'form-url', 'form-ytid'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('preview-container').classList.add('hidden');
    document.getElementById('preview-player').src = '';
    document.getElementById('auto-results').classList.add('hidden');
    document.getElementById('auto-results').innerHTML = '';
    document.getElementById('auto-search-input').value = '';
}

// ==========================================
// Edit Modal
// ==========================================
function openEdit(songId) {
    const s = songs.find(x => x.id === songId);
    if (!s) return;
    document.getElementById('modal-song-id').value = s.id;
    document.getElementById('modal-title').value = s.title;
    document.getElementById('modal-artist').value = s.artist;
    document.getElementById('modal-ytid').value = s.ytId;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function saveEdit() {
    const id = parseInt(document.getElementById('modal-song-id').value);
    const s = songs.find(x => x.id === id);
    if (!s) return;
    s.title = document.getElementById('modal-title').value.trim();
    s.artist = document.getElementById('modal-artist').value.trim();
    s.ytId = document.getElementById('modal-ytid').value.trim();
    saveSongs(songs);
    renderSongList();
    closeModal();
    showToast('แก้ไขเพลงสำเร็จ!', 'success');
}

// ==========================================
// Delete
// ==========================================
function deleteSong(songId) {
    if (!confirm('ยืนยันการลบเพลงนี้?')) return;
    
    const deletedSong = songs.find(s => s.id === songId);
    songs = songs.filter(s => s.id !== songId);
    saveSongs(songs);
    
    // ลบเพลงที่ถูกลบออกจากคิวด้วย (เผื่อค้างอยู่ในระบบ)
    if (deletedSong) {
        try {
            const queueStr = localStorage.getItem('karaoke_queue_v1');
            if (queueStr) {
                let q = JSON.parse(queueStr);
                // กรองเพลงที่มี ytId ตรงกับที่ถูกลบออกไปจากคิว
                q = q.filter(s => s.ytId !== deletedSong.ytId);
                localStorage.setItem('karaoke_queue_v1', JSON.stringify(q));
            }
        } catch (e) {
            console.error('Failed to clean up queue', e);
        }
    }
    
    renderSongList();
    showToast('ลบเพลงสำเร็จ', 'success');
}

// ==========================================
// Reset to default
// ==========================================
function resetToDefault() {
    if (!confirm('รีเซ็ตรายการเพลงกลับเป็นค่าเริ่มต้น? ข้อมูลที่เพิ่มเองจะหายทั้งหมด')) return;
    localStorage.removeItem(STORAGE_KEY);
    songs = loadSongs();
    saveSongs(songs);
    renderSongList();
    showToast('รีเซ็ตสำเร็จ!', 'success');
}

// ==========================================
// Auto-Search via PHP proxy (bypasses CORS)
// ==========================================
async function autoSearch() {
    const q = document.getElementById('auto-search-input').value.trim();
    if (!q) { showToast('กรุณาพิมพ์ชื่อเพลงที่ต้องการค้นหา', 'error'); return; }

    const btn = document.getElementById('auto-search-btn');
    btn.innerHTML = '<span class="spinner"></span> กำลังค้นหา...';
    btn.disabled = true;

    const resultsEl = document.getElementById('auto-results');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center"><span class="spinner"></span> &nbsp;กำลังค้นหาข้อมูลจาก YouTube...</div>';

    try {
        const res = await fetch('search_proxy.php?q=' + encodeURIComponent(q));
        const data = await res.json();

        if (data.error) {
            resultsEl.innerHTML = `<div style="color:#f87171;padding:20px;text-align:center">
                <i class="fas fa-exclamation-circle"></i> &nbsp;${escHtml(data.error)}
                <br><small style="color:var(--muted)">ตรวจสอบว่า XAMPP รันอยู่และไฟล์ search_proxy.php ถูกวางแล้ว</small>
            </div>`;
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            resultsEl.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">ไม่พบผลการค้นหา — ลองพิมพ์คำค้นหาอื่น</div>';
            return;
        }

        resultsEl.innerHTML = data.slice(0, 10).map(v => {
            const titleSafe = escHtml(v.title || '');
            const authorSafe = escHtml(v.author || '');
            const id = v.videoId;
            const thumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
            return `
            <div class="auto-result-item" id="aresult-${id}">
                <img class="auto-result-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.style.background='#222'">
                <div class="auto-result-info">
                    <div class="auto-result-title">${titleSafe}</div>
                    <div class="auto-result-channel"><i class="fas fa-user" style="font-size:10px;margin-right:4px"></i>${authorSafe}</div>
                    <div class="auto-result-id">
                        <i class="fab fa-youtube" style="color:#f00;margin-right:4px"></i>${id}
                        &nbsp;&bull;&nbsp;
                        <a href="https://youtu.be/${id}" target="_blank" style="color:var(--accent);font-size:11px">YouTube ↗</a>
                    </div>
                </div>
                <div class="auto-result-actions">
                    <button class="btn btn-success btn-sm quick-add-btn" 
                        title="เพิ่มลงรายการเพลงทันที"
                        onclick="quickAddSong('${titleSafe.replace(/'/g, "\\'")}', '${authorSafe.replace(/'/g, "\\'")}', '${id}', this)">
                        <i class="fas fa-plus"></i> เพิ่มเลย
                    </button>
                    <button class="btn btn-accent btn-sm" 
                        title="ดูตัวอย่างและแก้ไขก่อนเพิ่ม"
                        onclick="selectAutoResult('${titleSafe.replace(/'/g, "\\'")}', '${authorSafe.replace(/'/g, "\\'")}', '${id}')">
                        <i class="fas fa-eye"></i> ตรวจสอบ
                    </button>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        resultsEl.innerHTML = `<div style="color:#f87171;padding:20px;text-align:center">
            <i class="fas fa-exclamation-triangle"></i> เชื่อมต่อ PHP proxy ไม่ได้<br>
            <small style="color:var(--muted)">ตรวจสอบว่า XAMPP เปิดอยู่และไฟล์ search_proxy.php อยู่ในโฟลเดอร์ karaoke</small>
        </div>`;
    } finally {
        btn.innerHTML = '<i class="fas fa-search"></i> ค้นหาอัตโนมัติ';
        btn.disabled = false;
    }
}

// Quick-add: add directly from search result without opening the form
function quickAddSong(title, artist, ytId, btn) {
    const isDup = songs.some(s => s.ytId === ytId);
    if (isDup) {
        showToast('เพลงนี้มีอยู่แล้วในรายการ!', 'error');
        return;
    }
    const newId = Date.now();
    songs.push({ id: newId, title, artist, ytId });
    saveSongs(songs);
    renderSongList();

    // Visual feedback on button
    btn.innerHTML = '<i class="fas fa-check"></i> เพิ่มแล้ว!';
    btn.disabled = true;
    btn.classList.remove('btn-success');
    btn.classList.add('btn-secondary');

    showToast(`✅ เพิ่ม "${title}" แล้ว!`, 'success');
}

function selectAutoResult(title, artist, ytId) {
    document.getElementById('form-title').value = title;
    document.getElementById('form-artist').value = artist;
    document.getElementById('form-ytid').value = ytId;
    document.getElementById('form-url').value = ytId;
    document.querySelector('[data-section="add"]').click();
    setTimeout(() => testVideo(), 300);
    showToast('เลือกเพลงแล้ว ตรวจสอบแล้วกดบันทึกได้เลย', 'success');
}

// ==========================================
// Auto-search on Enter key
// ==========================================
document.getElementById('auto-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') autoSearch();
});

// ==========================================
// Toast
// ==========================================
function showToast(message, type = '') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = message;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ==========================================
// Init
// ==========================================
saveSongs(songs); // Ensure localStorage is always populated on admin load
renderSongList();
