interface LogMetadata {
  [key: string]: unknown;
  error?: string;
  stack?: string;
}

export class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      level,
      message,
      ...meta,
    });
  }

  info(message: string, meta?: any) {
    console.log(this.formatMessage('info', message, meta));
  }

  error(message: string, error?: any) {
    console.error(this.formatMessage('error', message, {
      error: error?.message,
      stack: error?.stack,
    }));
  }
}
