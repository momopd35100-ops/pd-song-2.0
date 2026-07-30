const audioFile = document.getElementById('audioFile');
const audioPlayer = document.getElementById('audioPlayer');
const libraryList = document.getElementById('libraryList');
const queueList = document.getElementById('queueList');
const playPauseBtn = document.getElementById('playPauseBtn');
const skipBtn = document.getElementById('skipBtn');
const stopBtn = document.getElementById('stopBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const clearLibraryBtn = document.getElementById('clearLibraryBtn');
const nowPlaying = document.getElementById('nowPlaying');
const dropZone = document.getElementById('dropZone');

let db;
let library = [];
let queue = [];
let currentIndex = 0;
let isProcessingFiles = false;

// Apertura database IndexedDB
const request = indexedDB.open('PDSongDB', 1);

request.onerror = (event) => {
    console.error("Errore apertura database", event);
};

request.onsuccess = (event) => {
    db = event.target.result;
    loadLibraryFromDB();
};

request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
};

// Carica la libreria salvata
function loadLibraryFromDB() {
    library = [];
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const cursorRequest = store.openCursor();

    cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            library.push(cursor.value);
            cursor.continue();
        } else {
            renderLibrary();
        }
    };
}

// Gestione caricamento file
function handleFiles(files) {
    if (isProcessingFiles) return;
    isProcessingFiles = true;

    const uniqueFiles = Array.from(files).reduce((acc, file) => {
        if (!acc.some(f => f.name === file.name && f.size === file.size)) {
            acc.push(file);
        }
        return acc;
    }, []);

    let processedCount = 0;

    if (uniqueFiles.length === 0) {
        isProcessingFiles = false;
        return;
    }

    uniqueFiles.forEach(file => {
        const alreadyExists = library.some(song => song.name === file.name);
        if (!alreadyExists) {
            const transaction = db.transaction(['songs'], 'readwrite');
            const store = transaction.objectStore('songs');
            store.add({ name: file.name, size: file.size, fileData: file });

            transaction.oncomplete = () => {
                processedCount++;
                if (processedCount === uniqueFiles.length) {
                    loadLibraryFromDB();
                    setTimeout(() => { isProcessingFiles = false; }, 300);
                }
            };
        } else {
            processedCount++;
            if (processedCount === uniqueFiles.length) {
                setTimeout(() => { isProcessingFiles = false; }, 300);
            }
        }
    });
}

audioFile.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    audioFile.value = '';
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#fff';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#1db954';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#1db954';
    if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
    }
});

// Mostra la libreria a schermo
function renderLibrary() {
    libraryList.innerHTML = '';
    library.forEach((song) => {
        const li = document.createElement('li');
        li.textContent = song.name;
       
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Metti in coda';
        addBtn.onclick = () => addToQueue(song);
       
        li.appendChild(addBtn);
        libraryList.appendChild(li);
    });
}

// Tasto Svuota Libreria protetto dalla password "2009"
clearLibraryBtn.addEventListener('click', () => {
    const password = prompt("Inserisci la password per svuotare tutta la libreria:");
    if (password === "2009") {
        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        store.clear();

        transaction.oncomplete = () => {
            library = [];
            renderLibrary();
            audioPlayer.pause();
            audioPlayer.src = '';
            audioPlayer.style.display = 'none';
            queue = [];
            currentIndex = 0;
            renderQueue();
            nowPlaying.textContent = "In riproduzione: Nessuna canzone";
            playPauseBtn.textContent = 'Play';
            alert("Libreria svuotata con successo.");
        };
    } else if (password !== null) {
        alert("Password errata!");
    }
});

// Aggiungi alla coda
function addToQueue(song) {
    queue.push(song);
    renderQueue();

    if (audioPlayer.paused && queue.length === 1) {
        playSong(0);
    }
}

// Rimuovi singola canzone dalla coda
function removeFromQueue(index, event) {
    event.stopPropagation();
   
    if (index === currentIndex) {
        audioPlayer.pause();
        queue.splice(index, 1);
        if (queue.length > 0) {
            if (currentIndex >= queue.length) currentIndex = 0;
            playSong(currentIndex);
        } else {
            audioPlayer.src = '';
            audioPlayer.style.display = 'none';
            nowPlaying.textContent = "In riproduzione: Nessuna canzone";
            playPauseBtn.textContent = 'Play';
            currentIndex = 0;
        }
    } else {
        queue.splice(index, 1);
        if (index < currentIndex) {
            currentIndex--;
        }
    }
    renderQueue();
}

// Renderizza la coda con tasto di rimozione singolo per ciascuna
function renderQueue() {
    queueList.innerHTML = '';
    queue.forEach((song, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${song.name}`;
       
        if (index === currentIndex && !audioPlayer.paused) {
            li.classList.add('active');
        }

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '❌ Rimuovi';
        removeBtn.className = 'delete-btn';
        removeBtn.onclick = (e) => removeFromQueue(index, e);

        li.appendChild(removeBtn);
        queueList.appendChild(li);
    });
}

// Riproduci brano
function playSong(index) {
    if (index >= 0 && index < queue.length) {
        currentIndex = index;
        const fileURL = URL.createObjectURL(queue[currentIndex].fileData);
        audioPlayer.src = fileURL;
        audioPlayer.style.display = 'block';
       
        audioPlayer.play().then(() => {
            playPauseBtn.textContent = 'Pausa';
            nowPlaying.textContent = `In riproduzione: ${queue[currentIndex].name}`;
        }).catch(err => {
            console.error("Errore riproduzione:", err);
        });
       
        renderQueue();
    }
}

// Passaggio automatico a fine brano
audioPlayer.addEventListener('ended', () => {
    currentIndex++;
    if (currentIndex < queue.length) {
        playSong(currentIndex);
    } else {
        nowPlaying.textContent = "In riproduzione: Fine della coda";
        playPauseBtn.textContent = 'Play';
        currentIndex = 0;
        renderQueue();
    }
});

// Tasto Skippa ⏭️
skipBtn.addEventListener('click', () => {
    if (queue.length === 0) return;
    currentIndex++;
    if (currentIndex < queue.length) {
        playSong(currentIndex);
    } else {
        audioPlayer.pause();
        audioPlayer.src = '';
        audioPlayer.style.display = 'none';
        nowPlaying.textContent = "In riproduzione: Fine della coda";
        playPauseBtn.textContent = 'Play';
        currentIndex = 0;
        renderQueue();
    }
});

// Tasto Play / Pausa
playPauseBtn.addEventListener('click', () => {
    if (queue.length === 0) return;

    if (audioPlayer.paused) {
        if (!audioPlayer.src) {
            playSong(currentIndex);
        } else {
            audioPlayer.play();
            playPauseBtn.textContent = 'Pausa';
        }
    } else {
        audioPlayer.pause();
        playPauseBtn.textContent = 'Play';
    }
});

// Tasto Stop
stopBtn.addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    playPauseBtn.textContent = 'Play';
    if (queue.length > 0) {
        nowPlaying.textContent = `In pausa: ${queue[currentIndex].name}`;
    }
});

// Tasto Cancella Coda intera
clearQueueBtn.addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.src = '';
    audioPlayer.style.display = 'none';
    queue = [];
    currentIndex = 0;
    renderQueue();
    nowPlaying.textContent = "In riproduzione: Nessuna canzone";
    playPauseBtn.textContent = 'Play';
});