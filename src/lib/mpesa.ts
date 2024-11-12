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
      // Check if token is still valid (with 30 seconds buffer)
      if (this.accessToken && this.tokenExpiry > Date.now() + 30000) {
        return this.accessToken;
      }

      const auth = Buffer.from(
        `${this.config.consumerKey}:${this.config.consumerSecret}`
      ).toString('base64');

      this.logger.info('Requesting new access token');
      
      const response = await fetch(
        `${this.config.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${auth}`,
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('Failed to get access token', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Failed to get access token: ${response.statusText}. ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.access_token) {
        this.logger.error('Invalid token response', { data });
        throw new Error('Invalid token response from server');
      }

      this.accessToken = data.access_token;
      // Set token expiry (default to 50 minutes if expires_in not provided)
      this.tokenExpiry = Date.now() + ((data.expires_in || 3000) * 1000);
      
      this.logger.info('New access token obtained');
      
      return this.accessToken;
    } catch (error) {
      this.logger.error('Token request failed', { error });
      throw new Error(`Authentication failed: ${error}`);
    }
  }

  public async initiatePayment(request: MpesaPaymentRequest): Promise<MpesaResponse> {
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
      TransactionDesc: request.transactionDesc || `Payment for ${request.accountReference}`,
    };

    this.logger.info('Initiating payment:', { 
      phoneNumber: this.maskPhoneNumber(request.phoneNumber),
      amount: request.amount,
      reference: request.accountReference
    });

    return await this.makeRequest(
      `${this.config.baseURL}/mpesa/stkpush/v1/processrequest`,
      payload,
      token
    );
  }

  private async makeRequest(
    endpoint: string,
    payload: MpesaRequestPayload,
    token: string,
    retries = 3
  ): Promise<MpesaResponse> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          // Log the actual error response
          this.logger.error('Request failed', {
            status: response.status,
            data,
            attempt
          });

          if (response.status === 401 || data?.errorCode === 'Invalid Access Token') {
            // Force token refresh on next attempt
            this.tokenExpiry = 0;
            if (attempt < retries) {
              this.logger.info('Refreshing token and retrying...');
              token = await this.getAccessToken();
              continue;
            }
          }
          
          throw new Error(data.errorMessage || response.statusText);
        }

        if (data.ResponseCode !== '0') {
          this.logger.error('Payment request failed', { 
            responseCode: data.ResponseCode,
            responseDescription: data.ResponseDescription 
          });
          throw new Error(data.ResponseDescription || 'Payment request failed');
        }

        return data;
      } catch (error) {
        if (attempt === retries) {
          this.logger.error('All retry attempts failed', { error });
          throw error;
        }
        // Exponential backoff
        const backoffTime = Math.pow(2, attempt) * 1000;
        this.logger.info(`Retrying after ${backoffTime}ms (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    throw new Error('Request failed after all retries');
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
