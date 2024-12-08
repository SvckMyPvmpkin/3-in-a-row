class MultiplayerMatch3Game {
    constructor() {
        this.socket = io();
        this.grid = [];
        this.gridSize = 8;
        this.selectedGem = null;
        this.gemTypes = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
        this.gridElement = document.querySelector('.grid');
        this.gemElements = new Map(); // Кэш DOM-элементов
        this.cellSize = 52; // 50px + 2px gap
        this.playerId = null;
        this.gameActive = false;
        this.isAnimating = false;
        this.setupSocketListeners();
        this.setupUIListeners();
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

    renderGrid() {
        this.gridElement.innerHTML = '';
        this.gemElements.clear();
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const gem = document.createElement('div');
                gem.className = `gem gem-${this.grid[row][col]}`;
                gem.style.transform = `translate(${col * this.cellSize}px, ${row * this.cellSize}px)`;
                gem.dataset.row = row;
                gem.dataset.col = col;
                gem.addEventListener('click', () => this.handleGemClick(row, col));
                this.gridElement.appendChild(gem);
                this.gemElements.set(`${row}-${col}`, gem);
            }
        }
    }

    getGemElement(row, col) {
        return this.gemElements.get(`${row}-${col}`);
    }

    handleGemClick(row, col) {
        if (!this.gameActive) return;

        const clickedGem = { row, col };
        
        if (!this.selectedGem) {
            this.selectedGem = clickedGem;
            this.getGemElement(row, col).classList.add('selected');
        } else {
            const previousGem = this.getGemElement(this.selectedGem.row, this.selectedGem.col);
            previousGem.classList.remove('selected');

            if (this.isAdjacent(this.selectedGem, clickedGem)) {
                this.swapGems(this.selectedGem, clickedGem);
                // Emit move to server
                this.socket.emit('move', {
                    from: this.selectedGem,
                    to: clickedGem
                });
            }
            
            this.selectedGem = null;
        }
    }

    showOpponentMove(data) {
        const { from, to } = data;
        this.swapGems(from, to);
    }

    handleServerMove(data) {
        const { from, to } = data;
        this.swapGems(from, to);
    }

    isAdjacent(gem1, gem2) {
        const rowDiff = Math.abs(gem1.row - gem2.row);
        const colDiff = Math.abs(gem1.col - gem2.col);
        return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    }

    async swapGems(gem1, gem2) {
        if (this.isAnimating) return;
        this.isAnimating = true;

        const element1 = this.getGemElement(gem1.row, gem1.col);
        const element2 = this.getGemElement(gem2.row, gem2.col);

        // Добавляем класс для анимации
        element1.classList.add('swapping');
        element2.classList.add('swapping');

        // Меняем позиции в CSS
        const pos1 = `translate(${gem1.col * this.cellSize}px, ${gem1.row * this.cellSize}px)`;
        const pos2 = `translate(${gem2.col * this.cellSize}px, ${gem2.row * this.cellSize}px)`;
        
        element1.style.transform = pos2;
        element2.style.transform = pos1;

        // Меняем значения в сетке
        const temp = this.grid[gem1.row][gem1.col];
        this.grid[gem1.row][gem1.col] = this.grid[gem2.row][gem2.col];
        this.grid[gem2.row][gem2.col] = temp;

        // Обновляем кэш элементов
        this.gemElements.set(`${gem1.row}-${gem1.col}`, element2);
        this.gemElements.set(`${gem2.row}-${gem2.col}`, element1);

        // Ждем завершения анимации
        await new Promise(resolve => setTimeout(resolve, 300));

        element1.classList.remove('swapping');
        element2.classList.remove('swapping');

        // Проверяем совпадения
        if (!await this.checkAndRemoveMatches()) {
            // Если совпадений нет, меняем обратно
            element1.style.transform = pos1;
            element2.style.transform = pos2;

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
        let moves = [];

        // Собираем все движения перед анимацией
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
                            
                            // Обновляем кэш элементов
                            this.gemElements.delete(`${gemRow}-${col}`);
                            this.gemElements.set(`${emptyRow}-${col}`, gem);
                            
                            dropped = true;
                        }
                    }
                }
                emptyRow--;
            }
        }

        // Применяем все движения одновременно
        if (moves.length > 0) {
            moves.forEach(move => {
                move.element.classList.add('dropping');
                move.element.style.transform = 
                    `translate(${move.toCol * this.cellSize}px, ${move.toRow * this.cellSize}px)`;
            });

            await new Promise(resolve => setTimeout(resolve, 300));

            moves.forEach(move => {
                move.element.classList.remove('dropping');
            });
        }

        return dropped;
    }

    fillEmptySpaces() {
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
                    gem.addEventListener('click', () => this.handleGemClick(row, col));
                    
                    // Начальная позиция над сеткой
                    gem.style.transform = `translate(${col * this.cellSize}px, ${-this.cellSize}px)`;
                    this.gridElement.appendChild(gem);
                    
                    newGems.push({
                        element: gem,
                        row: row,
                        col: col
                    });
                    
                    this.gemElements.set(`${row}-${col}`, gem);
                }
            }
        }

        // Анимируем все новые камни одновременно
        if (newGems.length > 0) {
            requestAnimationFrame(() => {
                newGems.forEach(({element, row, col}) => {
                    element.classList.add('dropping');
                    element.style.transform = `translate(${col * this.cellSize}px, ${row * this.cellSize}px)`;
                });
            });

            setTimeout(() => {
                newGems.forEach(({element}) => {
                    element.classList.remove('dropping');
                });
            }, 300);
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
