import fs from 'fs/promises';
import path from 'path';

interface Transaction {
  id: string;
  phoneNumber: string;
  amount: number;
  status: 'Completed' | 'Pending';
  timestamp: number;
}

export class TransactionsManager {
  private static TRANSACTIONS_FILE = path.join(process.cwd(), 'transactions.json');
  private static MAX_TRANSACTIONS = 40;

  static async getTransactions(): Promise<Transaction[]> {
    try {
      const fileContents = await fs.readFile(this.TRANSACTIONS_FILE, 'utf-8');
      return JSON.parse(fileContents);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  static async addTransaction(transaction: Omit<Transaction, 'id' | 'timestamp'>): Promise<Transaction> {
    let transactions = await this.getTransactions();
    
    const newTransaction: Transaction = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...transaction,
      timestamp: Date.now()
    };

    transactions.unshift(newTransaction);
    transactions = transactions.slice(0, this.MAX_TRANSACTIONS);
    await fs.writeFile(this.TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));

    return newTransaction;
  }

  static async getDailyStats(): Promise<{ totalOrders: number; totalRevenue: number }> {
    const transactions = await this.getTransactions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = transactions.filter(t => 
      new Date(t.timestamp).getTime() >= today.getTime()
    );

    return {
      totalOrders: todayTransactions.length,
      totalRevenue: todayTransactions.reduce((sum, t) => 
        t.status === 'Completed' ? sum + t.amount : sum, 0)
    };
  }

  static async clearOldTransactions(): Promise<void> {
    try {
      await fs.unlink(this.TRANSACTIONS_FILE);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
