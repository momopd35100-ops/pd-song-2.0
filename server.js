const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const uploadDir = path.join(__dirname, 'public', 'uploads');
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

app.use(express.static(path.join(__dirname, 'public')));
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
            title: file.originalname,
            url: `/uploads/${file.filename}`
        }));

        queue.push(...newSongs);
        io.emit('updateQueue', { queue, currentSong });

        res.json({ success: true, added: newSongs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Errore durante il caricamento del file.' });
    }
});

io.on('connection', (socket) => {
    socket.emit('updateQueue', { queue, currentSong });

    socket.emit('sync', {
        currentSong,
        currentTime: currentSong ? currentSong.currentTime : 0,
        isPlaying: currentSong ? currentSong.isPlaying : false
    });

    socket.on('playSong', (songId) => {
        const index = queue.findIndex(s => s.id === songId);
        if (index !== -1) {
            currentSong = queue.splice(index, 1)[0];
            currentSong.isPlaying = true;
            currentSong.currentTime = 0;
            io.emit('updateQueue', { queue, currentSong });
            io.emit('play', currentSong);
        }
    });

    socket.on('removeSong', (songId) => {
        queue = queue.filter(s => s.id !== songId);
        io.emit('updateQueue', { queue, currentSong });
    });

    socket.on('pause', () => {
        if (currentSong) {
            currentSong.isPlaying = false;
            io.emit('pause');
        }
    });

    socket.on('resume', () => {
        if (currentSong) {
            currentSong.isPlaying = true;
            io.emit('resume');
        }
    });

    socket.on('seek', (time) => {
        if (currentSong) {
            currentSong.currentTime = time;
            io.emit('seek', time);
        }
    });

    socket.on('next', () => {
        if (queue.length > 0) {
            currentSong = queue.shift();
            currentSong.isPlaying = true;
            currentSong.currentTime = 0;
            io.emit('updateQueue', { queue, currentSong });
            io.emit('play', currentSong);
        } else {
            currentSong = null;
            io.emit('updateQueue', { queue, currentSong });
            io.emit('stop');
        }
    });
});

// MODIFICA CHIAVE PER IL CLOUD: Usa la porta dinamica di Render o 3000 in locale
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server PD-SONG2.0 attivo sulla porta ${PORT}`);
});