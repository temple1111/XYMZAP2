// --- Frontend Logic ---
const NODE = 'https://xym.jp1.node.leywapool.com:3001';
const sym = require("/node_modules/symbol-sdk");
const repo = new sym.RepositoryFactoryHttp(NODE);

// Level thresholds and names
const LEVEL_THRESHOLDS = [0, 1000, 2500, 5000, 10000, 15000, 25000, 37500, 50000, 75000, 100000];
const LEVEL_NAMES = [
    "ビギナー", "ルーキー", "マッスル見習い", "中級マッスル", "ベテラントレーニー",
    "プロビルダー", "筋肉の賢者", "鋼の肉体", "神の領域", "レジェンド", "マッスルマスター"
];

async function createAndSendTransaction() {
    const recipientAddressValue = document.getElementById('recipientAddress').value;
    const amountValue = parseInt(document.getElementById('amount').value); // amountValue を数値として取得

    if (!recipientAddressValue || isNaN(amountValue) || amountValue <= 0) { // isNaN を追加
        alert("受信者のSYMBOLアドレスと筋トレ回数を正しく入力してください。");
        return;
    }

    // 新しい上限チェックを追加
    const MAX_REPS_PER_TRANSACTION = 2000; // 1回あたりの最大筋トレ回数を2000回に設定
    if (amountValue > MAX_REPS_PER_TRANSACTION) {
        alert(`筋トレ回数の上限は${MAX_REPS_PER_TRANSACTION}回までです！筋肉を休ませることも大切ですよ！`);
        return;
    }

    try {
        sym.Address.createFromRawAddress(recipientAddressValue);
    } catch (error) {
        alert("アドレスの形式が正しくないようです。");
        return;
    }

    // Save the valid address to localStorage
    localStorage.setItem('lastUsedAddress', recipientAddressValue);

    const button = document.querySelector('#transferForm button');
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 処理中...';

    try {
        const response = await fetch('/api/send-transaction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                recipientAddress: recipientAddressValue, 
                workoutType: workoutTypeValue,
                amount: parseInt(amountValue) 
            }),
        });

        const data = await response.json();
        const transactionDetails = document.getElementById('transactionDetails');
        const estimatedCaloriesDisplay = document.getElementById('estimatedCaloriesDisplay');

        if (response.ok) {
            document.getElementById('message').textContent = `message: ${data.transactionMessage}`;
            if (data.estimatedCalories !== undefined) {
                estimatedCaloriesDisplay.textContent = `消費カロリー: ${data.estimatedCalories.toFixed(1)} kcal`;
            }
            transactionDetails.classList.remove('d-none');
            getAndDisplayTokenBalance(recipientAddressValue);
            document.getElementById('shareButton').style.display = 'block';
            document.getElementById('copyTextButton').style.display = 'block';
        } else {
            throw new Error(data.message || '不明なエラーが発生しました。');
        }

    } catch (error) {
        console.error("API呼び出し中にエラーが発生しました:", error);
        alert(`エラー: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = '報酬を獲得';
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

            // Handle plus levels
            if (currentLevelIndex === maxLevelIndex) {
                const plusLevel = Math.floor((currentTokenCount - muscleMasterThreshold) / 25000);
                if (plusLevel > 0) {
                    levelName = `${LEVEL_NAMES[maxLevelIndex]} +${plusLevel}`;
                }
            }

            // --- NEW PERCENTAGE LOGIC ---
            const totalGoal = muscleMasterThreshold; // 100,000
            // Cap the percentage at 100 for the progress bar display
            let progressPercentage = Math.min((currentTokenCount / totalGoal) * 100, 100);

            document.getElementById('levelDisplay').textContent = `レベル: ${levelName} (${Math.floor(progressPercentage)}%)`;
            document.querySelector('.progress-bar').style.width = `${progressPercentage}%`;

            // Set background based on level
            const backgroundIndex = Math.min(currentLevelIndex, 9);
            bodyElement.className = `background-${backgroundIndex}`;

            // バッジ画像の更新
            document.getElementById('currentLevelBadge').src = `../level${currentLevelIndex}_badge.svg`;
            
        } else {
            tokenBalanceElement.textContent = 'トークンを保有していません';
            bodyElement.classList.add('background-0');
            // トークンがない場合もレベル表示をリセット
            document.getElementById('levelDisplay').textContent = `レベル: ビギナー (0%)`;
            document.querySelector('.progress-bar').style.width = `0%`;
            // バッジもリセット
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

    // 1. Get Data
    const levelText = document.getElementById('levelDisplay').textContent;
    const aiMessage = document.getElementById('message').textContent.replace('message: ', '');
    const badgeSrc = document.getElementById('currentLevelBadge').src;

    // Get token count to determine level
    const tokenBalanceText = document.getElementById('tokenBalance').textContent;
    const tokenMatch = tokenBalanceText.match(/(\d+)\s*KINNIKU-TOKEN/);
    const currentTokenCount = tokenMatch ? parseInt(tokenMatch[1], 10) : 0;

    // Re-calculate level index to be self-contained
    let currentLevelIndex = 0;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (currentTokenCount >= LEVEL_THRESHOLDS[i]) {
            currentLevelIndex = i;
        } else {
            break;
        }
    }

    // Determine background from level
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

        // --- Final "Cooler" Layout ---

        const padding = canvas.width * 0.05;

        // 1. Badge (Top-Right)
        const badgeImage = await loadImage(badgeSrc);
        const badgeSize = canvas.width * 0.1;
        const badgeX = canvas.width - badgeSize - padding;
        const badgeY = padding;
        ctx.drawImage(badgeImage, badgeX, badgeY, badgeSize, badgeSize);

        // 2. Level Text (Smaller, under badge, right-aligned)
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'right'; // Change to right alignment
        ctx.font = `bold ${canvas.width * 0.025}px sans-serif`;
        const levelTextY = badgeY + badgeSize + 40;
        const levelTextX = badgeX + badgeSize; // Align to the right edge of the badge
        ctx.fillText(levelText, levelTextX, levelTextY);

        // 3. AI Message (Lower down, left-aligned)
        ctx.textAlign = 'left';
        ctx.font = `${canvas.width * 0.025}px sans-serif`;
        const maxWidth = canvas.width - (padding * 2);
        const lineHeight = canvas.width * 0.04;
        const startY = levelTextY + 80; // Position further down
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        
        wrapText(ctx, aiMessage, padding, startY, maxWidth, lineHeight);

        // --- End of Layout ---

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
    const shareText = `筋トレ報告！　筋トレを始めて、KINNIKU-TOKENを手に入れよう！ \n #symbol #XYM #筋トレ #fitness\n`;
    
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
    // Load saved address from localStorage
    const savedAddress = localStorage.getItem('lastUsedAddress');
    const recipientAddressInput = document.getElementById('recipientAddress');
    if (savedAddress && recipientAddressInput) {
        recipientAddressInput.value = savedAddress;
        getAndDisplayTokenBalance(savedAddress); // Also update balance for the saved address
    }

    if(recipientAddressInput) {
        recipientAddressInput.addEventListener('input', () => getAndDisplayTokenBalance(recipientAddressInput.value));
    }

    // Drawer logic
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

    // 新しいボタンのイベントリスナー
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
});ick', copyShareText);
    }
});