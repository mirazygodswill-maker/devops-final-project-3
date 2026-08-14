import Expense from '../models/expense.model';
import redis from '../config/redis';

export class ExpenseService {
  async getAllExpenses() {
    const cachedExpenses = await redis.get('expenses');
    if (cachedExpenses) {
        console.log('Cache hit');
      return JSON.parse(cachedExpenses);
    }
    const expenses = await Expense.find();
    await redis.set('expenses', JSON.stringify(expenses), 'EX', 60 * 5); // Cache for 5 minutes
    return expenses;
  }

  async createExpense(expense: { name: string, amount: number, category: string }) {
    const newExpense = await Expense.create(expense);
    await redis.del('expenses'); // Clear the cache
    return newExpense;
  }

  async deleteExpense(id: string) {
    const deleted = await Expense.findByIdAndDelete(id);
    await redis.del('expenses'); // Clear the cache
    return deleted;
  }

  async updateExpense(id: string, updates: { name?: string, amount?: number, category?: string }) {
    const updated = await Expense.findByIdAndUpdate(id, updates, { new: true });
    await redis.del('expenses'); // Clear the cache
    return updated;
  }
}
