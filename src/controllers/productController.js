const prisma = require('../config/db');
const Joi = require('joi');

const productSchema = Joi.object({
    id: Joi.any(),
    name: Joi.string().required(),
    costPrice: Joi.number().min(0).required(),
    sellingPrice: Joi.number().min(0).required(),
    oldPrice: Joi.number().min(0).allow(null, '').optional(),
    supplier: Joi.string().allow('').optional(),
    stock: Joi.number().integer().min(0).default(0),
    expiryDate: Joi.date().allow(null, '').optional(),
    barcode: Joi.string().allow(null, '').optional(),
    lowStockThreshold: Joi.number().integer().min(1).default(5),
});

exports.createProduct = async (req, res, next) => {
    try {
        const { error, value } = productSchema.validate(req.body);
        if (error) {
            const err = new Error(error.details[0].message);
            err.statusCode = 400;
            throw err;
        }

        const { id, ...createData } = value;
        if (createData.expiryDate === '') createData.expiryDate = null;
        if (createData.barcode === '') createData.barcode = null;

        const product = await prisma.product.create({
            data: createData,
        });

        res.status(201).json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

exports.getProducts = async (req, res, next) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: products });
    } catch (err) {
        next(err);
    }
};

exports.updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error, value } = productSchema.validate(req.body);
        if (error) {
            throw new Error(error.details[0].message);
        }

        const { id: _, ...updateData } = value;
        if (updateData.expiryDate === '') updateData.expiryDate = null;
        if (updateData.barcode === '') updateData.barcode = null;

        const product = await prisma.product.update({
            where: { id: parseInt(id) },
            data: updateData,
        });

        res.json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};
