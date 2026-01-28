const prisma = require('../config/db');
const Joi = require('joi');

const expenseSchema = Joi.object({
    type: Joi.string().valid('ADS', 'GOODS', 'PACKAGING', 'TRANSPORT', 'EXTRA').required(),
    amount: Joi.number().positive().required(),
    date: Joi.date().default(Date.now),
    description: Joi.string().optional().allow(''),
    metadata: Joi.object().optional(),
});

exports.createExpense = async (req, res, next) => {
    try {
        const { error, value } = expenseSchema.validate(req.body);
        if (error) {
            const err = new Error(error.details[0].message);
            err.statusCode = 400;
            throw err;
        }

        const expense = await prisma.expense.create({
            data: {
                type: value.type,
                amount: value.amount,
                date: value.date,
                description: value.description,
                metadata: value.metadata || {},
            },
        });

        res.status(201).json({
            success: true,
            data: expense,
        });
    } catch (err) {
        next(err);
    }
};

exports.getExpenses = async (req, res, next) => {
    try {
        const { type, startDate, endDate } = req.query;

        const where = {};
        if (type) where.type = type;
        if (startDate || endDate) {
            where.date = {};
            if (startDate) where.date.gte = new Date(startDate);
            if (endDate) where.date.lte = new Date(endDate);
        }

        const expenses = await prisma.expense.findMany({
            where,
            orderBy: { date: 'desc' },
        });

        res.json({
            success: true,
            count: expenses.length,
            data: expenses,
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteExpense = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.expense.delete({ where: { id: parseInt(id) } });

        res.json({
            success: true,
            message: 'Expense deleted',
        });
    } catch (err) {
        next(err);
    }
};
