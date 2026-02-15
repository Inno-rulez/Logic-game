// Game State
const gameState = {
    studentX: 0,
    studentY: 0,
    studentDirection: 'right',
    classroomX: 5,
    classroomY: 5,
    gridSize: 6,
    obstacles: [],
    moves: 0,
    maxMoves: 20,
    program: [],
    nextBlockId: 1,
    score: 0,
    puzzleAttempted: false,
    mode: 'basic',
    // user/auth info (set via Auth0/MSAL integration)
    user: null,
    isAdmin: false,
    // attempt tracking/progression
    modesSequence: ['basic', 'conditions', 'loop'],
    currentModeIndex: 0,
    attempts: { basic: [], conditions: [], loop: [] },
    maxAttemptsPerMode: 4,
    locked: false
};

function initializeGame() {
    generateRandomPositions();
    renderBoard();
    setupDragAndDrop();
    setupModeSelector();
}

function generateRandomPositions() {
    let isSolvable = false;
    while (!isSolvable) {
        gameState.studentX = Math.floor(Math.random() * gameState.gridSize);
        gameState.studentY = Math.floor(Math.random() * gameState.gridSize);
        do {
            gameState.classroomX = Math.floor(Math.random() * gameState.gridSize);
            gameState.classroomY = Math.floor(Math.random() * gameState.gridSize);
        } while (gameState.classroomX === gameState.studentX && gameState.classroomY === gameState.studentY);
        gameState.obstacles = [];
        while (gameState.obstacles.length < 10) {
            const obstacleX = Math.floor(Math.random() * gameState.gridSize);
            const obstacleY = Math.floor(Math.random() * gameState.gridSize);
            const isStudent = obstacleX === gameState.studentX && obstacleY === gameState.studentY;
            const isClassroom = obstacleX === gameState.classroomX && obstacleY === gameState.classroomY;
            const isExistingObstacle = gameState.obstacles.some(obs => obs[0] === obstacleX && obs[1] === obstacleY);
            if (!isStudent && !isClassroom && !isExistingObstacle) {
                gameState.obstacles.push([obstacleX, obstacleY]);
            }
        }
        isSolvable = isPuzzleSolvable();
    }
}

function isPuzzleSolvable() {
    const directionVectors = { 'up': [0, -1], 'down': [0, 1], 'left': [-1, 0], 'right': [1, 0] };
    const turnRight = { 'up': 'right', 'right': 'down', 'down': 'left', 'left': 'up' };
    const turnLeft = { 'up': 'left', 'left': 'down', 'down': 'right', 'right': 'up' };
    const queue = [[gameState.studentX, gameState.studentY, 'right']];
    const visited = new Set();
    visited.add(`${gameState.studentX},${gameState.studentY},right`);
    while (queue.length > 0) {
        const [x, y, direction] = queue.shift();
        if (x === gameState.classroomX && y === gameState.classroomY) return true;
        const [dx, dy] = directionVectors[direction];
        const newX = x + dx, newY = y + dy;
        if (newX >= 0 && newX < gameState.gridSize && newY >= 0 && newY < gameState.gridSize) {
            const isObstacle = gameState.obstacles.some(obs => obs[0] === newX && obs[1] === newY);
            if (!isObstacle) {
                const key = `${newX},${newY},${direction}`;
                if (!visited.has(key)) { visited.add(key); queue.push([newX, newY, direction]); }
            }
        }
        const rDir = turnRight[direction], lDir = turnLeft[direction];
        const rKey = `${x},${y},${rDir}`, lKey = `${x},${y},${lDir}`;
        if (!visited.has(rKey)) { visited.add(rKey); queue.push([x, y, rDir]); }
        if (!visited.has(lKey)) { visited.add(lKey); queue.push([x, y, lDir]); }
    }
    return false;
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('programDropZone');
    const commandBlocks = document.querySelectorAll('.command-block');
    commandBlocks.forEach(block => {
        block.addEventListener('dragstart', handleDragStart);
        block.addEventListener('dragend', handleDragEnd);
    });
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
}

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/html', this.innerHTML);
    e.dataTransfer.setData('command', this.dataset.command);
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    draggedElement = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    document.getElementById('programDropZone').classList.add('dragover');
}

function handleDragLeave(e) {
    if (e.target.id === 'programDropZone') {
        document.getElementById('programDropZone').classList.remove('dragover');
    }
}

