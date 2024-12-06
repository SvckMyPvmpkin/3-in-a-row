const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('.'));

app.get('/health', (req, res) => {
    res.send('OK');
});

const GAME_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.gameStarted = false;
        this.gameEndTime = null;
    }

    addPlayer(socket, playerName) {
        this.players.set(socket.id, {
            id: socket.id,
            name: playerName,
            score: 0,
            socket: socket
        });

        if (this.players.size >= MIN_PLAYERS && !this.gameStarted) {
            this.startGame();
        }
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        if (this.players.size < MIN_PLAYERS && this.gameStarted) {
            this.endGame();
        }
    }

    startGame() {
        this.gameStarted = true;
        this.gameEndTime = Date.now() + GAME_DURATION;
        
        this.broadcast('gameStart', {
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                score: p.score
            })),
            endTime: this.gameEndTime
        });

        setTimeout(() => this.endGame(), GAME_DURATION);
    }

    endGame() {
        if (!this.gameStarted) return;
        
        this.gameStarted = false;
        const scores = Array.from(this.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        })).sort((a, b) => b.score - a.score);

        this.broadcast('gameEnd', { scores });
    }

    updateScore(socketId, points) {
        const player = this.players.get(socketId);
        if (player) {
            player.score += points;
            this.broadcast('scoreUpdate', {
                playerId: socketId,
                score: player.score
            });
        }
    }

    broadcast(event, data) {
        this.players.forEach(player => {
            player.socket.emit(event, data);
        });
    }

    isFull() {
        return this.players.size >= MAX_PLAYERS;
    }
}

const rooms = new Map();

function findOrCreateRoom() {
    for (const [id, room] of rooms) {
        if (!room.gameStarted && !room.isFull()) {
            return room;
        }
    }
    const newRoom = new GameRoom(Date.now().toString());
    rooms.set(newRoom.id, newRoom);
    return newRoom;
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('joinGame', (playerName) => {
        currentRoom = findOrCreateRoom();
        currentRoom.addPlayer(socket, playerName);
        socket.emit('roomJoined', { roomId: currentRoom.id });
    });

    socket.on('move', (data) => {
        if (currentRoom && currentRoom.gameStarted) {
            currentRoom.broadcast('playerMove', {
                playerId: socket.id,
                ...data
            });
        }
    });

    socket.on('scoreUpdate', (points) => {
        if (currentRoom && currentRoom.gameStarted) {
            currentRoom.updateScore(socket.id, points);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom) {
            currentRoom.removePlayer(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
