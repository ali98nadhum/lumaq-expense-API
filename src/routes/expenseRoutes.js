const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware()); // Protect all routes

router.post('/', expenseController.createExpense);
router.get('/', expenseController.getExpenses);
router.delete('/:id', authMiddleware(['OWNER']), expenseController.deleteExpense); // Only owner can delete

module.exports = router;