function handleDrop(e) {
    const cmd = e.dataTransfer.getData('command');
    if (cmd === 'repeat' && gameState.mode !== 'loop') {
        addOutput('🔁 Repeat is only available in Loop mode.');
        return;
    }
    if (cmd && cmd.startsWith('cond_') && gameState.mode !== 'conditions') {
        addOutput('🔎 Condition blocks are only available in Conditions mode.');
        return;
    }
    return handleDropEnhanced(e);
}

function handleDropEnhanced(e) {
    if (gameState.puzzleAttempted) return;
    e.preventDefault();
    document.getElementById('programDropZone').classList.remove('dragover');
    const command = e.dataTransfer.getData('command');
    let target = e.target;
    while (target && !target.classList) target = target.parentElement;
    let childrenContainer = null, rootZone = document.getElementById('programDropZone'), parentRepeatId = null;
    let cur = e.target;
    while (cur && cur !== document.body) {
        if (cur.classList && cur.classList.contains('children-container')) { childrenContainer = cur; break; }
        if (cur.id === 'programDropZone') { childrenContainer = null; break; }
        cur = cur.parentElement;
    }
    if (childrenContainer) parentRepeatId = parseInt(childrenContainer.dataset.parent, 10);
    // Prevent nested repeats: only allow basic commands inside repeat children
    if (command === 'repeat' && parentRepeatId !== null) {
        addOutput('Nested Repeat blocks are not allowed.');
        return;
    }
    // Prevent nested condition blocks inside another condition
    if (command && command.startsWith('cond_') && parentRepeatId !== null) {
        const parentObj = findObjectById(parentRepeatId, gameState.program);
        if (parentObj && parentObj.type === 'condition') {
            addOutput('Nested Condition blocks are not allowed.');
            return;
        }
    }
    const placeholder = rootZone.querySelector('.drop-zone-placeholder');
    if (placeholder && !childrenContainer) placeholder.remove();
    const id = gameState.nextBlockId++;
    let obj;
    if (command === 'repeat') {
        obj = { id, type: 'repeat', count: 2, children: [] };
    } else if (command && command.startsWith('cond_')) {
        const condType = command.split('_')[1] || 'unknown';
        obj = { id, type: 'condition', cond: condType, children: [] };
    } else {
        obj = { id, type: command };
    }
    if (parentRepeatId != null) {
        const parent = findObjectById(parentRepeatId, gameState.program);
        if (!parent) { addOutput('Internal error: parent not found.'); return; }
        parent.children.push(obj);
    } else {
        gameState.program.push(obj);
    }
    const el = createPlacedBlockElement(obj);
    if (childrenContainer) childrenContainer.appendChild(el);
    else rootZone.appendChild(el);
    return obj;
}

function removeBlock(btn) {
    if (gameState.puzzleAttempted) return;
    let block = btn.parentElement;
    // Traverse up to find the placed-block element with data-id
    while (block && !block.dataset.id) {
        block = block.parentElement;
    }
    if (!block || !block.dataset.id) return;
    const id = parseInt(block.dataset.id, 10);
    if (removeObjectById(id, gameState.program)) block.remove();
}

