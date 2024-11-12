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
  private tokenLock: Promise<void> | null = null;

  constructor(config: MpesaConfig) {
    this.validateConfig(config);
    this.config = config;
    this.logger = new Logger('MpesaAPI');
  }

  private validateConfig(config: MpesaConfig) {
    const requiredFields = ['consumerKey', 'consumerSecret', 'shortcode', 'passkey', 'callbackUrl', 'baseURL'];
    const missingFields = requiredFields.filter(field => !config[field as keyof MpesaConfig]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }

    if (!config.callbackUrl.startsWith('https')) {
      throw new Error('Callback URL must use HTTPS in production');
    }
  }

  private async getAccessToken(): Promise<string> {
    // Implement token locking to prevent multiple simultaneous token requests
    if (this.tokenLock) {
      await this.tokenLock;
      if (this.isTokenValid()) {
        console.info({
          timestamp: new Date().toISOString(),
          service: "MpesaAPI",
          level: "info",
          message: "Using cached access token",
          accessToken: this.accessToken,
          expiry: new Date(this.tokenExpiry).toISOString(),
        });
        return this.accessToken;
      }
    }

    console.info({
      timestamp: new Date().toISOString(),
      service: "MpesaAPI",
      level: "info",
      message: "Requesting new access token"
    });

    let resolveLock: (() => void) | null = null;
    this.tokenLock = new Promise<void>((resolve) => {
      resolve();
    });

    try {
      if (this.isTokenValid()) {
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
     
      console.info({
        timestamp: new Date().toISOString(),
        service: "MpesaAPI",
        level: "info",
        message: "New access token obtained",
        token: this.accessToken,
        expiry: new Date(this.tokenExpiry).toISOString(),
      });

      this.logger.info('New access token obtained');
      
      return this.accessToken;
    } finally {
      if (this.tokenLock) {
        (this.tokenLock as Promise<void>).then(() => this.tokenLock = null);
      }
    }
  }

  private isTokenValid(): boolean {
    return Boolean(this.accessToken && this.tokenExpiry > Date.now());
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
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.info({
          timestamp: new Date().toISOString(),
          service: "MpesaAPI",
          level: "info",
          message: "Making request to endpoint",
          url: endpoint,
          accessToken: token,
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          // Log the actual error response
          console.error({
            timestamp: new Date().toISOString(),
            service: "MpesaAPI",
            level: "error",
            message: "Request failed",
            status: response.status,
            response: errorData,
          });

          this.logger.error('Request failed', {
            status: response.status,
            data,
            attempt
          });

          const error = new Error(data.errorMessage || response.statusText);
          if (data?.errorCode === 'Invalid Access Token') {
            error.message = 'Invalid Access Token';
          }
          throw error;

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
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof Error && error.message === 'Invalid Access Token') {
          throw error; // Let the calling function handle token refresh
        }

        if (attempt === retries) {
          this.logger.error('All retry attempts failed', { error: lastError });
          throw lastError;
        }

        const backoffTime = Math.min(Math.pow(2, attempt) * 1000, 10000); // Cap at 10 seconds
        this.logger.info(`Retrying after ${backoffTime}ms (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    throw lastError || new Error('Request failed after all retries');
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
