export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  baseURL: string;
  passkey: string;
  shortcode: string;
  callbackUrl: string;
}

export interface MpesaPaymentRequest {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

export interface MpesaResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}