function createPlacedBlockElement(obj) {
    if (obj.type === 'repeat') {
        const container = document.createElement('div');
        container.className = 'placed-block repeat-block';
        container.dataset.id = obj.id;
        const header = document.createElement('div');
        header.className = 'repeat-header';
        const headerText = document.createElement('span');
        headerText.innerHTML = `Repeat <input class="repeat-count" type="number" min="1" max="20" value="${obj.count}"> times`;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '✕';
        removeBtn.onclick = function(e) { e.stopPropagation(); removeBlock(removeBtn); };
        header.appendChild(headerText);
        header.appendChild(removeBtn);
        const countInput = headerText.querySelector('.repeat-count');
        if (countInput) {
            countInput.addEventListener('change', function() {
                const newCount = Math.max(1, Math.min(20, parseInt(this.value, 10) || 2));
                obj.count = newCount;
                this.value = newCount;
            });
        }
        const children = document.createElement('div');
        children.className = 'repeat-children children-container';
        children.dataset.parent = obj.id;
        children.addEventListener('dragover', function(ev){ 
            ev.preventDefault(); 
            children.classList.add('dragover');
        });
        children.addEventListener('dragleave', function(ev){
            if (ev.target === children) {
                children.classList.remove('dragover');
            }
        });
        children.addEventListener('drop', function(ev){ 
            ev.stopPropagation();
            children.classList.remove('dragover');
            handleDropEnhanced(ev);
        });
        container.appendChild(header);
        container.appendChild(children);
        return container;
    } else if (obj.type === 'condition') {
        const container = document.createElement('div');
        container.className = 'placed-block condition-block';
        container.dataset.id = obj.id;
        const header = document.createElement('div');
        header.className = 'condition-header';
        const condName = obj.cond === 'obstacle' ? 'Until Obstacle Ahead' : (obj.cond === 'bound' ? 'Until At Boundary' : (obj.cond === 'inclass' ? 'Until In Class' : obj.cond));
        const headerText = document.createElement('span');
        headerText.textContent = condName;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '✕';
        removeBtn.onclick = function(e) { e.stopPropagation(); removeBlock(removeBtn); };
        header.appendChild(headerText);
        header.appendChild(removeBtn);
        const children = document.createElement('div');
        children.className = 'condition-children children-container';
        children.dataset.parent = obj.id;
        children.addEventListener('dragover', function(ev){ 
            ev.preventDefault(); 
            children.classList.add('dragover');
        });
        children.addEventListener('dragleave', function(ev){
            if (ev.target === children) {
                children.classList.remove('dragover');
            }
        });
        children.addEventListener('drop', function(ev){ 
            ev.stopPropagation();
            children.classList.remove('dragover');
            handleDropEnhanced(ev);
        });
        container.appendChild(header);
        container.appendChild(children);
        return container;
    } else {
        const el = document.createElement('div');
        el.className = 'placed-block';
        el.dataset.id = obj.id;
        const textMap = { 'forward': '⬆️ Go Forward', 'turnRight': '↻ Turn Right', 'turnLeft': '↺ Turn Left' };
        el.innerHTML = `${textMap[obj.type]} <button class="remove-btn">✕</button>`;
        const btn = el.querySelector('.remove-btn');
        btn.onclick = function(){ removeBlock(btn); };
        return el;
    }
}

function findObjectById(id, arr) {
    for (const item of arr) {
        if (item.id === id) return item;
        if (item.children && item.children.length) {
            const found = findObjectById(id, item.children);
            if (found) return found;
        }
    }
    return null;
}

function removeObjectById(id, arr) {
    for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item.id === id) { arr.splice(i, 1); return true; }
        if (item.children && item.children.length) {
            if (removeObjectById(id, item.children)) return true;
        }
    }
    return false;
}

function flattenProgram(programArr, limit = 500) {
    const out = [];
    function helper(arr) {
        for (const item of arr) {
            if (out.length >= limit) return;
            if (item.type === 'repeat') {
                const n = Math.max(1, Math.min(20, parseInt(item.count || 2, 10) || 2));
                for (let i = 0; i < n; i++) {
                    helper(item.children);
                    if (out.length >= limit) return;
                }
            } else {
                out.push(item.type);
            }
        }
    }
    helper(programArr);
    return out;
}

// Render the game board

function renderBoard() {
    const board = document.getElementById('gameBoard');
    board.innerHTML = '';
    for (let y = 0; y < gameState.gridSize; y++) {
        for (let x = 0; x < gameState.gridSize; x++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            const isObstacle = gameState.obstacles.some(obs => obs[0] === x && obs[1] === y);
            if (isObstacle) {
                cell.classList.add('obstacle');
                cell.textContent = '🚧';
            }
            if (gameState.studentX === x && gameState.studentY === y) {
                const student = document.createElement('div');
                student.className = `student ${gameState.studentDirection}`;
                cell.appendChild(student);
            }
            if (gameState.classroomX === x && gameState.classroomY === y) {
                const classroom = document.createElement('div');
                classroom.className = 'classroom';
                classroom.textContent = '🏫';
                cell.appendChild(classroom);
            }
            board.appendChild(cell);
        }
    }
}

