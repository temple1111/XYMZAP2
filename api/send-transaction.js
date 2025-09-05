const { Account, Address, Deadline, Mosaic, MosaicId, NetworkType, PlainMessage, RepositoryFactoryHttp, TransferTransaction, UInt64 } = require('symbol-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Symbol-related constants ---
const NODE = 'https://xym.jp1.node.leywapool.com:3001';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SYMBOL_EPOCH_ADJUSTMENT = 1615853188;

// --- Gemini-related setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables.');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- Workout-related constants ---
const WORKOUT_SETTINGS = {
    general:        { name: '筋トレ', tokenMultiplier: 1.0, caloriesPerRep: 0.5 },
    crunches:       { name: '腹筋', tokenMultiplier: 1.0, caloriesPerRep: 0.4 },
    pushups:        { name: '腕立て伏せ', tokenMultiplier: 1.2, caloriesPerRep: 0.6 },
    squats:         { name: 'スクワット', tokenMultiplier: 1.5, caloriesPerRep: 0.8 },
    back_extensions: { name: '背筋', tokenMultiplier: 1.2, caloriesPerRep: 0.5 },
};

/**
 * Generates a motivational message for multiple workouts.
 * @param {Array<object>} workouts - Array of workout objects, e.g., [{name: 'スクワット', reps: 50}]
 * @returns {Promise<string>} A motivational message.
 */
async function generateTransactionMessage(workouts) {
    const workoutSummary = workouts.map(w => `${w.name}を${w.reps}回`).join('、');
    const prompt = `あなたは、超熱血なフィットネストレーナーです。まるで鬼軍曹のように、しかし愛情を込めて、ユーザーを限界まで追い込むのがあなたのスタイルです。ユーザーが今、素晴らしいトレーニングセッションを終えました。内容は「${workoutSummary}」です。この総合的な努力を称え、ユーザーの魂に火をつけるような、最高に熱く、パワフルで、モチベーションが爆上がりする一言（100文字以内）を生成してください。`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating message with Gemini:", error);
        return "素晴らしいトレーニングでした！ナイスファイト！"; // Fallback message
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!PRIVATE_KEY) {
        return res.status(500).json({ message: 'Server configuration error: Private key not set.' });
    }

    const { recipientAddress, workouts } = req.body;

    if (!recipientAddress || !Array.isArray(workouts) || workouts.length === 0) {
        return res.status(400).json({ message: 'Invalid input. Please provide a valid address and at least one workout.' });
    }

    try {
        let totalTokenAmount = 0;
        let totalCalories = 0;
        const workoutDetailsForPrompt = [];

        for (const workout of workouts) {
            const settings = WORKOUT_SETTINGS[workout.type];
            if (!settings || !workout.reps || workout.reps <= 0) {
                // Skip invalid entries silently or return an error
                continue;
            }
            totalTokenAmount += Math.floor(workout.reps * settings.tokenMultiplier);
            totalCalories += workout.reps * settings.caloriesPerRep;
            workoutDetailsForPrompt.push({ name: settings.name, reps: workout.reps });
        }

        if (totalTokenAmount <= 0) {
            return res.status(400).json({ message: 'No valid workouts provided to calculate a reward.' });
        }

        const generatedMessage = await generateTransactionMessage(workoutDetailsForPrompt);
        const txMessage = PlainMessage.create(generatedMessage);

        const repoFactory = new RepositoryFactoryHttp(NODE);
        const networkType = await repoFactory.getNetworkType().toPromise();
        const generationHash = await repoFactory.getGenerationHash().toPromise();
        const senderAccount = Account.createFromPrivateKey(PRIVATE_KEY, networkType);
        const recipient = Address.createFromRawAddress(recipientAddress);

        const transferTransaction = TransferTransaction.create(
            Deadline.create(SYMBOL_EPOCH_ADJUSTMENT), 
            recipient,
            [new Mosaic(new MosaicId('44FD959F9F2ECF4D'), UInt64.fromUint(totalTokenAmount))],
            txMessage,
            networkType
        ).setMaxFee(100);

        const signedTx = senderAccount.sign(transferTransaction, generationHash);
        
        const transactionHttp = repoFactory.createTransactionRepository();
        await transactionHttp.announce(signedTx).toPromise();

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