import { Request, Response } from 'express';
import { ExpenseService } from '../services/expense.service';
const expenseService = new ExpenseService();

export const getExpenses = async (req: Request, res: Response) => {
  try {
    const expenses = await expenseService.getAllExpenses();
    res.status(200).json(expenses);
  } catch (error) {
    console.error('Failed to fetch expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
};

export const addExpense = async (req: Request, res: Response) => {
  try {
    const { name, amount, category } = req.body;
    const expense = await expenseService.createExpense({ name, amount, category });
    res.status(201).json(expense);
  } catch (error) {
    console.error('Failed to create expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await expenseService.deleteExpense(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.status(200).json({ message: 'Expense deleted', expense: deleted });
  } catch (error) {
    console.error('Failed to delete expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, amount, category } = req.body;
    const updated = await expenseService.updateExpense(id, { name, amount, category });
    if (!updated) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error('Failed to update expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
};