function moveStudent(direction) {
    const oldX = gameState.studentX;
    const oldY = gameState.studentY;
    switch(direction) {
        case 'up':
            gameState.studentY = Math.max(0, gameState.studentY - 1);
            break;
        case 'down':
            gameState.studentY = Math.min(gameState.gridSize - 1, gameState.studentY + 1);
            break;
        case 'left':
            gameState.studentX = Math.max(0, gameState.studentX - 1);
            break;
        case 'right':
            gameState.studentX = Math.min(gameState.gridSize - 1, gameState.studentX + 1);
            break;
    }
    const isObstacle = gameState.obstacles.some(obs => obs[0] === gameState.studentX && obs[1] === gameState.studentY);
    if (isObstacle) {
        gameState.studentX = oldX;
        gameState.studentY = oldY;
        addOutput(`❌ Cannot move there - obstacle!`);
        return false;
    }
    gameState.moves++;
    addOutput(`✓ Moved ${direction}`);
    renderBoard();
    if (gameState.studentX === gameState.classroomX && gameState.studentY === gameState.classroomY) {
        addOutput(`🎉 You made it to class in ${gameState.moves} moves!`);
        return 'win';
    }
    return true;
}

function executeCommand(command) {
    switch(command) {
        case 'forward':
            return moveStudent(gameState.studentDirection);
        case 'turnRight':
            const rightTurns = { 'up': 'right', 'right': 'down', 'down': 'left', 'left': 'up' };
            gameState.studentDirection = rightTurns[gameState.studentDirection];
            addOutput(`↻ Turned right (now facing ${gameState.studentDirection})`);
            renderBoard();
            return true;
        case 'turnLeft':
            const leftTurns = { 'up': 'left', 'left': 'down', 'down': 'right', 'right': 'up' };
            gameState.studentDirection = leftTurns[gameState.studentDirection];
            addOutput(`↺ Turned left (now facing ${gameState.studentDirection})`);
            renderBoard();
            return true;
        default:
            return false;
    }
}

