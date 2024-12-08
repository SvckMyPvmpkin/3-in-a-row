class MultiplayerMatch3Game {
    constructor() {
        this.socket = io();
        this.grid = [];
        this.gridSize = 8;
        this.selectedGem = null;
        this.gemTypes = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
        this.gridElement = document.querySelector('.grid');
        this.gemElements = new Map();
        this.cellSize = 52; // 50px + 2px gap
        this.playerId = null;
        this.gameActive = false;
        this.isAnimating = false;
        
        // Добавляем обработчик кликов на всю сетку
        this.gridElement.addEventListener('click', (e) => this.handleGridClick(e));
        
        this.setupSocketListeners();
        this.setupUIListeners();
    }

    getClickCoordinates(event) {
        const rect = this.gridElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Вычисляем координаты в сетке
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        
        // Проверяем, что координаты в пределах сетки
        if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
            return { row, col };
        }
        return null;
    }

    handleGridClick(event) {
        if (!this.gameActive || this.isAnimating) return;

        const coords = this.getClickCoordinates(event);
        if (!coords) return;

        const { row, col } = coords;
        
        if (!this.selectedGem) {
            this.selectedGem = { row, col };
            const gem = this.getGemElement(row, col);
            if (gem) {
                gem.classList.add('selected');
            }
        } else {
            const previousGem = this.getGemElement(this.selectedGem.row, this.selectedGem.col);
            if (previousGem) {
                previousGem.classList.remove('selected');
            }

            if (this.isAdjacent(this.selectedGem, { row, col })) {
                this.swapGems(this.selectedGem, { row, col });
                this.socket.emit('move', {
                    from: this.selectedGem,
                    to: { row, col }
                });
            }
            
            this.selectedGem = null;
        }
    }

    updateGemPosition(element, row, col) {
        if (!element) return;
        element.style.transform = `translate(${col * this.cellSize}px, ${row * this.cellSize}px)`;
    }

    renderGrid() {
        this.gridElement.innerHTML = '';
        this.gemElements.clear();
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const gem = document.createElement('div');
                gem.className = `gem gem-${this.grid[row][col]}`;
                this.updateGemPosition(gem, row, col);
                this.gridElement.appendChild(gem);
                this.gemElements.set(`${row}-${col}`, gem);
            }
        }
    }

    setupSocketListeners() {
        this.socket.on('roomJoined', ({ roomId }) => {
            console.log('Joined room:', roomId);
        });

        this.socket.on('gameStart', ({ players, endTime, grid }) => {
            this.gameActive = true;
            this.showGameScreen();
            this.startTimer(endTime);
            this.updatePlayersList(players);
            // Используем полученную с сервера сетку
            this.grid = grid;
            this.init();
        });

        this.socket.on('playerMove', (data) => {
            // Обрабатываем только свои ходы
            if (data.playerId === this.socket.id) {
                this.handleServerMove(data);
            }
        });

        this.socket.on('scoreUpdate', ({ playerId, score }) => {
            this.updatePlayerScore(playerId, score);
        });

        this.socket.on('gameEnd', ({ scores }) => {
            this.gameActive = false;
            this.showEndScreen(scores);
        });
    }

    setupUIListeners() {
        document.getElementById('join-game').addEventListener('click', () => {
            const playerName = document.getElementById('player-name').value.trim();
            if (playerName) {
                this.socket.emit('joinGame', playerName);
            }
        });

        document.getElementById('play-again').addEventListener('click', () => {
            location.reload();
        });
    }

    showGameScreen() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
    }

    showEndScreen(scores) {
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('end-screen').classList.remove('hidden');
        
        const scoresHtml = scores.map((score, index) => `
            <div class="score-entry ${index === 0 ? 'winner' : ''}">
                ${index + 1}. ${score.name}: ${score.score}
            </div>
        `).join('');
        
        document.getElementById('final-scores').innerHTML = scoresHtml;
    }

    updatePlayersList(players) {
        const playersHtml = players.map(player => `
            <div class="player-score ${player.id === this.socket.id ? 'current' : ''}" id="player-${player.id}">
                ${player.name}: <span class="score">${player.score}</span>
            </div>
        `).join('');
        
        document.getElementById('players-list').innerHTML = playersHtml;
    }

    updatePlayerScore(playerId, score) {
        const playerElement = document.getElementById(`player-${playerId}`);
        if (playerElement) {
            playerElement.querySelector('.score').textContent = score;
        }
    }

    startTimer(endTime) {
        const timerElement = document.getElementById('timer');
        
        const updateTimer = () => {
            const now = Date.now();
            const timeLeft = Math.max(0, endTime - now);
            
            if (timeLeft === 0) {
                clearInterval(this.timerInterval);
                return;
            }

            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

        this.timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
    }

    init() {
        // Больше не создаем сетку здесь, так как получаем её с сервера
        this.renderGrid();
        this.checkAndRemoveMatches();
    }

    createGrid() {
        for (let row = 0; row < this.gridSize; row++) {
            this.grid[row] = [];
            for (let col = 0; col < this.gridSize; col++) {
                let gemType;
                do {
                    gemType = this.getRandomGemType();
                    this.grid[row][col] = gemType;
                } while (this.checkInitialMatch(row, col));
            }
        }
    }

    getRandomGemType() {
        return this.gemTypes[Math.floor(Math.random() * this.gemTypes.length)];
    }

    checkInitialMatch(row, col) {
        if (col >= 2) {
            if (this.grid[row][col-1] === this.grid[row][col] && 
                this.grid[row][col-2] === this.grid[row][col]) {
                return true;
            }
        }
        if (row >= 2) {
            if (this.grid[row-1][col] === this.grid[row][col] && 
                this.grid[row-2][col] === this.grid[row][col]) {
                return true;
            }
        }
        return false;
    }

    getGemElement(row, col) {
        const key = `${row}-${col}`;
        const element = this.gemElements.get(key);
        if (element) {
            // Проверяем, что элемент все еще в DOM
            if (!element.isConnected) {
                this.gemElements.delete(key);
                return null;
            }
            return element;
        }
        return null;
    }

    isAdjacent(gem1, gem2) {
        const rowDiff = Math.abs(gem1.row - gem2.row);
        const colDiff = Math.abs(gem1.col - gem2.col);
        return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    }

    showOpponentMove(data) {
        const { from, to } = data;
        this.swapGems(from, to);
    }

    handleServerMove(data) {
        const { from, to } = data;
        this.swapGems(from, to);
    }

    async swapGems(gem1, gem2) {
        if (this.isAnimating) return;
        this.isAnimating = true;

        const element1 = this.getGemElement(gem1.row, gem1.col);
        const element2 = this.getGemElement(gem2.row, gem2.col);

        if (!element1 || !element2) {
            this.isAnimating = false;
            return;
        }

        element1.classList.add('swapping');
        element2.classList.add('swapping');

        // Обновляем позиции в DOM
        this.updateGemPosition(element1, gem2.row, gem2.col);
        this.updateGemPosition(element2, gem1.row, gem1.col);

        // Обновляем данные в сетке
        const temp = this.grid[gem1.row][gem1.col];
        this.grid[gem1.row][gem1.col] = this.grid[gem2.row][gem2.col];
        this.grid[gem2.row][gem2.col] = temp;

        // Обновляем кэш элементов
        this.gemElements.set(`${gem1.row}-${gem1.col}`, element2);
        this.gemElements.set(`${gem2.row}-${gem2.col}`, element1);

        await new Promise(resolve => setTimeout(resolve, 300));

        element1.classList.remove('swapping');
        element2.classList.remove('swapping');

        if (!await this.checkAndRemoveMatches()) {
            // Отменяем свап
            this.updateGemPosition(element1, gem1.row, gem1.col);
            this.updateGemPosition(element2, gem2.row, gem2.col);

            const temp = this.grid[gem1.row][gem1.col];
            this.grid[gem1.row][gem1.col] = this.grid[gem2.row][gem2.col];
            this.grid[gem2.row][gem2.col] = temp;

            this.gemElements.set(`${gem1.row}-${gem1.col}`, element1);
            this.gemElements.set(`${gem2.row}-${gem2.col}`, element2);

            await new Promise(resolve => setTimeout(resolve, 300));
        }

        this.isAnimating = false;
    }

    async checkAndRemoveMatches() {
        const matches = this.findMatches();
        if (matches.length === 0) return false;

        // Помечаем совпавшие элементы для анимации
        const matchedElements = new Set();
        matches.flat().forEach(({row, col}) => {
            const gem = this.getGemElement(row, col);
            if (gem) {
                gem.classList.add('matched');
                matchedElements.add(`${row}-${col}`);
            }
        });

        await new Promise(resolve => setTimeout(resolve, 300));

        // Удаляем совпавшие элементы
        matchedElements.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const gem = this.getGemElement(row, col);
            if (gem && gem.parentNode) {
                gem.parentNode.removeChild(gem);
            }
            this.gemElements.delete(key);
            this.grid[row][col] = null;
        });

        const points = matches.reduce((total, match) => total + match.length * 10, 0);
        this.socket.emit('scoreUpdate', points);

        await this.dropGems();
        await this.fillEmptySpaces();
        await this.checkAndRemoveMatches();
        return true;
    }

    async dropGems() {
        let dropped = false;
        const moves = [];

        // Сначала собираем все возможные движения
        for (let col = 0; col < this.gridSize; col++) {
            let emptyRow = this.gridSize - 1;
            while (emptyRow >= 0) {
                if (this.grid[emptyRow][col] === null) {
                    let gemRow = emptyRow - 1;
                    while (gemRow >= 0 && this.grid[gemRow][col] === null) {
                        gemRow--;
                    }

                    if (gemRow >= 0) {
                        const gem = this.getGemElement(gemRow, col);
                        if (gem) {
                            moves.push({
                                element: gem,
                                fromRow: gemRow,
                                fromCol: col,
                                toRow: emptyRow,
                                toCol: col
                            });

                            // Обновляем данные в сетке
                            this.grid[emptyRow][col] = this.grid[gemRow][col];
                            this.grid[gemRow][col] = null;

                            dropped = true;
                        }
                    }
                }
                emptyRow--;
            }
        }

        // Затем применяем все движения одновременно
        if (moves.length > 0) {
            moves.forEach(move => {
                move.element.classList.add('dropping');
                this.updateGemPosition(move.element, move.toRow, move.toCol);
                
                // Обновляем кэш элементов
                this.gemElements.delete(`${move.fromRow}-${move.fromCol}`);
                this.gemElements.set(`${move.toRow}-${move.toCol}`, move.element);
            });

            await new Promise(resolve => setTimeout(resolve, 300));

            moves.forEach(move => {
                move.element.classList.remove('dropping');
            });
        }

        return dropped;
    }

    async fillEmptySpaces() {
        const newGems = [];

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.grid[row][col] === null) {
                    const gemType = this.getRandomGemType();
                    this.grid[row][col] = gemType;

                    const gem = document.createElement('div');
                    gem.className = `gem gem-${gemType}`;
                    gem.dataset.row = row;
                    gem.dataset.col = col;
                    
                    // Начальная позиция над сеткой
                    gem.style.transform = `translate(${col * this.cellSize}px, ${-this.cellSize}px)`;
                    this.gridElement.appendChild(gem);

                    // Добавляем обработчик клика после добавления в DOM
                    gem.addEventListener('click', (e) => {
                        const currentRow = parseInt(gem.dataset.row);
                        const currentCol = parseInt(gem.dataset.col);
                        this.handleGridClick(e);
                    });

                    newGems.push({
                        element: gem,
                        row: row,
                        col: col
                    });

                    this.gemElements.set(`${row}-${col}`, gem);
                }
            }
        }

        if (newGems.length > 0) {
            // Анимируем падение новых камней
            requestAnimationFrame(() => {
                newGems.forEach(({element, row, col}) => {
                    element.classList.add('dropping');
                    this.updateGemPosition(element, row, col);
                });
            });

            await new Promise(resolve => setTimeout(resolve, 300));

            newGems.forEach(({element}) => {
                element.classList.remove('dropping');
            });
        }
    }

    findMatches() {
        const matches = [];
        
        // Check horizontal matches
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize - 2; col++) {
                const match = this.checkMatch(row, col, 0, 1);
                if (match.length >= 3) matches.push(match);
            }
        }

        // Check vertical matches
        for (let row = 0; row < this.gridSize - 2; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const match = this.checkMatch(row, col, 1, 0);
                if (match.length >= 3) matches.push(match);
            }
        }

        return matches;
    }

    checkMatch(row, col, rowDelta, colDelta) {
        const match = [{row, col}];
        const gemType = this.grid[row][col];
        
        if (!gemType) return [];

        let currentRow = row + rowDelta;
        let currentCol = col + colDelta;

        while (
            currentRow < this.gridSize && 
            currentCol < this.gridSize && 
            this.grid[currentRow][currentCol] === gemType
        ) {
            match.push({row: currentRow, col: currentCol});
            currentRow += rowDelta;
            currentCol += colDelta;
        }

        return match;
    }
}

// Start the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MultiplayerMatch3Game();
});
