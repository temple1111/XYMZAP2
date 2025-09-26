// [1] CommonJS 形式でインポート可能なモジュール（rxjs、Google AI）を require で読み込みます。
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rxjs = require('rxjs'); 

// --- Symbol-related constants ---
const NODE = 'https://xym.jp1.node.leywapool.com:3001'; 
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// --- Gemini-related setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables.');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- Workout-related constants ---
const WORKOUT_SETTINGS = {
    crunches: 	 	{ name: '腹筋', name_en: 'Crunches', tokenMultiplier: 1.0, caloriesPerRep: 0.4 },
    pushups: 	 	{ name: '腕立て伏せ', name_en: 'Push-ups', tokenMultiplier: 1.2, caloriesPerRep: 0.6 },
    squats: 	 	{ name: 'スクワット', name_en: 'Squats', tokenMultiplier: 1.5, caloriesPerRep: 0.8 },
    back_extensions: { name: '背筋', name_en: 'Back Extensions', tokenMultiplier: 1.2, caloriesPerRep: 0.5 },
    general_workout: { name: '筋トレ全般', name_en: 'General Workout', tokenMultiplier: 1.0, caloriesPerRep: 0.5 },
};

/**
 * Generates a motivational message for multiple workouts.
 * ... (中略) ...
 */
async function generateTransactionMessage(workouts, lang = 'ja') {
    let promptTemplate;
    let fallbackMessage;

    const workoutSummary = workouts.map(w => {
        const workoutName = lang === 'en' && WORKOUT_SETTINGS[w.type] && WORKOUT_SETTINGS[w.type].name_en ? WORKOUT_SETTINGS[w.type].name_en : w.name;
        return lang === 'en' ? `${workoutName} for ${w.reps} reps` : `${workoutName}を${w.reps}回`;
    }).join(lang === 'en' ? ', ' : '、');

    if (lang === 'en') {
        promptTemplate = `You are a super passionate fitness trainer. Like a drill sergeant, but with love, your style is to push users to their limits. The user has just completed a great training session. The content is "${workoutSummary}". Praise this overall effort and generate a super hot, powerful, and motivating one-liner (within 100 characters) that ignites the user's soul. Your response MUST be ONLY in English.`;
        fallbackMessage = "Great workout! Nice fight!";
    } else {
        promptTemplate = `あなたは、超熱血なフィットネストレーナーです。まるで鬼軍曹のように、しかし愛情を込めて、ユーザーを限界まで追い込むのがあなたのスタイルです。ユーザーが今、素晴らしいトレーニングセッションを終えました。内容は「${workoutSummary}」です。この総合的な努力を称え、ユーザーの魂に火をつけるような、最高に熱く、パワフルで、モチベーションが爆上がりする一言（100文字以内）を生成してください。`;
        fallbackMessage = "素晴らしいトレーニングでした！ナイスファイト！";
    }

    try {
        const result = await geminiModel.generateContent(promptTemplate);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating message with Gemini:", error);
        console.error("Gemini Error Message Detail:", error.message);
        return fallbackMessage; // Fallback message
    }
}

// =========================================================================
// API エンドポイントのハンドラー
// =========================================================================
module.exports = async (req, res) => {
    // [2] Symbol SDK をダイナミックインポート (ESM 対策)
    // 展開せずに、すべてのクラスを symbol.Class の形式で参照します。
    const symbol = await import('symbol-sdk');
    const lastValueFrom = rxjs.lastValueFrom; // [3] requireした rxjs から lastValueFrom を取得

    // ❌ symbol の中身を展開する以下の行は不要 (TypeError 対策)
    // const { Account, Address, Deadline, Mosaic, MosaicId, NetworkType, PlainMessage, RepositoryFactoryHttp, TransferTransaction, UInt64 } = symbol;

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    // ... (中略: 初期チェック) ...

    try {
        let totalTokenAmount = 0;
        let totalCalories = 0;
        const workoutDetailsForPrompt = [];

        for (const workout of workouts) {
            const settings = WORKOUT_SETTINGS[workout.type];
            if (!settings || !workout.reps || workout.reps <= 0) {
                continue;
            }
            totalTokenAmount += Math.floor(workout.reps * settings.tokenMultiplier);
            totalCalories += workout.reps * settings.caloriesPerRep;
            workoutDetailsForPrompt.push({ type: workout.type, name: settings.name, reps: workout.reps });
        }

        if (totalTokenAmount <= 0) {
            return res.status(400).json({ message: 'No valid workouts provided to calculate a reward.' });
        }

        const generatedMessage = await generateTransactionMessage(workoutDetailsForPrompt, lang);
        
        // [4] PlainMessage.create の参照を修正
        const txMessage = symbol.PlainMessage.create(generatedMessage);

        // [4] RepositoryFactoryHttp の参照を修正
        const repoFactory = new symbol.RepositoryFactoryHttp(NODE);

        // lastValueFrom を使用して非同期処理を実行
        const networkType = await lastValueFrom(repoFactory.getNetworkType());
        const generationHash = await lastValueFrom(repoFactory.getGenerationHash());
        
        const networkRepository = repoFactory.createNetworkRepository();
        const networkProperties = await lastValueFrom(networkRepository.getNetworkProperties());
        // v3系では UInt64 オブジェクトを number/BigInt に変換
        const epochAdjustment = networkProperties.network.epochAdjustment.compact(); 

        // [4] Account と Address の参照を修正
        const senderAccount = symbol.Account.createFromPrivateKey(PRIVATE_KEY, networkType);
        const recipient = symbol.Address.createFromRawAddress(recipientAddress);

        // [4][5] v3.3.0 に合わせた TransferTransaction の修正
        const transferTransaction = symbol.TransferTransaction.create(
            // Deadline と UInt64 の参照を修正
            symbol.Deadline.create(epochAdjustment), 
            recipient,
            [new symbol.Mosaic(new symbol.MosaicId('44FD959F9F2ECF4D'), symbol.UInt64.fromUint(totalTokenAmount))],
            txMessage,
            networkType,
            // 最終引数で maxFee を指定
            symbol.UInt64.fromUint(1000000) 
        );
        
        const transactionHttp = repoFactory.createTransactionRepository();
        await lastValueFrom(transactionHttp.announce(signedTx)); 

        res.status(200).json({ 
            message: 'Transaction announced successfully!', 
            transactionMessage: txMessage.payload, 
            estimatedCalories: totalCalories 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during the transaction process.', error: error.message });
    }
};