function addOutput(message) {
    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = 'command-item';
    line.textContent = message;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function runProgram() {
    if (gameState.puzzleAttempted) {
        addOutput('This puzzle has already been attempted. Click "Next Puzzle" to continue.');
        return;
    }
    // Enforce attempt limits for non-admin users
    if (!gameState.isAdmin) {
        if (gameState.locked) {
            addOutput('🔒 You have exhausted all allowed attempts.');
            return;
        }
        // force current mode
        const cur = getCurrentModeName();
        setMode(cur);
        const used = (gameState.attempts[cur] || []).length;
        if (used >= gameState.maxAttemptsPerMode) {
            // advance and re-evaluate
            advanceModeIfNeeded();
            if (gameState.locked) return;
            const next = getCurrentModeName();
            addOutput(`➡️ Moving to ${next} mode.`);
            setMode(next);
        }
    }
    const output = document.getElementById('output');
    output.innerHTML = '';
    gameState.puzzleAttempted = true;
    disableDragDrop();
    gameState.moves = 0;
    if (gameState.program.length === 0) {
        addOutput('No commands in program. Drag some commands!');
        gameState.puzzleAttempted = false;
        enableDragDrop();
        return;
    }
    document.querySelectorAll('.repeat-block').forEach(rb => {
        const id = parseInt(rb.dataset.id, 10);
        const obj = findObjectById(id, gameState.program);
        if (obj) {
            const input = rb.querySelector('.repeat-count');
            const v = parseInt(input.value, 10);
            obj.count = Math.max(1, Math.min(20, isNaN(v) ? obj.count || 2 : v));
            input.value = obj.count;
        }
    });
    addOutput('📋 Executing program...');
    const context = { stopped: false, totalCommands: 0, commandLimit: 500, perConditionLimit: 200 };

    function evaluateCondition(cond) {
        if (cond === 'obstacle') {
            const dir = gameState.studentDirection;
            const vec = { 'up': [0, -1], 'down': [0, 1], 'left': [-1, 0], 'right': [1, 0] }[dir];
            const nx = gameState.studentX + vec[0], ny = gameState.studentY + vec[1];
            return gameState.obstacles.some(obs => obs[0] === nx && obs[1] === ny);
        } else if (cond === 'bound') {
            const dir = gameState.studentDirection;
            const vec = { 'up': [0, -1], 'down': [0, 1], 'left': [-1, 0], 'right': [1, 0] }[dir];
            const nx = gameState.studentX + vec[0], ny = gameState.studentY + vec[1];
            return !(nx >= 0 && nx < gameState.gridSize && ny >= 0 && ny < gameState.gridSize);
        } else if (cond === 'inclass') {
            return gameState.studentX === gameState.classroomX && gameState.studentY === gameState.classroomY;
        }
        return false;
    }

    function executeItems(arr, idx, cb) {
        if (context.stopped) return cb && cb();
        if (idx >= arr.length) return cb && cb();
        const item = arr[idx];
        if (!item) return executeItems(arr, idx + 1, cb);

        // Repeat block
        if (item.type === 'repeat') {
            const n = Math.max(1, Math.min(20, parseInt(item.count || 2, 10) || 2));
            let r = 0;
            const runRepeat = () => {
                if (context.stopped) return cb && cb();
                if (r >= n) return executeItems(arr, idx + 1, cb);
                executeItems(item.children || [], 0, () => {
                    if (context.stopped) return cb && cb();
                    r++;
                    runRepeat();
                });
            };
            return runRepeat();
        }

        // Condition block
        if (item.type === 'condition') {
            let iter = 0;
            const runConditionLoop = () => {
                if (context.stopped) return cb && cb();
                if (evaluateCondition(item.cond)) return executeItems(arr, idx + 1, cb);
                if (iter >= context.perConditionLimit || context.totalCommands >= context.commandLimit) {
                    addOutput('⚠️ Condition loop limit reached. Stopping execution.');
                    context.stopped = true;
                    showPuzzleResult(false);
                    return cb && cb();
                }
                executeItems(item.children || [], 0, () => {
                    if (context.stopped) return cb && cb();
                    iter++;
                    runConditionLoop();
                });
            };
            return runConditionLoop();
        }

        // Atomic command
        if (context.totalCommands >= context.commandLimit) {
            addOutput('⚠️ Command limit reached. Stopping execution.');
            context.stopped = true;
            showPuzzleResult(false);
            return cb && cb();
        }
        const result = executeCommand(item.type);
        context.totalCommands++;
        if (result === 'win') {
            showPuzzleResult(true);
            context.stopped = true;
            return cb && cb();
        }
        if (gameState.moves >= gameState.maxMoves) {
            addOutput(`⚠️ Maximum moves (${gameState.maxMoves}) exceeded!`);
            showPuzzleResult(false);
            context.stopped = true;
            return cb && cb();
        }
        setTimeout(() => executeItems(arr, idx + 1, cb), 600);
    }

    executeItems(gameState.program, 0, () => {
        if (context.stopped) return;
        if (gameState.studentX === gameState.classroomX && gameState.studentY === gameState.classroomY) {
            showPuzzleResult(true);
        } else {
            addOutput(`Program ended. Still not at class. (${gameState.moves} moves)`);
            showPuzzleResult(false);
        }
    });
}

function showPuzzleResult(won) {
    if (won) {
        gameState.score += 1;
        addOutput(`✅ SUCCESS! +1 Point`);
    } else {
        addOutput(`❌ FAILED! 0 Points`);
    }
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('runBtn').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'block';
        // Record attempt for non-admin users
        if (!gameState.isAdmin) {
            recordAttempt(won);
            // If locked after recording, ensure controls are disabled
            if (gameState.locked) {
                document.getElementById('runBtn').style.display = 'none';
                document.getElementById('nextBtn').style.display = 'none';
            }
        }
}

function disableDragDrop() {
    const commandBlocks = document.querySelectorAll('.command-block');
    commandBlocks.forEach(block => {
        block.draggable = false;
        block.style.opacity = '0.5';
        block.style.cursor = 'not-allowed';
    });
}

function enableDragDrop() {
    const commandBlocks = document.querySelectorAll('.command-block');
    commandBlocks.forEach(block => {
        block.draggable = true;
        block.style.opacity = '1';
        block.style.cursor = 'grab';
    });
}

function setupModeSelector() {
    const sel = document.getElementById('modeSelect');
    if (!sel) return;
    sel.value = gameState.mode || 'basic';
    sel.addEventListener('change', () => setMode(sel.value));
    // If user is not admin, disable manual mode selection and force progression mode
    if (!gameState.isAdmin) {
        sel.disabled = true;
        const forced = gameState.modesSequence[gameState.currentModeIndex] || 'basic';
        sel.value = forced;
        setMode(forced);
    } else {
        sel.disabled = false;
        setMode(sel.value);
    }
    updateAttemptsUI();
}

// Expose a setter so auth code can provide the logged-in user info
function setUser(user) {
    gameState.user = user || null;
    gameState.isAdmin = !!(user && user.isAdmin);
    const sel = document.getElementById('modeSelect');
    if (sel) sel.disabled = !gameState.isAdmin;
    updateAttemptsUI();
}

function getCurrentModeName() {
    return gameState.modesSequence[gameState.currentModeIndex] || 'basic';
}

function updateAttemptsUI() {
    const el = document.getElementById('attemptsInfo');
    if (!el) return;
    if (gameState.isAdmin) {
        el.textContent = 'Admin: unrestricted';
        return;
    }
    const mode = getCurrentModeName();
    const used = gameState.attempts[mode] ? gameState.attempts[mode].length : 0;
    const left = Math.max(0, gameState.maxAttemptsPerMode - used);
    el.textContent = `Attempts left: ${left}`;
}

function advanceModeIfNeeded() {
    const mode = getCurrentModeName();
    const used = gameState.attempts[mode] ? gameState.attempts[mode].length : 0;
    if (used >= gameState.maxAttemptsPerMode) {
        if (gameState.currentModeIndex < gameState.modesSequence.length - 1) {
            gameState.currentModeIndex++;
            const next = getCurrentModeName();
            setMode(next);
            addOutput(`➡️ Progressing to ${next} mode.`);
        } else {
            gameState.locked = true;
            addOutput('🔒 All attempts exhausted. You can no longer play.');
            document.getElementById('runBtn').style.display = 'none';
        }
    }
    updateAttemptsUI();
}

function recordAttempt(won) {
    const mode = getCurrentModeName();
    if (!gameState.attempts[mode]) gameState.attempts[mode] = [];
    gameState.attempts[mode].push({ success: !!won, moves: gameState.moves, ts: new Date().toISOString() });
    updateAttemptsUI();
    // after recording, maybe advance
    advanceModeIfNeeded();
}

function setMode(newMode) {
    gameState.mode = newMode;
    updateCommandsVisibility();
    if (newMode !== 'loop') removeAllRepeatsFromProgram();
    if (newMode !== 'conditions') removeAllConditionsFromProgram();
}

function updateCommandsVisibility() {
    const loopCommands = document.querySelectorAll('.loop-only');
    loopCommands.forEach(el => {
        el.style.display = (gameState.mode === 'loop') ? 'block' : 'none';
    });
    const condCommands = document.querySelectorAll('.cond-only');
    condCommands.forEach(el => {
        el.style.display = (gameState.mode === 'conditions') ? 'block' : 'none';
    });
}

function removeAllRepeatsFromProgram() {
    function strip(arr) {
        for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].type === 'repeat') {
                arr.splice(i, 1);
            } else if (arr[i].children && arr[i].children.length) {
                strip(arr[i].children);
            }
        }
    }
    strip(gameState.program);
    document.querySelectorAll('.repeat-block').forEach(el => el.remove());
}

