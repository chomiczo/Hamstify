let currentUser = JSON.parse(localStorage.getItem('hamstify_user'));
let currentTrack = null;
let currentQueue = []; // Aktualna lista (Wyszukiwanie LUB Playlista)
let currentQueueIndex = -1; // Numer piosenki na liście
let lastSearchResults = []; // Pamięć wyszukiwarki
let loadedPlaylists = {}; // Pamięć Twoich playlist
let likedTrackIds = new Set(); // Zbiór Twoich ulubionych (do serduszek)
let isPlaying = false;
let trackToAddToPlaylist = null;
let authMode = 'login';
let debounceTimer;

const audio = document.getElementById('audioElement');
const progressBar = document.getElementById('progressBar');
const volBar = document.getElementById('volBar');

// --- START APLIKACJI ---
if (currentUser) {
    showApp();
} else {
    document.getElementById('authScreen').classList.remove('hidden');
}

async function showApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('displayUsername').innerText = currentUser.username;
    
    // 1. Pobierz playlisty (żeby wiedzieć co ma mieć serduszko)
    await refreshLikedTracks();
    // 2. Załaduj stronę główną
    loadHome();
}

// Pobiera playlisty i zapisuje ID polubionych utworów
async function refreshLikedTracks() {
    try {
        const res = await fetch(`/api/playlists?user_id=${currentUser.user_id}`);
        const playlists = await res.json();
        
        likedTrackIds.clear();
        loadedPlaylists = {};
        
        playlists.forEach(pl => {
            loadedPlaylists[pl.id] = pl;
            pl.songs.forEach(song => {
                // Zapamiętujemy oryginalne ID z Youtube (video_id)
                // W bazie mamy: id (bazy), video_id (youtube)
                // W wyszukiwarce mamy: id (youtube)
                likedTrackIds.add(song.video_id || song.id);
            });
        });
    } catch (e) {
        console.error("Błąd pobierania playlist:", e);
    }
}

// --- LOGIKA QUEUE (KOLEJKI) ---

// Sytuacja A: Klikasz w Wyszukiwarce lub na Stronie Głównej
function playContextTrack(index, contextName) {
    let sourceList = [];
    if (contextName === 'search') sourceList = lastSearchResults;
    else if (contextName === 'home') sourceList = window.homeTracks || [];

    if (sourceList.length > 0) {
        currentQueue = sourceList;
        currentQueueIndex = index;
        playTrackFromQueue();
    }
}

// Sytuacja B: Klikasz w Bibliotece (Playliście)
function playLibraryTrack(playlistId, index) {
    const pl = loadedPlaylists[playlistId];
    if (pl && pl.songs.length > 0) {
        currentQueue = pl.songs;
        currentQueueIndex = index;
        playTrackFromQueue();
    }
}

// --- SILNIK ODTWARZANIA (Z NAPRAWIONYM ID) ---
async function playTrackFromQueue() {
    if (currentQueueIndex < 0 || currentQueueIndex >= currentQueue.length) return;

    const track = currentQueue[currentQueueIndex];
    currentTrack = track;

    // UI Update
    document.getElementById('player').classList.remove('hidden');
    document.getElementById('nowPlayingTitle').innerText = track.title;
    document.getElementById('nowPlayingArtist').innerText = track.artist;
    document.getElementById('playerThumb').src = track.thumbnail;
    document.getElementById('playPauseBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    // --- KLUCZOWA POPRAWKA ID ---
    // Jeśli to utwór z playlisty (bazy), ma pole 'video_id'.
    // Jeśli to utwór z wyszukiwarki, ma pole 'id'.
    // Bierzemy to, które jest dostępne.
    const realYoutubeId = track.video_id || track.id;

    // Aktualizacja historii
    fetch('/api/history', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            user_id: currentUser.user_id, 
            video_id: realYoutubeId,
            title: track.title, 
            artist: track.artist, 
            thumbnail: track.thumbnail 
        })
    });

    try {
        const res = await fetch(`/api/stream?id=${realYoutubeId}`);
        if (!res.ok) throw new Error('Błąd streamu');
        const data = await res.json();
        
        audio.src = data.url;
        audio.play();
        isPlaying = true;
        updatePlayBtn();

        // Obsługa sterowania z paska powiadomień telefonu
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title, 
                artist: track.artist, 
                artwork: [{ src: track.thumbnail, sizes: '512x512', type: 'image/png' }]
            });
            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
            navigator.mediaSession.setActionHandler('previoustrack', playPrev);
        }
    } catch (e) {
        console.error(e);
        document.getElementById('playPauseBtn').innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-500"></i>';
    }
}

