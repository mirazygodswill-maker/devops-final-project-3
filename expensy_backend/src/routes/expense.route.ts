import { Router } from 'express';
import { getExpenses, addExpense, deleteExpense, updateExpense } from '../controllers/expense.controller';
const router = Router();
router.get('/expenses', getExpenses);
router.post('/expenses', addExpense);
router.put('/expenses/:id', updateExpense);
router.delete('/expenses/:id', deleteExpense);
export default router;
