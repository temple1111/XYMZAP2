// --- Frontend Logic ---
const NODE = 'https://xym.jp1.node.leywapool.com:3001';
const sym = require("/node_modules/symbol-sdk");
const repo = new sym.RepositoryFactoryHttp(NODE);

// --- Constants ---
const LEVEL_THRESHOLDS = [0, 1000, 2500, 5000, 10000, 15000, 25000, 37500, 50000, 75000, 100000];
const LEVEL_NAMES = [
    "ビギナー", "ルーキー", "マッスル見習い", "中級マッスル", "ベテラントレーニー",
    "プロビルダー", "筋肉の賢者", "鋼の肉体", "神の領域", "レジェンド", "マッスルマスター"
];
const WORKOUT_OPTIONS = `
    <option value="general" selected>筋トレ全般</option>
    <option value="crunches">腹筋</option>
    <option value="pushups">腕立て伏せ</option>
    <option value="squats">スクワット</option>
    <option value="back_extensions">背筋</option>
`;
const WORKOUT_JAPANESE_NAMES = {
    general: '筋トレ全般',
    crunches: '腹筋',
    pushups: '腕立て伏せ',
    squats: 'スクワット',
    back_extensions: '背筋'
};

// --- DOM Elements ---
const recipientAddressInput = document.getElementById('recipientAddress');
const workoutEntriesContainer = document.getElementById('workout-entries-container');
const addWorkoutBtn = document.getElementById('add-workout-btn');
const showHistoryBtn = document.getElementById('show-history-btn');
const historyModalEl = document.getElementById('historyModal');
const historyModal = new bootstrap.Modal(historyModalEl);
const historyModalBody = document.getElementById('history-modal-body');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// --- Core Functions ---

/**
 * Adds a new workout entry row to the form.
 */
function addWorkoutEntry() {
    const entryId = `entry-${Date.now()}`;
    const newEntry = document.createElement('div');
    newEntry.classList.add('workout-entry', 'mb-3');
    newEntry.id = entryId;
    newEntry.innerHTML = `
        <div class="input-group">
            <select class="form-select workout-type" style="flex-grow: 2;">${WORKOUT_OPTIONS}</select>
            <input type="number" class="form-control workout-reps" placeholder="回数">
            <button type="button" class="btn btn-outline-danger remove-workout-btn">×</button>
        </div>
    `;

    workoutEntriesContainer.appendChild(newEntry);

    newEntry.querySelector('.remove-workout-btn').addEventListener('click', () => {
        if (workoutEntriesContainer.children.length > 1) {
            newEntry.remove();
        }
    });
}

/**
 * Saves the successful workout to localStorage.
 * @param {Array<object>} workouts - Array of workout objects [{type, reps}].
 */
function saveWorkoutToHistory(workouts) {
    const history = JSON.parse(localStorage.getItem('workoutHistory')) || [];
    const newHistoryEntry = {
        date: new Date().toISOString(),
        workouts: workouts
    };
    history.push(newHistoryEntry);
    localStorage.setItem('workoutHistory', JSON.stringify(history));
}

/**
 * Displays the aggregated workout history in the modal.
 */
function showWorkoutHistory() {
    const history = JSON.parse(localStorage.getItem('workoutHistory')) || [];
    if (history.length === 0) {
        historyModalBody.innerHTML = '<p>まだ履歴はありません。</p>';
    } else {
        const stats = {};
        history.forEach(entry => {
            entry.workouts.forEach(workout => {
                if (!stats[workout.type]) {
                    stats[workout.type] = 0;
                }
                stats[workout.type] += workout.reps;
            });
        });

        let statsHtml = '<ul class="list-group list-group-flush">';
        for (const type in stats) {
            const workoutName = WORKOUT_JAPANESE_NAMES[type] || type;
            statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center bg-transparent text-white border-secondary">${workoutName}<span class="badge bg-primary rounded-pill">${stats[type]}回</span></li>`;
        }
        statsHtml += '</ul>';
        historyModalBody.innerHTML = statsHtml;
    }
    historyModal.show();
}

/**
 * Clears all workout history from localStorage.
 */
function clearWorkoutHistory() {
    if (confirm('本当にすべての履歴を削除しますか？この操作は元に戻せません。')) {
        localStorage.removeItem('workoutHistory');
        historyModalBody.innerHTML = '<p>履歴が削除されました。</p>';
        // Keep the modal open to show the message, or close it:
        // historyModal.hide(); 
    }
}

/**
 * Gathers all workout data and initiates the transaction.
 */