// --- LOGIKA "CO DALEJ" (PLAY NEXT) ---
function playNext() {
    // 1. Jeśli jest następny utwór w kolejce -> GRAJ GO (Kolejność zachowana)
    if (currentQueue.length > 0 && currentQueueIndex < currentQueue.length - 1) {
        currentQueueIndex++;
        playTrackFromQueue();
    } 
    // 2. Jeśli playlista się skończyła -> GRAJ LOSOWY Z TEJ SAMEJ LISTY (Ciągłość zachowana)
    else if (currentQueue.length > 0) {
        // Losujemy indeks
        const randomIndex = Math.floor(Math.random() * currentQueue.length);
        currentQueueIndex = randomIndex;
        playTrackFromQueue();
    }
    else {
        isPlaying = false;
        updatePlayBtn();
    }
}

function playPrev() {
    if (currentQueue.length > 0 && currentQueueIndex > 0) {
        currentQueueIndex--;
        playTrackFromQueue();
    } else { 
        audio.currentTime = 0;
    }
}

function togglePlay() {
    if (audio.paused) { audio.play(); isPlaying = true; } 
    else { audio.pause(); isPlaying = false; }
    updatePlayBtn();
}

function updatePlayBtn() {
    const btn = document.getElementById('playPauseBtn');
    const thumb = document.getElementById('playerThumb');
    btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play pl-1"></i>';
    if(isPlaying) thumb.classList.add('playing'); else thumb.classList.remove('playing');
}

// --- SUWAKI (Głośność i Postęp) ---
volBar.addEventListener('input', (e) => { audio.volume = e.target.value; });
progressBar.addEventListener('input', () => { audio.currentTime = progressBar.value; });

function updateProgress() {
    progressBar.value = audio.currentTime;
    document.getElementById('currTime').innerText = formatTime(audio.currentTime);
}

function setDuration() {
    progressBar.max = audio.duration;
    document.getElementById('durTime').innerText = formatTime(audio.duration);
}

