const { Account, Address, Deadline, Mosaic, MosaicId, NetworkType, PlainMessage, RepositoryFactoryHttp, TransferTransaction, UInt64 } = require('symbol-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Symbol-related constants ---
const NODE = 'https://xymtokyo.harvest-node.net:3001';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SYMBOL_EPOCH_ADJUSTMENT = 1615853188;

// --- Gemini-related setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables.');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- Workout-related constants ---
const WORKOUT_SETTINGS = {
    crunches:       { name: '腹筋', name_en: 'Crunches', tokenMultiplier: 1.0, caloriesPerRep: 0.4 },
    pushups:        { name: '腕立て伏せ', name_en: 'Push-ups', tokenMultiplier: 1.2, caloriesPerRep: 0.6 },
    squats:         { name: 'スクワット', name_en: 'Squats', tokenMultiplier: 1.5, caloriesPerRep: 0.8 },
    back_extensions: { name: '背筋', name_en: 'Back Extensions', tokenMultiplier: 1.2, caloriesPerRep: 0.5 },
    general_workout: { name: '筋トレ全般', name_en: 'General Workout', tokenMultiplier: 1.0, caloriesPerRep: 0.5 },
};

/**
 * Generates a motivational message for multiple workouts.
 * @param {Array<object>} workouts - Array of workout objects, e.g., [{name: 'スクワット', reps: 50}]
 * @param {string} lang - The desired language for the message ('ja' or 'en').
 * @returns {Promise<string>} A motivational message.
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
        return fallbackMessage; // Fallback message
    }
}

module.exports = async (req, res) => {
    console.log('Function started.');
    if (req.method !== 'POST') {
        console.log('Method not POST.');
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!PRIVATE_KEY) {
        console.log('PRIVATE_KEY not set.');
        return res.status(500).json({ message: 'Server configuration error: Private key not set.' });
    }

    const { recipientAddress, workouts, lang } = req.body; // Extract lang from request body

    if (!recipientAddress || !Array.isArray(workouts) || workouts.length === 0) {
        console.log('Invalid input.');
        return res.status(400).json({ message: 'Invalid input. Please provide a valid address and at least one workout.' });
    }

    try {
        console.log('Starting workout processing.');
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
            workoutDetailsForPrompt.push({ type: workout.type, name: settings.name, reps: workout.reps }); // Pass workout.type
        }

        if (totalTokenAmount <= 0) {
            return res.status(400).json({ message: 'No valid workouts provided to calculate a reward.' });
        }

        const generatedMessage = await generateTransactionMessage(workoutDetailsForPrompt, lang);
        console.log('Gemini message generated.');
        const txMessage = PlainMessage.create(generatedMessage);

        const repoFactory = new RepositoryFactoryHttp(NODE);
        console.log('RepositoryFactoryHttp created.');
        const networkType = await repoFactory.getNetworkType().toPromise();
        console.log('Network type obtained.');
        const generationHash = await repoFactory.getGenerationHash().toPromise();
        console.log('Generation hash obtained.');
        const senderAccount = Account.createFromPrivateKey(PRIVATE_KEY, networkType);
        const recipient = Address.createFromRawAddress(recipientAddress);

        const transferTransaction = TransferTransaction.create(
            Deadline.create(SYMBOL_EPOCH_ADJUSTMENT, 2),
            recipient,
            [new Mosaic(new MosaicId('44FD959F9F2ECF4D'), UInt64.fromUint(totalTokenAmount))],
            txMessage,
            networkType
        ).setMaxFee(100);

        const signedTx = senderAccount.sign(transferTransaction, generationHash);
        console.log('Transaction signed.');
        
        const transactionHttp = repoFactory.createTransactionRepository();
        await transactionHttp.announce(signedTx).toPromise();
        console.log('Transaction announced successfully.');

        res.status(200).json({
            message: 'Transaction announced successfully!',
            transactionMessage: txMessage.payload,
            estimatedCalories: totalCalories
        });

    } catch (error) {
        console.error('Error in transaction process:', error);
        res.status(500).json({ message: 'An error occurred during the transaction process.', error: error.message });
    }
};