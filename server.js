const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});


app.use(express.static('public'));

app.get('/health', (req, res) => {
    res.send('OK');
});

const GAME_DURATION = 5 * 60 * 1000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.gameStarted = false;
        this.gameEndTime = null;
        this.playerGrids = new Map();
    }

    addPlayer(socket, playerName) {
        this.players.set(socket.id, {
            id: socket.id,
            name: playerName,
            score: 0,
            socket: socket
        });

        this.playerGrids.set(socket.id, this.generateInitialGrid());

        if (this.players.size >= MIN_PLAYERS && !this.gameStarted) {
            this.startGame();
        }
    }

    generateInitialGrid() {
        const gridSize = 8;
        const gemTypes = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
        const grid = [];

        for (let row = 0; row < gridSize; row++) {
            grid[row] = [];
            for (let col = 0; col < gridSize; col++) {
                let gemType;
                do {
                    gemType = gemTypes[Math.floor(Math.random() * gemTypes.length)];
                    grid[row][col] = gemType;
                } while (this.checkInitialMatch(grid, row, col));
            }
        }

        return grid;
    }

    checkInitialMatch(grid, row, col) {
        if (col >= 2) {
            if (grid[row][col-1] === grid[row][col] && 
                grid[row][col-2] === grid[row][col]) {
                return true;
            }
        }
        if (row >= 2) {
            if (grid[row-1][col] === grid[row][col] && 
                grid[row-2][col] === grid[row][col]) {
                return true;
            }
        }
        return false;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        this.playerGrids.delete(socketId);
        if (this.players.size < MIN_PLAYERS && this.gameStarted) {
            this.endGame();
        }
    }

    startGame() {
        this.gameStarted = true;
        this.gameEndTime = Date.now() + GAME_DURATION;
        
        this.players.forEach(player => {
            player.socket.emit('gameStart', {
                players: Array.from(this.players.values()).map(p => ({
                    id: p.id,
                    name: p.name,
                    score: p.score
                })),
                endTime: this.gameEndTime,
                grid: this.playerGrids.get(player.id)
            });
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

    handleMove(socketId, moveData) {
        if (!this.gameStarted) return;

        const playerGrid = this.playerGrids.get(socketId);
        if (!playerGrid) return;

        const player = this.players.get(socketId);
        if (player) {
            player.socket.emit('playerMove', {
                playerId: socketId,
                ...moveData
            });
        }
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
            currentRoom.handleMove(socket.id, data);
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
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
