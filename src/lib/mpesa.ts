import { MpesaConfig, MpesaPaymentRequest, MpesaResponse } from '../../types/mpesa';
import { Logger } from './logger';

interface MpesaRequestPayload {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export class MpesaAPI {
  private config: MpesaConfig;
  private accessToken: string = "";
  private tokenExpiry: number = 0;
  private logger: Logger;

  constructor(config: MpesaConfig) {
    this.validateConfig(config);
    this.config = config;
    this.logger = new Logger('MpesaAPI');
  }

  private validateConfig(config: MpesaConfig) {
    if (!config.callbackUrl.startsWith('https')) {
      throw new Error('Callback URL must use HTTPS in production');
    }
  }

  private async getAccessToken(): Promise<string> {
    try {
      // Check if token is still valid (with 5-minute buffer)
      if (this.accessToken && Date.now() < this.tokenExpiry - 300000) {
        return this.accessToken;
      }

      const auth = Buffer.from(
        `${this.config.consumerKey}:${this.config.consumerSecret}`
      ).toString('base64');

      const response = await fetch(
        `${this.config.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);
      return this.accessToken;
    } catch {
      this.logger.error('Failed to get access token');
      throw new Error('Authentication failed');
    }
  }

  public async initiatePayment(request: MpesaPaymentRequest): Promise<MpesaResponse> {
    try {
      this.validatePaymentRequest(request);
      
      const token = await this.getAccessToken();
      const timestamp = this.generateTimestamp();
      const password = this.generatePassword(timestamp);

      const payload = {
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(request.amount), // Ensure whole numbers only
        PartyA: this.formatPhoneNumber(request.phoneNumber),
        PartyB: this.config.shortcode,
        PhoneNumber: this.formatPhoneNumber(request.phoneNumber),
        CallBackURL: this.config.callbackUrl,
        AccountReference: request.accountReference,
        TransactionDesc: request.transactionDesc,
      };

      this.logger.info('Initiating payment:', { 
        phoneNumber: this.maskPhoneNumber(request.phoneNumber),
        amount: request.amount,
        reference: request.accountReference
      });

      const response = await this.makeRequest(
        `${this.config.baseURL}/mpesa/stkpush/v1/processrequest`,
        payload,
        token
      );

      return response;
    } catch (error) {
      this.logger.error('Payment initiation failed:', error);
    }
  }

  private async makeRequest(
    endpoint: string,
    payload: MpesaRequestPayload,
    token: string,
    retries = 3
  ): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${endpoint}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.errorMessage || response.statusText);
        }

        if (data.ResponseCode !== '0') {
          throw new Error(data.ResponseDescription || 'Payment request failed');
        }

        return data;
      } catch (error) {
        if (attempt === retries) throw error;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  private validatePaymentRequest(request: MpesaPaymentRequest) {
    if (!request.phoneNumber) {
      throw new Error('Invalid phone number');
    }
    if (!request.amount || request.amount <= 0) {
      throw new Error('Invalid amount');
    }
    if (!request.accountReference) {
      throw new Error('Account reference is required');
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Convert to required format (254XXXXXXXXX)
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 9) {
      return `254${cleaned}`;
    }
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      return `254${cleaned.slice(1)}`;
    }
    if (cleaned.length === 12 && cleaned.startsWith('254')) {
      return cleaned;
    }
    throw new Error('Invalid phone number format');
  }

  private maskPhoneNumber(phone: string): string {
    const formatted = this.formatPhoneNumber(phone);
    return `${formatted.slice(0, 6)}****${formatted.slice(-2)}`;
  }

  private generateTimestamp(): string {
    return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  }

  private generatePassword(timestamp: string): string {
    return Buffer.from(
      `${this.config.shortcode}${this.config.passkey}${timestamp}`
    ).toString('base64');
  }
}
