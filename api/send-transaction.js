// 🚨 package.json に "type": "module" が設定されていることを確認してください。

import { GoogleGenerativeAI } from '@google/generative-ai';
import { lastValueFrom } from 'rxjs'; 
import * as symbol from 'symbol-sdk'; // Symbol SDK 全体を as symbol でインポート

// 🚨 修正: クラスの展開は行いません！
// const { Account, Address, ... } = symbol; // 👈 この行は削除

// --- (中略: 定数、generateTransactionMessage 関数) ---

// =========================================================================
// API エンドポイントのハンドラー
// =========================================================================
export default async (req, res) => {
    
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { recipientAddress, workouts, lang } = req.body; 

    // ... (中略: 初期チェック) ...

    // 🚨 最終修正: すべての Symbol クラスへの参照に `symbol.default.` を使用する
    const SymbolSDK = symbol.default; 
    
    // Safety check: SymbolSDK が undefined の場合はエラーを出す (念のため)
    if (!SymbolSDK || !SymbolSDK.PlainMessage) {
        console.error("Symbol SDK structure not found. Symbol object keys:", Object.keys(symbol));
        return res.status(500).json({ message: 'Symbol SDK failed to load. The module structure is incorrect for this environment.' });
    }

    try {
        // ... (中略: totalTokenAmount の計算) ...

        const generatedMessage = await generateTransactionMessage(workoutDetailsForPrompt, lang);
        
        // 🚨 PlainMessage.create の参照を修正
        const txMessage = SymbolSDK.PlainMessage.create(generatedMessage);

        const repoFactory = new SymbolSDK.RepositoryFactoryHttp(NODE);

        const networkType = await lastValueFrom(repoFactory.getNetworkType());
        const generationHash = await lastValueFrom(repoFactory.getGenerationHash());
        
        const networkRepository = repoFactory.createNetworkRepository();
        const networkProperties = await lastValueFrom(networkRepository.getNetworkProperties());
        
        const epochAdjustment = networkProperties.network.epochAdjustment.compact(); 

        // 🚨 Account と Address の参照を修正
        const senderAccount = SymbolSDK.Account.createFromPrivateKey(PRIVATE_KEY, networkType);
        const recipient = SymbolSDK.Address.createFromRawAddress(recipientAddress);

        // 🚨 TransferTransaction の参照を修正
        const transferTransaction = SymbolSDK.TransferTransaction.create(
            SymbolSDK.Deadline.create(epochAdjustment), 
            recipient,
            [new SymbolSDK.Mosaic(new SymbolSDK.MosaicId('44FD959F9F2ECF4D'), SymbolSDK.UInt64.fromUint(totalTokenAmount))],
            txMessage,
            networkType,
            SymbolSDK.UInt64.fromUint(1000000) 
        );
        
        const signedTx = senderAccount.sign(transferTransaction, generationHash);
        
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