async function createAndSendTransaction() {
    const recipientAddressValue = recipientAddressInput.value;
    if (!recipientAddressValue) {
        alert("受信者のSYMBOLアドレスを入力してください。");
        return;
    }

    const workoutEntries = document.querySelectorAll('.workout-entry');
    const workouts = [];
    let hasInvalidEntry = false;

    workoutEntries.forEach(entry => {
        const type = entry.querySelector('.workout-type').value;
        const reps = parseInt(entry.querySelector('.workout-reps').value);
        if (isNaN(reps) || reps <= 0) {
            hasInvalidEntry = true;
        }
        workouts.push({ type, reps });
    });

    if (workouts.length === 0 || hasInvalidEntry) {
        alert("少なくとも1つ以上の有効なトレーニング（種目と回数）を入力してください。");
        return;
    }

    try {
        sym.Address.createFromRawAddress(recipientAddressValue);
    } catch (error) {
        alert("アドレスの形式が正しくないようです。");
        return;
    }

    localStorage.setItem('lastUsedAddress', recipientAddressValue);

    const button = document.querySelector('#transferForm button[onclick="createAndSendTransaction()"]');
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 処理中...';

    try {
        const response = await fetch('/api/send-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipientAddress: recipientAddressValue, 
                workouts: workouts
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || '不明なエラーが発生しました。');
        }

        saveWorkoutToHistory(workouts);

        const transactionDetails = document.getElementById('transactionDetails');
        const estimatedCaloriesDisplay = document.getElementById('estimatedCaloriesDisplay');
        document.getElementById('message').textContent = `message: ${data.transactionMessage}`;
        if (data.estimatedCalories !== undefined) {
            estimatedCaloriesDisplay.textContent = `総消費カロリー: ${data.estimatedCalories.toFixed(1)} kcal`;
        }
        transactionDetails.classList.remove('d-none');
        getAndDisplayTokenBalance(recipientAddressValue);
        document.getElementById('shareButton').style.display = 'block';
        document.getElementById('copyTextButton').style.display = 'block';

    } catch (error) {
        console.error("API呼び出し中にエラーが発生しました:", error);
        alert(`エラー: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = '報酬を獲得';
    }
}

// (The rest of the functions like getAndDisplayTokenBalance, shareOnSns, etc. remain largely the same)

async function getAndDisplayTokenBalance(address) {
    const tokenId = '44FD959F9F2ECF4D';
    if (!address) return;

    try {
        const accountHttp = repo.createAccountRepository();
        const accountAddress = sym.Address.createFromRawAddress(address);
        const accountInfo = await accountHttp.getAccountInfo(accountAddress).toPromise();
        const tokenBalance = accountInfo.mosaics.find(mosaic => mosaic.id.toHex() === tokenId);

        const tokenBalanceElement = document.getElementById('tokenBalance');
        const bodyElement = document.body;
        
        bodyElement.className = 'background-0'; // Reset class

        let currentTokenCount = 0;
        if (tokenBalance) {
            currentTokenCount = tokenBalance.amount.compact();
            tokenBalanceElement.textContent = `保有トークン数量: ${currentTokenCount} KINNIKU-TOKEN`;

            let currentLevelIndex = 0;
            for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
                if (currentTokenCount >= LEVEL_THRESHOLDS[i]) {
                    currentLevelIndex = i;
                } else {
                    break;
                }
            }

            let levelName = LEVEL_NAMES[currentLevelIndex];
            const maxLevelIndex = LEVEL_THRESHOLDS.length - 1;
            const muscleMasterThreshold = LEVEL_THRESHOLDS[maxLevelIndex];

            if (currentLevelIndex === maxLevelIndex) {
                const plusLevel = Math.floor((currentTokenCount - muscleMasterThreshold) / 25000);
                if (plusLevel > 0) {
                    levelName = `${LEVEL_NAMES[maxLevelIndex]} +${plusLevel}`;
                }
            }

            const totalGoal = muscleMasterThreshold;
            let progressPercentage = Math.min((currentTokenCount / totalGoal) * 100, 100);

            document.getElementById('levelDisplay').textContent = `レベル: ${levelName} (${Math.floor(progressPercentage)}%)`;
            document.querySelector('.progress-bar').style.width = `${progressPercentage}%`;

            const backgroundIndex = Math.min(currentLevelIndex, 9);
            bodyElement.className = `background-${backgroundIndex}`;

            document.getElementById('currentLevelBadge').src = `level${currentLevelIndex}_badge.svg`;
            
        } else {
            tokenBalanceElement.textContent = 'トークンを保有していません';
            bodyElement.classList.add('background-0');
            document.getElementById('levelDisplay').textContent = `レベル: ビギナー (0%)`;
            document.querySelector('.progress-bar').style.width = `0%`;
            document.getElementById('currentLevelBadge').src = `level0_badge.svg`;
        }
    } catch (error) {
        console.error(error);
        document.getElementById('tokenBalance').textContent = 'アドレスの形式が正しくないようです';
        document.body.className = 'background-0';
    }
}

async function shareOnSns() {
    const canvas = document.getElementById('shareCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const levelText = document.getElementById('levelDisplay').textContent;
    const aiMessage = document.getElementById('message').textContent.replace('message: ', '');
    const badgeSrc = document.getElementById('currentLevelBadge').src;

    const tokenBalanceText = document.getElementById('tokenBalance').textContent;
    const tokenMatch = tokenBalanceText.match(/(\d+)\s*KINNIKU-TOKEN/);
    const currentTokenCount = tokenMatch ? parseInt(tokenMatch[1], 10) : 0;

    let currentLevelIndex = 0;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (currentTokenCount >= LEVEL_THRESHOLDS[i]) {
            currentLevelIndex = i;
        } else {
            break;
        }
    }

    const backgroundIndex = Math.min(currentLevelIndex, 9);
    const backgroundImageSrc = `${backgroundIndex}.png`;

    const loadImage = src => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.crossOrigin = "anonymous";
        img.src = src;
    });
    
    const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
        const words = text.split('');
        let line = '';
        for(let n = 0; n < words.length; n++) {
            let testLine = line + words[n];
            let metrics = context.measureText(testLine);
            let testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                context.fillText(line, x, y);
                line = words[n];
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, x, y);
    };

    try {
        const bgImage = await loadImage(backgroundImageSrc);
        canvas.width = bgImage.naturalWidth;
        canvas.height = bgImage.naturalHeight;
        ctx.drawImage(bgImage, 0, 0);

        const padding = canvas.width * 0.05;

        const badgeImage = await loadImage(badgeSrc);
        const badgeSize = canvas.width * 0.1;
        const badgeX = canvas.width - badgeSize - padding;
        const badgeY = padding;
        ctx.drawImage(badgeImage, badgeX, badgeY, badgeSize, badgeSize);

        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'right';
        ctx.font = `bold ${canvas.width * 0.025}px sans-serif`;
        const levelTextY = badgeY + badgeSize + 40;
        const levelTextX = badgeX + badgeSize;
        ctx.fillText(levelText, levelTextX, levelTextY);

        ctx.textAlign = 'left';
        ctx.font = `${canvas.width * 0.025}px sans-serif`;
        const maxWidth = canvas.width - (padding * 2);
        const lineHeight = canvas.width * 0.04;
        const startY = levelTextY + 80;
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        
        wrapText(ctx, aiMessage, padding, startY, maxWidth, lineHeight);

        canvas.toBlob(async (blob) => {
            const file = new File([blob], 'workout-result.png', { type: 'image/png' });
            const shareData = {
                files: [file],
                title: '筋トレチャレンジ結果！',
                text: '今日の筋トレの成果を見てください！ #KINNIKUTOKENCHALLENGE',
                url: 'https://xymzap-2.vercel.app/'
            };
            if (navigator.canShare && navigator.canShare(shareData)) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.error('Share failed:', err.message);
                    alert('共有に失敗しました。画像をダウンロードします。');
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'workout-result.png';
                    link.click();
                }
            } else {
                alert('お使いのブラウザは共有機能をサポートしていません。画像をダウンロードします。');
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'workout-result.png';
                link.click();
            }
        }, 'image/png');

    } catch (error) {
        console.error('Error creating share image:', error);
        alert('共有画像の生成に失敗しました。');
    }
}

function copyShareText() {
    const levelText = document.getElementById('levelDisplay').textContent;
    const shareText = `筋トレ報告！　筋トレを始めて、KINNIKU-TOKENを手に入れよう！ 
 #symbol #XYM #筋トレ #fitness
`;
    
    navigator.clipboard.writeText(shareText).then(() => {
        const copyButton = document.getElementById('copyTextButton');
        copyButton.textContent = 'コピーしました！';
        setTimeout(() => {
            copyButton.textContent = '投稿文をコピー';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('コピーに失敗しました。');
    });
}

// --- Event Listeners ---
window.addEventListener('load', function () {
    const savedAddress = localStorage.getItem('lastUsedAddress');
    if (savedAddress && recipientAddressInput) {
        recipientAddressInput.value = savedAddress;
        getAndDisplayTokenBalance(savedAddress);
    }

    if(recipientAddressInput) {
        recipientAddressInput.addEventListener('input', () => getAndDisplayTokenBalance(recipientAddressInput.value));
    }

    addWorkoutBtn.addEventListener('click', addWorkoutEntry);
    addWorkoutEntry(); // Add the first entry on page load

    showHistoryBtn.addEventListener('click', showWorkoutHistory);
    clearHistoryBtn.addEventListener('click', clearWorkoutHistory);

    const openDrawerButton = document.getElementById('open-drawer-button');
    const closeDrawerButton = document.getElementById('close-drawer-button');
    const drawer = document.getElementById('transaction-drawer');
    const overlay = document.getElementById('drawer-overlay');

    const openDrawer = () => {
        drawer.classList.add('is-open');
        overlay.classList.remove('hidden');
    };

    const closeDrawer = () => {
        drawer.classList.remove('is-open');
        overlay.classList.add('hidden');
    };

    openDrawerButton.addEventListener('click', openDrawer);
    closeDrawerButton.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    const openInfoButton = document.getElementById('open-info-button');
    if (openInfoButton) {
        openInfoButton.addEventListener('click', () => {
            const infoModal = new bootstrap.Modal(document.getElementById('infoModal'));
            infoModal.show();
        });
    }

    const shareButton = document.getElementById('shareButton');
    if (shareButton) {
        shareButton.addEventListener('click', shareOnSns);
    }

    const copyTextButton = document.getElementById('copyTextButton');
    if (copyTextButton) {
        copyTextButton.addEventListener('click', copyShareText);
    }
});