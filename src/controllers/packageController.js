const prisma = require('../config/db');
const Joi = require('joi');

const packageSchema = Joi.object({
    name: Joi.string().required(),
    sellingPrice: Joi.number().min(0).required(),
    items: Joi.array().items(
        Joi.object({
            productId: Joi.number().required(),
            quantity: Joi.number().integer().min(1).required(),
        })
    ).required().min(1),
});

exports.createPackage = async (req, res, next) => {
    try {
        const { error, value } = packageSchema.validate(req.body);
        if (error) {
            const err = new Error(error.details[0].message);
            err.statusCode = 400;
            throw err;
        }

        const { name, sellingPrice, items } = value;

        // Verify products exist
        const productIds = items.map(item => item.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
        });

        if (products.length !== productIds.length) {
            const err = new Error('Some products in the package do not exist');
            err.statusCode = 400;
            throw err;
        }

        const newPackage = await prisma.package.create({
            data: {
                name,
                sellingPrice,
                items: {
                    create: items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                    })),
                },
            },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });

        res.status(201).json({ success: true, data: newPackage });
    } catch (err) {
        next(err);
    }
};

exports.getPackages = async (req, res, next) => {
    try {
        const packages = await prisma.package.findMany({
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, data: packages });
    } catch (err) {
        next(err);
    }
};

exports.deletePackage = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if package is used in any orders? 
        // For now, we allow deletion, but Prisma might complain if there are constraints. 
        // Usually, we should check or cascade properly. The schema doesn't have cascade delete on OrderItems->Package relation by default unless specified.

        await prisma.packageItem.deleteMany({
            where: { packageId: parseInt(id) },
        });

        await prisma.package.delete({
            where: { id: parseInt(id) },
        });

        res.json({ success: true, message: 'Package deleted successfully' });
    } catch (err) {
        next(err);
    }
};
