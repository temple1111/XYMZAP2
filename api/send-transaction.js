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
    crunches:       { name: '腹筋', tokenMultiplier: 1.0, caloriesPerRep: 0.4 },
    pushups:        { name: '腕立て伏せ', tokenMultiplier: 1.2, caloriesPerRep: 0.6 },
    squats:         { name: 'スクワット', tokenMultiplier: 1.5, caloriesPerRep: 0.8 },
    back_extensions: { name: '背筋', tokenMultiplier: 1.2, caloriesPerRep: 0.5 },
};

/**
 * Generates a motivational message using the Gemini API.
 * @param {string} workoutName The name of the workout.
 * @param {number} reps The number of workout repetitions.
 * @returns {Promise<string>} A motivational message.
 */
async function generateTransactionMessage(workoutName, reps) {
    const prompt = `あなたは、超熱血なフィットネストレーナーです。まるで鬼軍曹のように、しかし愛情を込めて、ユーザーを限界まで追い込むのがあなたのスタイルです。ユーザーが今、「${workoutName}」を${reps}回やり遂げました。この素晴らしい成果を称え、必ず「${workoutName}」という単語を使って、ユーザーの魂に火をつけるような、最高に熱く、パワフルで、モチベーションが爆上がりする一言（100文字以内）を生成してください。例：「その1回の${workoutName}が筋肉をデカくする！」`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating message with Gemini:", error);
        return "ナイスファイト！その調子で頑張ろう！"; // Fallback message
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!PRIVATE_KEY) {
        return res.status(500).json({ message: 'Server configuration error: Private key not set.' });
    }

    const { recipientAddress, workoutType, amount: reps } = req.body;
    const settings = WORKOUT_SETTINGS[workoutType];

    if (!recipientAddress || !reps || reps <= 0 || !settings) {
        return res.status(400).json({ message: 'Invalid input. Please provide a valid address, workout type, and number of reps.' });
    }

    try {
        // Calculate final token amount and calories based on workout type
        const finalTokenAmount = Math.floor(reps * settings.tokenMultiplier);
        const estimatedCalories = reps * settings.caloriesPerRep;

        // Generate the message first
        const generatedMessage = await generateTransactionMessage(settings.name, reps);
        const txMessage = PlainMessage.create(generatedMessage);

        // Setup Symbol transaction
        const repoFactory = new RepositoryFactoryHttp(NODE);
        const networkType = await repoFactory.getNetworkType().toPromise();
        const generationHash = await repoFactory.getGenerationHash().toPromise();
        const senderAccount = Account.createFromPrivateKey(PRIVATE_KEY, networkType);
        const recipient = Address.createFromRawAddress(recipientAddress);

        const transferTransaction = TransferTransaction.create(
            Deadline.create(SYMBOL_EPOCH_ADJUSTMENT), 
            recipient,
            [new Mosaic(new MosaicId('44FD959F9F2ECF4D'), UInt64.fromUint(finalTokenAmount))],
            txMessage,
            networkType
        ).setMaxFee(100);

        const signedTx = senderAccount.sign(transferTransaction, generationHash);
        
        const transactionHttp = repoFactory.createTransactionRepository();
        await transactionHttp.announce(signedTx).toPromise();

        res.status(200).json({ 
            message: 'Transaction announced successfully!', 
            transactionMessage: txMessage.payload, 
            estimatedCalories: estimatedCalories 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during the transaction process.', error: error.message });
    }
};