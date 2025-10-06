import sym from "symbol-sdk";

// 各ワークアウトの消費カロリー（トークン量の計算に使用）
const WORKOUT_CALORIES = {
    crunches: 0.3,
    pushups: 0.5,
    squats: 0.4,
    back_extensions: 0.2,
    general_workout: 0.1,
};

// AIトレーナーのメッセージ
const AI_MESSAGES = [
    "素晴らしいトレーニングでした！その調子で頑張りましょう！",
    "今日の努力が、明日の強さにつながります。",
    "すごい集中力でしたね！次も期待しています。",
    "完璧なフォームでした。筋肉が喜んでいますよ！",
    "限界を超えるその精神、まさにアスリートです！"
];

/**
 * ワークアウトの内容から、送信するトークン量とメッセージを生成する
 */
function getWorkoutAmountAndMessage(workouts) {
    let totalCalories = 0;
    let messageParts = [];

    // ワークアウトの種類と翻訳キーのマッピング
    const workoutTranslations = {
        "crunches": "腹筋",
        "pushups": "腕立て伏せ",
        "squats": "スクワット",
        "back_extensions": "背筋",
        "general_workout": "その他"
    };

    workouts.forEach(workout => {
        const caloriesPerRep = WORKOUT_CALORIES[workout.type] || 0.1;
        totalCalories += workout.reps * caloriesPerRep;
        const workoutName = workoutTranslations[workout.type] || workout.type;
        messageParts.push(`${workoutName}: ${workout.reps}回`);
    });

    const randomAiMessage = AI_MESSAGES[Math.floor(Math.random() * AI_MESSAGES.length)];
    const transactionMessage = `今回のトレーニング: ${messageParts.join('、')}。 ${randomAiMessage}`;
    
    // トークン量（整数）、メッセージ、消費カロリーを返す
    return {
        amount: Math.round(totalCalories),
        message: transactionMessage,
        estimatedCalories: totalCalories
    };
}


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    console.log("Received request body:", JSON.stringify(req.body));

    const { recipientAddress, workouts } = req.body;

    if (!recipientAddress || !workouts || !Array.isArray(workouts) || workouts.length === 0) {
        return res.status(400).json({ message: 'Missing or invalid parameters.' });
    }

    const { amount, message, estimatedCalories } = getWorkoutAmountAndMessage(workouts);

    if (amount <= 0) {
        return res.status(400).json({ message: 'Workout resulted in zero amount.' });
    }

    try {
        const mosaicId = new sym.MosaicId(process.env.MOSAIC_ID);
        const node = process.env.NODE;
        const networkType = Number(process.env.NETWORK_TYPE);
        const privateKey = process.env.PRIVATE_KEY;
        const epochAdjustment = Number(process.env.EPOCH_ADJUSTMENT);

        const repositoryFactory = new sym.RepositoryFactoryHttp(node);
        const transactionHttp = repositoryFactory.createTransactionRepository();
        const receiptHttp = repositoryFactory.createReceiptRepository();
        const transactionService = new sym.TransactionService(transactionHttp, receiptHttp);
        const networkGenerationHash = await repositoryFactory.getGenerationHash().toPromise();

        const senderAccount = sym.Account.createFromPrivateKey(privateKey, networkType);
        const recipientAddr = sym.Address.createFromRawAddress(recipientAddress);

        const transferTransaction = sym.TransferTransaction.create(
            sym.Deadline.create(epochAdjustment),
            recipientAddr,
            [new sym.Mosaic(mosaicId, sym.UInt64.fromUint(amount * 1000000))], // モザイクの可分性を6と仮定
            sym.PlainMessage.create(message),
            networkType
        );

        const signedTransaction = senderAccount.sign(transferTransaction, networkGenerationHash);
        await transactionService.announce(signedTransaction).toPromise();

        res.status(200).json({
            message: 'Transaction successful',
            hash: signedTransaction.hash,
            transactionMessage: message, // 生成したメッセージをフロントエンドに返す
            estimatedCalories: estimatedCalories // 計算したカロリーも返す
        });

    } catch (error) {
        console.error("Transaction error:", error);
        res.status(500).json({
            message: 'An error occurred during the transaction process.',
            error: error.message,
        });
    }
}