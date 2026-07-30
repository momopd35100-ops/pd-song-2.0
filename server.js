const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Assicura che la cartella uploads esista all'avvio
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Pulisce il nome del file da spazi o caratteri strani
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + safeName);
    }
});

const upload = multer({ storage: storage });

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));
app.use(express.json());

let queue = [];
let currentSong = null;

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

        queue.push(...newSongs);

        if (!currentSong && queue.length > 0) {
            currentSong = queue.shift();
            currentSong.isPlaying = true;
            currentSong.currentTime = 0;
        }

        io.emit('updateState', { queue, currentSong });
        res.json({ success: true, added: newSongs });
    } catch (err) {
        console.error("Errore upload backend:", err);
        res.status(500).json({ error: 'Errore durante il salvataggio del file.' });
    }
});

io.on('connection', (socket) => {
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