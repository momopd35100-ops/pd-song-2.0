const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Assicuratevi che la cartella 'uploads' esista
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));
app.use(express.json());

let queue = [];
let currentSong = null;

// Endpoint per caricare le canzoni
app.post('/upload', upload.array('songs'), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Nessun file caricato.' });
        }

        const newSongs = req.files.map(file => ({
            id: Date.now() + Math.random().toString(36).substring(2, 9),
            name: file.originalname,
            url: `/uploads/${file.filename}`
        }));

        // Aggiungiamo alla coda globale
        queue.push(...newSongs);
        
        // Se non c'è una canzone in riproduzione, facciamo partire la prima
        if (!currentSong && queue.length > 0) {
            currentSong = queue.shift();
            currentSong.isPlaying = true;
            currentSong.currentTime = 0;
        }

        io.emit('updateState', { queue, currentSong });
        res.json({ success: true, added: newSongs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Errore durante il caricamento.' });
    }
});

io.on('connection', (socket) => {
    // Invia lo stato attuale appena un utente si collega
    socket.emit('updateState', { queue, currentSong });

    socket.on('playSong', (songId) => {
        const index = queue.findIndex(s => s.id === songId);
        if (index !== -1) {
            currentSong = queue.splice(index, 1)[0];
            currentSong.isPlaying = true;
            currentSong.currentTime = 0;
            io.emit('updateState', { queue, currentSong });
        }
    });

    socket.on('removeSong', (songId) => {
        queue = queue.filter(s => s.id !== songId);
        if (currentSong && currentSong.id === songId) {
            if (queue.length > 0) {
                currentSong = queue.shift();
                currentSong.isPlaying = true;
                currentSong.currentTime = 0;
            } else {
                currentSong = null;
            }
        }
        io.emit('updateState', { queue, currentSong });
    });

    socket.on('pause', () => {
        if (currentSong) {
            currentSong.isPlaying = false;
            io.emit('updateState', { queue, currentSong });
        }
    });

    socket.on('resume', () => {
        if (currentSong) {
            currentSong.isPlaying = true;
            io.emit('updateState', { queue, currentSong });
        }
    });

    socket.on('next', () => {
        if (queue.length > 0) {
            currentSong = queue.shift();
            currentSong.isPlaying = true;
            currentSong.currentTime = 0;
        } else {
            currentSong = null;
        }
        io.emit('updateState', { queue, currentSong });
    });

    socket.on('clearQueue', () => {
        queue = [];
        currentSong = null;
        io.emit('updateState', { queue, currentSong });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server attivo sulla porta ${PORT}`);
});