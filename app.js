const socket = io(); // Si collega in automatico al server cloud (Render o locale)

const audioPlayer = document.getElementById('audioPlayer');
const queueList = document.getElementById('queueList');
const playPauseBtn = document.getElementById('playPauseBtn');
const skipBtn = document.getElementById('skipBtn');
const stopBtn = document.getElementById('stopBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const nowPlaying = document.getElementById('nowPlaying');
const dropZone = document.getElementById('dropZone');
const audioFile = document.getElementById('audioFile');

let queue = [];
let currentSong = null;
let isHostAction = false; // Evita loop di eventi

// Gestione upload file al server
function handleFiles(files) {
    const formData = new FormData();
    for (let file of files) {
        formData.append('songs', file);
    }

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            alert('Errore durante il caricamento');
        }
    })
    .catch(err => console.error('Errore upload:', err));
}

if (audioFile) {
    audioFile.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        audioFile.value = '';
    });
}

if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
        }
    });
}

// --- RICEZIONE DATI DAL SERVER (TEMPO REALE) ---

socket.on('updateQueue', (data) => {
    queue = data.queue;
    currentSong = data.currentSong;
    renderQueue();
});

socket.on('play', (song) => {
    currentSong = song;
    audioPlayer.src = song.url;
    audioPlayer.style.display = 'block';
    audioPlayer.play().catch(err => console.log("Interazione richiesta per l'audio"));
    playPauseBtn.textContent = 'Pausa';
    nowPlaying.textContent = `In riproduzione: ${song.title}`;
    renderQueue();
});

socket.on('pause', () => {
    audioPlayer.pause();
    playPauseBtn.textContent = 'Play';
    if (currentSong) {
        nowPlaying.textContent = `In pausa: ${currentSong.title}`;
    }
});

socket.on('resume', () => {
    audioPlayer.play();
    playPauseBtn.textContent = 'Pausa';
    if (currentSong) {
        nowPlaying.textContent = `In riproduzione: ${currentSong.title}`;
    }
});

socket.on('seek', (time) => {
    if (Math.abs(audioPlayer.currentTime - time) > 1) {
        audioPlayer.currentTime = time;
    }
});

socket.on('stop', () => {
    audioPlayer.pause();
    audioPlayer.src = '';
    audioPlayer.style.display = 'none';
    playPauseBtn.textContent = 'Play';
    nowPlaying.textContent = "In riproduzione: Nessuna canzone";
});

// --- COMANDI UTENTE (INVIATI AL SERVER) ---

function renderQueue() {
    if (!queueList) return;
    queueList.innerHTML = '';
    queue.forEach((song) => {
        const li = document.createElement('li');
        li.textContent = song.title;

        // Tasto per mettere in riproduzione immediata
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶ Avvia';
        playBtn.onclick = () => socket.emit('playSong', song.id);

        // Tasto rimuovi
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '❌';
        removeBtn.onclick = () => socket.emit('removeSong', song.id);

        li.appendChild(playBtn);
        li.appendChild(removeBtn);
        queueList.appendChild(li);
    });
}

if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
        if (audioPlayer.paused) {
            if (currentSong) {
                socket.emit('resume');
            } else if (queue.length > 0) {
                socket.emit('playSong', queue[0].id);
            }
        } else {
            socket.emit('pause');
        }
    });
}

if (skipBtn) {
    skipBtn.addEventListener('click', () => {
        socket.emit('next');
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        socket.emit('pause');
        audioPlayer.currentTime = 0;
    });
}

if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', () => {
        // Svuota la coda via socket (puoi aggiungere l'evento nel server se vuoi)
        window.location.reload();
    });
}

// Passaggio automatico a fine brano
audioPlayer.addEventListener('ended', () => {
    socket.emit('next');
});