function removeAllConditionsFromProgram() {
    function strip(arr) {
        for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].type === 'condition') {
                arr.splice(i, 1);
            } else if (arr[i].children && arr[i].children.length) {
                strip(arr[i].children);
            }
        }
    }
    strip(gameState.program);
    document.querySelectorAll('.condition-block').forEach(el => el.remove());
}

function resetGame() {
    gameState.studentDirection = 'right';
    gameState.moves = 0;
    gameState.program = [];
    gameState.puzzleAttempted = false;
    gameState.score = 0;
    generateRandomPositions();
    const dropZone = document.getElementById('programDropZone');
    dropZone.innerHTML = '<div class="drop-zone-placeholder">Drag commands here...</div>';
    document.getElementById('output').innerHTML = '';
    document.getElementById('score').textContent = '0';
    addOutput('Game reset! 🔄');
    setupDragAndDrop();
    renderBoard();
    document.getElementById('runBtn').style.display = 'block';
    document.getElementById('nextBtn').style.display = 'none';
}

function nextPuzzle() {
    gameState.studentDirection = 'right';
    gameState.moves = 0;
    gameState.program = [];
    gameState.puzzleAttempted = false;
    generateRandomPositions();
    const dropZone = document.getElementById('programDropZone');
    dropZone.innerHTML = '<div class="drop-zone-placeholder">Drag commands here...</div>';
    document.getElementById('output').innerHTML = '';
    addOutput('New puzzle! Good luck! 🎯');
    enableDragDrop();
    setupDragAndDrop();
    renderBoard();
    document.getElementById('runBtn').style.display = 'block';
    document.getElementById('nextBtn').style.display = 'none';
}

window.addEventListener('load', initializeGame);
