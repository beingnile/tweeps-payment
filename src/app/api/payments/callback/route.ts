import { NextResponse } from 'next/server';
import { Logger } from '@/lib/logger';
import { TransactionsManager } from '@/lib/transactions-manager';

const logger = new Logger('MpesaCallback');

export async function POST(request: Request) {
  try {
    const data = await request.json();
    logger.info('Received payment callback', { requestId: data.Body.stkCallback.CheckoutRequestID });

    if (data.Body.stkCallback.ResultCode === 0) {
      const amount = callbackData.find((item: any) => item.Name === 'Amount').Value;
      const phoneNumber = callbackData.find((item: any) => item.Name === 'PhoneNumber').Value;

      // Add to transactions file
      await TransactionsManager.addTransaction({
        phoneNumber: phoneNumber.toString(),
        amount,
        status: 'Completed'
      });

      logger.info('Payment processed successfully', { transactionId: mpesaReceiptNumber });
    } else {
      // Optionally log failed transactions
      await TransactionsManager.addTransaction({
        amount: 0, // or some default/extracted amount
        status: 'Pending'
      });

      logger.error('Payment failed', {
        code: data.Body.stkCallback.ResultCode,
        description: data.Body.stkCallback.ResultDesc,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Failed to process payment callback:', error);
    return NextResponse.json({ error: 'Failed to process callback' }, { status: 500 });
  }
}
