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

/**
 * Generates a motivational message using the Gemini API based on the number of reps.
 * @param {number} amount The number of workout repetitions.
 * @returns {Promise<string>} A motivational message.
 */
async function generateTransactionMessage(amount) {
    const prompt = `あなたはプロのフィットネストレーナーです。ユーザーが今、筋力トレーニングを終えました。トレーニング回数は${amount}回です。この回数に応じて、ユーザーを称賛し、次も頑張りたくなるような、短く（50文字以内）、力的で、ポジティブなメッセージを生成してください。`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating message with Gemini:", error);
        // Fallback message in case of Gemini API error
        return "ナイスファイト！その調子で頑張ろう！";
    }
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!PRIVATE_KEY) {
        return res.status(500).json({ message: 'Server configuration error: Private key not set.' });
    }

    const { recipientAddress, amount } = req.body;

    if (!recipientAddress || !amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid input. Please provide a valid address and amount.' });
    }

    try {
        // Generate the message first
        const generatedMessage = await generateTransactionMessage(amount);
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
            [new Mosaic(new MosaicId('44FD959F9F2ECF4D'), UInt64.fromUint(amount))],
            txMessage,
            networkType
        ).setMaxFee(100);

        const signedTx = senderAccount.sign(transferTransaction, generationHash);
        
        const transactionHttp = repoFactory.createTransactionRepository();
        await transactionHttp.announce(signedTx).toPromise();

        res.status(200).json({ message: 'Transaction announced successfully!', transactionMessage: txMessage.payload });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during the transaction process.', error: error.message });
    }
};