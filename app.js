import * as sym from "symbol-sdk";

// --- Frontend Logic ---
const NODE = 'https://xymtokyo.harvest-node.net:3001';
const repo = new sym.RepositoryFactoryHttp(NODE);

let workoutHistory = {}; // 筋トレ履歴を保持するオブジェクト

// --- Utility Functions ---
function getTranslation(key, replacements = {}) {
    const lang = getLanguage();
    let text = translations[lang][key] || key;
    for (const placeholder in replacements) {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return text;
}

// LocalStorageから履歴を読み込む
function loadWorkoutHistory() {
    const historyJson = localStorage.getItem('workoutHistory');
    if (historyJson) {
        workoutHistory = JSON.parse(historyJson);
    }
}

// LocalStorageに履歴を保存する
function saveWorkoutHistory() {
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
}

// --- Constants ---
const LEVEL_THRESHOLDS = [0, 1000, 2500, 5000, 10000, 15000, 25000, 37500, 50000, 75000, 100000];
const LEVEL_NAME_KEYS = [
    "level_beginner", "level_rookie", "level_apprentice", "level_intermediate", "level_veteran",
    "level_pro", "level_sage", "level_steel", "level_god", "level_legend", "level_master"
];
const WORKOUT_OPTION_KEYS = {
    "crunches": "workout_crunches",
    "pushups": "workout_pushups",
    "squats": "workout_squats",
    "back_extensions": "workout_back_extensions",
    "general_workout": "workout_general"
};

function getWorkoutOptions() {
    return Object.keys(WORKOUT_OPTION_KEYS).map(key => 
        `<option value="${key}">${getTranslation(WORKOUT_OPTION_KEYS[key])}</option>`
    ).join('');
}

function renderWorkoutHistory() {
    const historyContainer = document.getElementById('workout-history');
    historyContainer.innerHTML = ''; // 既存の表示をクリア

    const noHistoryMessage = document.getElementById('no-history-message');
    if (Object.keys(workoutHistory).length === 0) {
        if (noHistoryMessage) noHistoryMessage.style.display = 'block';
        return;
    } else {
        if (noHistoryMessage) noHistoryMessage.style.display = 'none';
    }

    for (const type in workoutHistory) {
        if (workoutHistory.hasOwnProperty(type)) {
            const reps = workoutHistory[type];
            const historyItem = document.createElement('div');
            historyItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center', 'bg-dark-subtle', 'text-white');
            historyItem.innerHTML = `
                ${type}: ${reps} ${getTranslation('reps_placeholder')}
                <button type="button" class="btn btn-sm btn-outline-danger delete-history-btn" data-workout-type="${type}">${getTranslation('delete_button')}</button>
            `;
            historyContainer.appendChild(historyItem);
        }
    }

    // 削除ボタンにイベントリスナーを設定
    historyContainer.querySelectorAll('.delete-history-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const workoutTypeToDelete = event.target.dataset.workoutType;
            if (window.confirm(getTranslation('confirm_delete'))) {
                delete workoutHistory[workoutTypeToDelete];
                saveWorkoutHistory();
                renderWorkoutHistory(); // 表示を更新
            }
        });
    });
}

