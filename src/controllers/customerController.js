const prisma = require('../config/db');
const Joi = require('joi');

const customerSchema = Joi.object({
    name: Joi.string().optional().allow(''),
    phone: Joi.string().required(),
    address: Joi.string().optional().allow(''),
    instagram: Joi.string().optional().allow(''),
    tags: Joi.string().optional().allow(''),
});

exports.createCustomer = async (req, res, next) => {
    try {
        const { error, value } = customerSchema.validate(req.body);
        if (error) {
            const err = new Error(error.details[0].message);
            err.statusCode = 400;
            throw err;
        }

        const customer = await prisma.customer.create({
            data: value,
        });

        res.status(201).json({ success: true, data: customer });
    } catch (err) {
        if (err.code === 'P2002') {
            const error = new Error('رقم الهاتف مسجل مسبقاً');
            error.statusCode = 400;
            return next(error);
        }
        next(err);
    }
};

exports.getCustomers = async (req, res, next) => {
    try {
        const { search } = req.query;
        const where = search ? {
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { instagram: { contains: search, mode: 'insensitive' } },
            ],
        } : {};

        const customers = await prisma.customer.findMany({
            where,
            include: { _count: { select: { orders: true } } },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, count: customers.length, data: customers });
    } catch (err) {
        next(err);
    }
};

exports.getCustomerById = async (req, res, next) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: parseInt(req.params.id) },
            include: { orders: { orderBy: { createdAt: 'desc' } } },
        });

        if (!customer) {
            const err = new Error('الزبون غير موجود');
            err.statusCode = 404;
            throw err;
        }

        res.json({ success: true, data: customer });
    } catch (err) {
        next(err);
    }
};

exports.updateCustomer = async (req, res, next) => {
    try {
        const { error, value } = customerSchema.validate(req.body);
        if (error) {
            const err = new Error(error.details[0].message);
            err.statusCode = 400;
            throw err;
        }

        const customer = await prisma.customer.update({
            where: { id: parseInt(req.params.id) },
            data: value,
        });

        res.json({ success: true, data: customer });
    } catch (err) {
        next(err);
    }
};

exports.deleteCustomer = async (req, res, next) => {
    try {
        await prisma.customer.delete({
            where: { id: parseInt(req.params.id) },
        });
        res.json({ success: true, message: 'تم حذف الزبون بنجاح' });
    } catch (err) {
        next(err);
    }
};
exports.transferPoints = async (req, res, next) => {
    try {
        const { senderId, recipientId, points } = req.body;

        if (!senderId || !recipientId || !points || points <= 0) {
            const err = new Error('بيانات التحويل غير مكتملة');
            err.statusCode = 400;
            throw err;
        }

        if (senderId === recipientId) {
            const err = new Error('لا يمكن تحويل النقاط لنفس الحساب');
            err.statusCode = 400;
            throw err;
        }

        const result = await prisma.$transaction(async (tx) => {
            const sender = await tx.customer.findUnique({ where: { id: parseInt(senderId) } });
            if (!sender || sender.points < points) {
                throw new Error('رصيد النقاط غير كافٍ للتحويل');
            }

            const recipient = await tx.customer.findUnique({ where: { id: parseInt(recipientId) } });
            if (!recipient) {
                throw new Error('الزبون المستلم غير موجود');
            }

            const updatedSender = await tx.customer.update({
                where: { id: parseInt(senderId) },
                data: { points: { decrement: parseInt(points) } }
            });

            const updatedRecipient = await tx.customer.update({
                where: { id: parseInt(recipientId) },
                data: { points: { increment: parseInt(points) } }
            });

            return { updatedSender, updatedRecipient };
        });

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getInactiveCustomers = async (req, res, next) => {
    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        // Find customers whose last order was more than 60 days ago
        // or customers who have no orders but were created more than 60 days ago
        const customers = await prisma.customer.findMany({
            where: {
                OR: [
                    {
                        orders: {
                            none: {}
                        },
                        createdAt: {
                            lt: sixtyDaysAgo
                        }
                    },
                    {
                        orders: {
                            every: {
                                createdAt: {
                                    lt: sixtyDaysAgo
                                }
                            },
                        },
                        // Ensure they have at least one order if we are checking "every"
                        NOT: {
                            orders: {
                                none: {}
                            }
                        }
                    }
                ]
            },
            include: {
                _count: { select: { orders: true } },
                orders: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, count: customers.length, data: customers });
    } catch (err) {
        next(err);
    }
};