function formatTime(seconds) {
    if(isNaN(seconds)) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function downloadCurrentTrack() {
    if(!currentTrack) return;
    const realYoutubeId = currentTrack.video_id || currentTrack.id;
    window.open(`/api/download?id=${realYoutubeId}`, '_blank');
}

// --- WYSZUKIWANIE ---
function handleInput(val) {
    clearTimeout(debounceTimer);
    const box = document.getElementById('suggestionsBox');
    if (val.length < 2) { box.classList.add('hidden'); return; }
    debounceTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/api/suggestions?q=${encodeURIComponent(val)}`);
            const suggestions = await res.json();
            if (suggestions.length > 0) {
                box.innerHTML = suggestions.map(s => `
                    <div onclick="applySuggestion('${s}')" class="p-3 hover:bg-gray-700 cursor-pointer text-sm border-b border-gray-700 text-gray-300">
                        <i class="fa-solid fa-magnifying-glass mr-2 text-gray-500"></i> ${s}
                    </div>
                `).join('');
                box.classList.remove('hidden');
            } else { box.classList.add('hidden'); }
        } catch (e) { console.error(e); }
    }, 300);
}

function applySuggestion(text) {
    document.getElementById('searchInp').value = text;
    document.getElementById('suggestionsBox').classList.add('hidden');
    const event = new Event('submit');
    document.querySelector('form').dispatchEvent(event);
}

async function handleSearch(e) {
    e.preventDefault();
    const q = document.getElementById('searchInp').value;
    if(!q) return;
    document.getElementById('suggestionsBox').classList.add('hidden');

    switchTab('search');
    const resDiv = document.getElementById('results');
    resDiv.innerHTML = '<div class="text-center p-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-indigo-500"></i></div>';
    
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        
        lastSearchResults = data;
        renderList(data, resDiv, 'search');
        
    } catch (err) {
        resDiv.innerHTML = '<p class="text-center text-red-400">Błąd wyszukiwania</p>';
    }
}

// --- RENDEROWANIE Z SERDUSZKAMI ---
function renderList(tracks, container, contextName) {
    if(!tracks || tracks.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-4">Pusto.</p>';
        return;
    }
    
    container.innerHTML = tracks.map((t, index) => {
        // Sprawdzamy oba typy ID, żeby serduszko działało
        const trackId = t.video_id || t.id;
        const isLiked = likedTrackIds.has(trackId);
        const heartIcon = isLiked ? 'fa-solid fa-heart text-indigo-500' : 'fa-regular fa-heart text-gray-400';
        
        return `
        <div class="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:bg-gray-800 transition group">
            <div onclick="playContextTrack(${index}, '${contextName}')" 
                 class="relative w-12 h-12 flex-shrink-0 cursor-pointer">
                <img src="${t.thumbnail}" class="w-full h-full rounded object-cover">
                <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition"><i class="fa-solid fa-play text-white text-xs"></i></div>
            </div>
            <div class="flex-1 min-w-0 cursor-pointer" onclick="playContextTrack(${index}, '${contextName}')">
                <p class="font-bold text-sm truncate text-gray-200 cursor-pointer">${t.title}</p>
                <p class="text-xs text-gray-400 truncate cursor-pointer">${t.artist}</p>
            </div>
            <button id="heart-btn-${trackId}" onclick="openPlaylistModal('${trackId}', '${escapeHtml(t.title)}', '${escapeHtml(t.artist)}', '${t.thumbnail}')" 
                    class="w-10 h-10 rounded-full hover:bg-gray-700 flex items-center justify-center transition active:scale-95">
                <i class="${heartIcon}"></i>
            </button>
        </div>
    `}).join('');
}

// --- HOME ---
async function loadHome() {
    try {
        const res = await fetch(`/api/home?user_id=${currentUser.user_id}`);
        const data = await res.json();
        
        document.getElementById('recTitle').innerText = data.title;
        window.homeTracks = data.tracks;

        if(data.tracks.length > 0) {
             document.getElementById('recContainer').innerHTML = data.tracks.map((t, index) => `
                <div onclick="playContextTrack(${index}, 'home')" 
                     class="bg-gray-800 p-3 rounded-xl cursor-pointer hover:bg-gray-700 transition group relative overflow-hidden">
                    <img src="${t.thumbnail}" class="w-full aspect-square object-cover rounded-lg mb-2 shadow-lg">
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <i class="fa-solid fa-play text-white text-3xl"></i>
                    </div>
                    <p class="font-bold text-xs truncate text-gray-200">${t.title}</p>
                    <p class="text-[10px] text-gray-400 truncate">${t.artist}</p>
                </div>
            `).join('');
        } else {
            document.getElementById('recContainer').innerHTML = '<p class="text-gray-500">Brak rekomendacji.</p>';
        }
    } catch (e) { console.error("Home error", e); }
}

// --- BIBLIOTEKA (RENDEROWANIE PLAYLIST) ---
async function loadLibrary() {
    await refreshLikedTracks();
    const playlists = Object.values(loadedPlaylists);
    const container = document.getElementById('playlistsContainer');
    
    if(playlists.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 text-center">Brak playlist. Utwórz pierwszą!</p>';
        return;
    }

    container.innerHTML = playlists.map(pl => `
        <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 transition">
            <div onclick="togglePlaylistContent(${pl.id})" class="flex justify-between items-center cursor-pointer select-none">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-indigo-900/50 rounded flex items-center justify-center text-indigo-400"><i class="fa-solid fa-music"></i></div>
                    <div><h3 class="font-bold text-sm text-gray-200">${pl.name}</h3><p class="text-[10px] text-gray-500">${pl.songs.length} utworów</p></div>
                </div>
                <i id="arrow-${pl.id}" class="fa-solid fa-chevron-down text-gray-500 transition-transform"></i>
            </div>
            <div id="pl-content-${pl.id}" class="hidden mt-4 space-y-2 border-t border-gray-700/50 pt-3">
                </div>
        </div>
    `).join('');

    playlists.forEach(pl => {
        const subContainer = document.getElementById(`pl-content-${pl.id}`);
        renderPlaylistTracks(pl.id, pl.songs, subContainer);
    });
}

function renderPlaylistTracks(playlistId, tracks, container) {
    if(!tracks || tracks.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-600 italic pl-2">Pusto...</p>';
        return;
    }
    container.innerHTML = tracks.map((t, index) => `
        <div class="flex items-center gap-3 p-2 bg-gray-700/30 rounded-lg mb-2 hover:bg-gray-700 transition border border-transparent hover:border-indigo-500/30 cursor-pointer group"
             onclick="playLibraryTrack(${playlistId}, ${index})">
             <div class="relative w-10 h-10 flex-shrink-0">
                <img src="${t.thumbnail}" class="w-full h-full rounded object-cover">
                <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition">
                    <i class="fa-solid fa-play text-white text-[10px]"></i>
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-xs truncate text-gray-200">${t.title}</p>
                <p class="text-[9px] text-gray-400 truncate">${t.artist}</p>
            </div>
        </div>
    `).join('');
}

function togglePlaylistContent(id) {
    document.getElementById(`pl-content-${id}`).classList.toggle('hidden');
    document.getElementById(`arrow-${id}`).classList.toggle('rotate-180');
}

// --- MODAL DODAWANIA I ZMIANA IKONY ---
async function openPlaylistModal(id, title, artist, thumb) {
    trackToAddToPlaylist = { video_id: id, title, artist, thumbnail: thumb };
    document.getElementById('playlistModal').classList.remove('hidden');
    
    if (Object.keys(loadedPlaylists).length === 0) await refreshLikedTracks();
    const playlists = Object.values(loadedPlaylists);
    const container = document.getElementById('modalPlaylists');
    
    if(playlists.length === 0) container.innerHTML = '<p class="text-sm text-gray-400 text-center">Najpierw utwórz playlistę w bibliotece.</p>';
    else container.innerHTML = playlists.map(pl => `
        <button onclick="saveToPlaylist(${pl.id})" class="w-full flex items-center justify-between p-3 bg-gray-700/50 rounded-xl hover:bg-gray-700 mb-2 transition border border-transparent hover:border-indigo-500/50">
            <span class="font-bold text-sm text-gray-200">${pl.name}</span><i class="fa-solid fa-plus text-gray-400"></i>
        </button>
    `).join('');
}

async function saveToPlaylist(plId) {
    await fetch('/api/playlists/add', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ playlist_id: plId, ...trackToAddToPlaylist })
    });

    if (trackToAddToPlaylist) {
        const id = trackToAddToPlaylist.video_id;
        likedTrackIds.add(id);
        const btn = document.getElementById(`heart-btn-${id}`);
        if(btn) {
            btn.innerHTML = '<i class="fa-solid fa-heart text-indigo-500"></i>';
        }
    }
    closeModal();
    refreshLikedTracks();
}

function closeModal() { document.getElementById('playlistModal').classList.add('hidden'); }

// --- HELPERS (Zakładki, Tworzenie Playlisty, Auth) ---
function switchTab(tabId) {
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${tabId}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`btn-${tabId}`).classList.add('active');
    
    if(tabId === 'library') loadLibrary();
    if(tabId === 'search' && lastSearchResults.length > 0) {
        const resDiv = document.getElementById('results');
        if(resDiv.children.length === 0) renderList(lastSearchResults, resDiv, 'search');
    }
}

async function createNewPlaylist() {
    const name = prompt("Podaj nazwę playlisty:");
    if(!name) return;
    await fetch('/api/playlists', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({user_id: currentUser.user_id, name})
    });
    loadLibrary();
}

function escapeHtml(text) { if (!text) return ""; return text.replace(/'/g, "&apos;").replace(/"/g, "&quot;"); }
function logout() { localStorage.removeItem('hamstify_user'); location.reload(); }

window.toggleAuthMode = function(mode) {
    authMode = mode;
    const emailInp = document.getElementById('loginEmail');
    const btn = document.getElementById('authBtn');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    document.getElementById('authMsg').innerText = '';
    if (mode === 'register') {
        emailInp.classList.remove('hidden'); btn.innerText = "ZAREJESTRUJ SIĘ";
        tabRegister.classList.add('bg-indigo-600', 'text-white', 'font-bold'); tabRegister.classList.remove('text-gray-400');
        tabLogin.classList.remove('bg-indigo-600', 'text-white', 'font-bold'); tabLogin.classList.add('text-gray-400');
    } else {
        emailInp.classList.add('hidden'); btn.innerText = "ZALOGUJ SIĘ";
        tabLogin.classList.add('bg-indigo-600', 'text-white', 'font-bold'); tabLogin.classList.remove('text-gray-400');
        tabRegister.classList.remove('bg-indigo-600', 'text-white', 'font-bold'); tabRegister.classList.add('text-gray-400');
    }
}
window.handleAuthAction = async function() {
    const u = document.getElementById('loginUser').value;
    const p = document.getElementById('loginPass').value;
    const e = document.getElementById('loginEmail').value;
    const msg = document.getElementById('authMsg');
    if (!u || !p) { msg.innerText = "Podaj login i hasło"; return; }
    if (authMode === 'register') {
        if (!e) { msg.innerText = "Podaj email"; return; }
        msg.innerText = "Wysyłanie maila...";
        try {
            const res = await fetch('/api/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: u, password: p, email: e}) });
            const data = await res.json();
            if (res.ok) { msg.classList.replace('text-red-400', 'text-green-400'); msg.innerText = "Wysłano link! Sprawdź email."; setTimeout(() => toggleAuthMode('login'), 3000); }
            else { msg.classList.replace('text-green-400', 'text-red-400'); msg.innerText = data.detail || "Błąd rejestracji"; }
        } catch (err) { msg.innerText = "Błąd połączenia"; }
    } else {
        msg.innerText = "Logowanie...";
        try {
            const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: u, password: p}) });
            if (res.ok) { const data = await res.json(); currentUser = data; localStorage.setItem('hamstify_user', JSON.stringify(currentUser)); showApp(); }
            else { const data = await res.json(); msg.classList.replace('text-green-400', 'text-red-400'); msg.innerText = data.detail || "Błąd logowania"; }
        } catch (err) { msg.innerText = "Błąd połączenia"; }
    }
}