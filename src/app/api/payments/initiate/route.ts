import { NextResponse } from 'next/server';
import { MpesaAPI } from '@/lib/mpesa';
import { z } from 'zod';

const paymentSchema = z.object({
  phoneNumber: z.string().min(10).max(13),
  amount: z.number().min(1),
  accountReference: z.string().min(1),
  transactionDesc: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const validatedData = paymentSchema.parse(data);

    const mpesa = new MpesaAPI({
      consumerKey: process.env.MPESA_CONSUMER_KEY!,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
      baseURL: process.env.MPESA_BASE_URL!,
      passkey: process.env.MPESA_PASSKEY!,
      shortcode: process.env.MPESA_SHORTCODE!,
      callbackUrl: `${process.env.APP_URL}/api/payments/callback`,
    });

    const response = await mpesa.initiatePayment({
      ...validatedData,
      transactionDesc: validatedData.transactionDesc || 'Payment',
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Payment initiation failed:', error);
    return NextResponse.json(
      { error: 'Payment request failed' },
      { status: 500 }
    );
  }
}
