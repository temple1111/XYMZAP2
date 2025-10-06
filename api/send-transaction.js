import * as sym from "symbol-sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const {
    recipientRawAddress,
    amount,
    message,
  } = req.body;

  if (!recipientRawAddress || !amount || !message) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  try {
    // Environment variables from Vercel
    const mosaicId = new sym.MosaicId(process.env.MOSAIC_ID);
    const node = process.env.NODE;
    const networkType = Number(process.env.NETWORK_TYPE);
    const privateKey = process.env.PRIVATE_KEY;
    const epochAdjustment = Number(process.env.EPOCH_ADJUSTMENT);

    const repositoryFactory = new sym.RepositoryFactoryHttp(node);
    const transactionHttp = repositoryFactory.createTransactionRepository();
    const receiptHttp = repositoryFactory.createReceiptRepository();
    const transactionService = new sym.TransactionService(
      transactionHttp,
      receiptHttp
    );
    const networkGenerationHash = await repositoryFactory
      .getGenerationHash()
      .toPromise();

    const senderAccount = sym.Account.createFromPrivateKey(privateKey, networkType);
    const recipientAddress = sym.Address.createFromRawAddress(recipientRawAddress);

    const transferTransaction = sym.TransferTransaction.create(
      sym.Deadline.create(epochAdjustment),
      recipientAddress,
      [new sym.Mosaic(mosaicId, sym.UInt64.fromUint(amount * 1000000))],
      sym.PlainMessage.create(message),
      networkType
    );

    const signedTransaction = senderAccount.sign(
      transferTransaction,
      networkGenerationHash
    );

    console.log("Announcing transaction with hash:", signedTransaction.hash);

    await transactionService.announce(signedTransaction).toPromise();

    res.status(200).json({
      message: "Transaction successful",
      hash: signedTransaction.hash,
    });
  } catch (error) {
    console.error("Transaction error:", error);
    res.status(500).json({
      message: "An error occurred during the transaction process.",
      error: error.message,
    });
  }
}
