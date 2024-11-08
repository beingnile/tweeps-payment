import { NextResponse } from 'next/server';
import { Logger } from '@/lib/logger';
import { TransactionsManager } from '@/lib/transactions-manager';

interface CallbackItem {
  Name: string;
  Value: number | string;
}

interface STKCallback {
  ResultCode: number;
  ResultDesc: string;
  CheckoutRequestID: string;
  CallbackMetadata?: {
    Item: CallbackItem[];
  };
}

interface MpesaCallbackData {
  Body: {
    stkCallback: STKCallback;
  };
}

const logger = new Logger('MpesaCallback');

export async function POST(request: Request) {
  try {
    const data: MpesaCallbackData = await request.json();
    logger.info('Received payment callback', { requestId: data.Body.stkCallback.CheckoutRequestID });

    const callbackData = data.Body.stkCallback.CallbackMetadata?.Item || [];

    if (data.Body.stkCallback.ResultCode === 0) {
      const amount = callbackData.find(item => item.Name === 'Amount');

      if (!amount) {
        throw new Error('Missing required callback data');
      }

      // Add to transactions file
      await TransactionsManager.addTransaction({
        amount: Number(amount.Value),
        status: 'Completed'
      });

      logger.info('Payment processed successfully');
    } else {
      await TransactionsManager.addTransaction({
        amount: 0,
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