// --- DOM Elements ---
const recipientAddressInput = document.getElementById('recipientAddress');
const workoutEntriesContainer = document.getElementById('workout-entries-container');
const addWorkoutBtn = document.getElementById('add-workout-btn');

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
            <select class="form-select workout-type" style="flex-grow: 2;">${getWorkoutOptions()}</select>
            <input type="number" class="form-control workout-reps" placeholder="${getTranslation('reps_placeholder')}">
            <button type="button" class="btn btn-outline-danger remove-workout-btn">×</button>
        </div>
    `;

    workoutEntriesContainer.appendChild(newEntry);

    // Add event listener to the new remove button
    newEntry.querySelector('.remove-workout-btn').addEventListener('click', () => {
        // Prevent removing the last entry
        if (workoutEntriesContainer.children.length > 1) {
            newEntry.remove();
        }
    });
}

/**
 * Gathers all workout data and initiates the transaction.
 */
async function createAndSendTransaction() {
    const recipientAddressValue = recipientAddressInput.value;
    if (!recipientAddressValue) {
        alert(getTranslation('alert_enter_address'));
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
        alert(getTranslation('alert_invalid_workout'));
        return;
    }

    try {
        sym.Address.createFromRawAddress(recipientAddressValue);
    } catch (error) {
        alert(getTranslation('alert_invalid_address'));
        return;
    }

    localStorage.setItem('lastUsedAddress', recipientAddressValue);

    const button = document.getElementById('get-reward-btn');
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${getTranslation('button_processing')}`;

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
            throw new Error(data.message || getTranslation('error_unknown'));
        }

        const transactionDetails = document.getElementById('transactionDetails');
        const estimatedCaloriesDisplay = document.getElementById('estimatedCaloriesDisplay');
        document.getElementById('message').textContent = `${getTranslation('transaction_message_label')} ${data.transactionMessage}`;
        if (data.estimatedCalories !== undefined) {
            estimatedCaloriesDisplay.textContent = getTranslation('total_calories_burned', {calories: data.estimatedCalories.toFixed(1)});
        }
        transactionDetails.classList.remove('d-none');
        getAndDisplayTokenBalance(recipientAddressValue);
        document.getElementById('shareButton').style.display = 'block';
        document.getElementById('copyTextButton').style.display = 'block';

        // 筋トレ履歴を更新
        workouts.forEach(workout => {
            const workoutType = workout.type; // 例: "crunches", "pushups"
            const workoutReps = workout.reps;

            const displayType = getTranslation(WORKOUT_OPTION_KEYS[workoutType]);

            if (workoutHistory[displayType]) {
                workoutHistory[displayType] += workoutReps;
            } else {
                workoutHistory[displayType] = workoutReps;
            }
        });
        saveWorkoutHistory();
        renderWorkoutHistory(); // 履歴表示を更新

    } catch (error) {
        console.error("API call error:", error);
        alert(getTranslation('error_alert', {message: error.message}));
    } finally {
        button.disabled = false;
        button.textContent = getTranslation('get_reward_button_initial');
    }
}


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
            tokenBalanceElement.textContent = getTranslation('token_balance_display', {count: currentTokenCount});

            let currentLevelIndex = 0;
            for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
                if (currentTokenCount >= LEVEL_THRESHOLDS[i]) {
                    currentLevelIndex = i;
                } else {
                    break;
                }
            }

            let levelName = getTranslation(LEVEL_NAME_KEYS[currentLevelIndex]);
            const maxLevelIndex = LEVEL_THRESHOLDS.length - 1;
            const muscleMasterThreshold = LEVEL_THRESHOLDS[maxLevelIndex];

            if (currentLevelIndex === maxLevelIndex) {
                const plusLevel = Math.floor((currentTokenCount - muscleMasterThreshold) / 25000);
                if (plusLevel > 0) {
                    levelName = `${getTranslation(LEVEL_NAME_KEYS[maxLevelIndex])} +${plusLevel}`;
                }
            }

            const totalGoal = muscleMasterThreshold;
            let progressPercentage = Math.min((currentTokenCount / totalGoal) * 100, 100);

            document.getElementById('levelDisplay').textContent = getTranslation('level_display_text', {levelName: levelName, progress: Math.floor(progressPercentage)});
            document.querySelector('.progress-bar').style.width = `${progressPercentage}%`;

            const backgroundIndex = Math.min(currentLevelIndex, 9);
            bodyElement.className = `background-${backgroundIndex}`;

            document.getElementById('currentLevelBadge').src = `/images/level${currentLevelIndex}_badge.svg`;
            
        } else {
            tokenBalanceElement.textContent = getTranslation('no_tokens');
            bodyElement.classList.add('background-0');
            document.getElementById('levelDisplay').textContent = getTranslation('level_display_text', {levelName: getTranslation('level_beginner'), progress: 0});
            document.querySelector('.progress-bar').style.width = `0%`;
            document.getElementById('currentLevelBadge').src = `/images/level0_badge.svg`;
        }
    } catch (error) {
        console.error(error);
        document.getElementById('tokenBalance').textContent = getTranslation('alert_invalid_address');
        document.body.className = 'background-0';
    }
}

async function shareOnSns() {
    const canvas = document.getElementById('shareCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const levelText = document.getElementById('levelDisplay').textContent;
    const aiMessage = document.getElementById('message').textContent.replace(getTranslation('transaction_message_label'), '');
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
    const backgroundImageSrc = `/images/${backgroundIndex}.png`;

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
                title: getTranslation('share_title'),
                text: getTranslation('share_text'),
                url: 'https://xymzap-2.vercel.app/'
            };
            if (navigator.canShare && navigator.canShare(shareData)) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.error('Share failed:', err.message);
                    alert(getTranslation('share_failed_alert'));
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'workout-result.png';
                    link.click();
                }
            } else {
                alert(getTranslation('share_unsupported_alert'));
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'workout-result.png';
                link.click();
            }
        }, '/image/png');

    } catch (error) {
        console.error('Error creating share image:', error);
        alert(getTranslation('image_generation_failed_alert'));
    }
}

function copyShareText() {
    const shareText = getTranslation('share_text');
    
    navigator.clipboard.writeText(shareText).then(() => {
        const copyButton = document.getElementById('copyTextButton');
        copyButton.textContent = getTranslation('copied_alert');
        setTimeout(() => {
            copyButton.textContent = getTranslation('copy_text_button_initial');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert(getTranslation('copy_failed_alert'));
    });
}

// --- Event Listeners ---
window.addEventListener('load', function () {
    updateContent(); // Ensure content is translated on load

    const savedAddress = localStorage.getItem('lastUsedAddress');
    if (savedAddress && recipientAddressInput) {
        recipientAddressInput.value = savedAddress;
        getAndDisplayTokenBalance(savedAddress);
    }

    loadWorkoutHistory(); // 履歴を読み込む
    renderWorkoutHistory(); // 履歴を表示する

    if(recipientAddressInput) {
        recipientAddressInput.addEventListener('input', () => getAndDisplayTokenBalance(recipientAddressInput.value));
    }

    addWorkoutBtn.addEventListener('click', addWorkoutEntry); 
    addWorkoutEntry(); // Add the first entry on page load

    const getRewardBtn = document.getElementById('get-reward-btn');
    getRewardBtn.addEventListener('click', createAndSendTransaction);

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

document.addEventListener('DOMContentLoaded', () => {
    updateContent();
});
