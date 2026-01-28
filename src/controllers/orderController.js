const prisma = require('../config/db');
const Joi = require('joi');

const orderSchema = Joi.object({
    customerName: Joi.string().optional().allow(''),
    items: Joi.array().items(
        Joi.object({
            productId: Joi.number().optional(),
            packageId: Joi.number().optional(),
            quantity: Joi.number().integer().min(1).required(),
            isFree: Joi.boolean().default(false),
        }).xor('productId', 'packageId') // Must have either productId or packageId, but not both
    ).required().min(1),
    packagingCost: Joi.number().min(0).default(0),
    deliveryCost: Joi.number().min(0).default(0),
    deliveryPaidBy: Joi.string().valid('CUSTOMER', 'SHOP').default('CUSTOMER'),
    discount: Joi.number().min(0).default(0),
    discountType: Joi.string().valid('AMOUNT', 'PERCENTAGE').default('AMOUNT'),
    customerId: Joi.number().optional().allow(null),
    redeemedPoints: Joi.number().integer().min(0).default(0),
    orderSource: Joi.string().optional().allow(''),
});

exports.createOrder = async (req, res, next) => {
    try {
        const { error, value } = orderSchema.validate(req.body);
        if (error) {
            const err = new Error(error.details[0].message);
            err.statusCode = 400;
            throw err;
        }

        const { items, customerName, packagingCost, deliveryCost, deliveryPaidBy, discount, discountType, customerId, redeemedPoints, orderSource } = value;

        // 1. Fetch products and packages
        const productIds = items.filter(i => i.productId).map(i => i.productId);
        const packageIds = items.filter(i => i.packageId).map(i => i.packageId);

        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
        });

        const packages = await prisma.package.findMany({
            where: { id: { in: packageIds } },
            include: {
                items: {
                    include: { product: true }
                }
            }
        });

        const productMap = {};
        products.forEach(p => { productMap[p.id] = p; });

        const packageMap = {};
        packages.forEach(p => { packageMap[p.id] = p; });

        // 2. Build Order Items and Calculate Totals
        let totalProductBaseCost = 0;
        let totalSellingPrice = 0;
        const orderItemsData = [];
        const stockUpdates = []; // To track stock decrements

        for (const item of items) {
            let name, costPrice, sellingPrice, finalSellingPrice;

            if (item.productId) {
                const product = productMap[item.productId];
                if (!product) {
                    const err = new Error(`Product with ID ${item.productId} not found`);
                    err.statusCode = 404;
                    throw err;
                }

                if (product.stock < item.quantity) {
                    const err = new Error(`Stock insufficient for ${product.name}. Available: ${product.stock}`);
                    err.statusCode = 400;
                    throw err;
                }

                name = product.name;
                costPrice = Number(product.costPrice);
                sellingPrice = Number(product.sellingPrice);

                // Add to stock updates
                stockUpdates.push({ productId: product.id, quantity: item.quantity });

            } else if (item.packageId) {
                const pkg = packageMap[item.packageId];
                if (!pkg) {
                    const err = new Error(`Package with ID ${item.packageId} not found`);
                    err.statusCode = 404;
                    throw err;
                }

                // Check stock for all items in package
                // A package might contain multiple products. We need to check if enough stock exists for (package quantity * item quantity in package)
                for (const pkgItem of pkg.items) {
                    const requiredQty = pkgItem.quantity * item.quantity;
                    if (pkgItem.product.stock < requiredQty) {
                        const err = new Error(`Stock insufficient for package ${pkg.name} (Product: ${pkgItem.product.name}). Required: ${requiredQty}, Available: ${pkgItem.product.stock}`);
                        err.statusCode = 400;
                        throw err;
                    }
                    // Add to stock updates
                    stockUpdates.push({ productId: pkgItem.productId, quantity: requiredQty });
                }

                name = pkg.name;
                // Cost of package is sum of cost of its items
                costPrice = pkg.items.reduce((sum, pItem) => sum + (Number(pItem.product.costPrice) * pItem.quantity), 0);
                sellingPrice = Number(pkg.sellingPrice);
            }

            // Handle Free Item Logic
            if (item.isFree) {
                finalSellingPrice = 0;
            } else {
                finalSellingPrice = sellingPrice;
            }

            const lineCost = costPrice * item.quantity;
            const lineSelling = finalSellingPrice * item.quantity;

            totalProductBaseCost += lineCost;
            totalSellingPrice += lineSelling;

            orderItemsData.push({
                productName: name,
                quantity: item.quantity,
                costPrice: costPrice,
                sellingPrice: finalSellingPrice,
                productId: item.productId || null,
                packageId: item.packageId || null,
                isFree: item.isFree
            });
        }

        // Financial Logic
        let calculatedDiscount = 0;
        if (discountType === 'PERCENTAGE') {
            calculatedDiscount = totalSellingPrice * (discount / 100);
        } else {
            calculatedDiscount = discount;
        }

        const costsToDeduct = totalProductBaseCost + packagingCost + (deliveryPaidBy === 'SHOP' ? deliveryCost : 0);
        const totalProfit = (totalSellingPrice - calculatedDiscount) - costsToDeduct;

        const totalCostRecord = totalProductBaseCost + packagingCost + (deliveryPaidBy === 'SHOP' ? deliveryCost : 0);

        // 3. Create Transaction
        const order = await prisma.$transaction(async (tx) => {
            // Deduct Points
            if (customerId && redeemedPoints > 0) {
                const customer = await tx.customer.findUnique({ where: { id: customerId } });
                if (!customer || customer.points < redeemedPoints) {
                    throw new Error('Customer does not have enough points');
                }
                await tx.customer.update({
                    where: { id: customerId },
                    data: { points: { decrement: redeemedPoints } }
                });
            }

            // Decrement Stock
            // Aggregate stock updates by productId to avoid multiple updates to same row if product is in multiple packages
            const aggregatedStock = {};
            for (const update of stockUpdates) {
                if (aggregatedStock[update.productId]) {
                    aggregatedStock[update.productId] += update.quantity;
                } else {
                    aggregatedStock[update.productId] = update.quantity;
                }
            }

            for (const [pid, qty] of Object.entries(aggregatedStock)) {
                await tx.product.update({
                    where: { id: parseInt(pid) },
                    data: { stock: { decrement: qty } }
                });
            }

            const newOrder = await tx.order.create({
                data: {
                    customerName,
                    totalSellingPrice,
                    totalCost: totalCostRecord,
                    totalProfit,
                    packagingCost,
                    deliveryCost,
                    deliveryPaidBy,
                    discount: calculatedDiscount,
                    discountType,
                    customerId,
                    redeemedPoints,
                    orderSource,
                    status: 'NEW',
                    items: {
                        create: orderItemsData,
                    },
                },
                include: {
                    items: true,
                },
            });

            return newOrder;
        });

        res.status(201).json({
            success: true,
            data: order,
        });
    } catch (err) {
        next(err);
    }
};

exports.getOrders = async (req, res, next) => {
    try {
        const { status, startDate, endDate } = req.query;
        const where = {};

        if (status) where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const orders = await prisma.order.findMany({
            where,
            include: { items: true, customer: true },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            success: true,
            count: orders.length,
            data: orders,
        });
    } catch (err) {
        next(err);
    }
};

exports.updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status: newStatus } = req.body;

        // Validate status
        const validStatuses = ['NEW', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'RETURNED'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error('Invalid status');
        }

        const oldOrder = await prisma.order.findUnique({
            where: { id: parseInt(id) },
            include: { items: true }
        });

        if (!oldOrder) {
            const err = new Error('Order not found');
            err.statusCode = 404;
            throw err;
        }

        const oldStatus = oldOrder.status;

        // If no status change, just return
        if (oldStatus === newStatus) {
            return res.json({ success: true, data: oldOrder });
        }

        // Logic for Stock Adjustments:
        // Stock-out statuses: NEW, SHIPPED, COMPLETED
        // Stock-in statuses: CANCELLED, RETURNED

        const isStockIn = (s) => s === 'CANCELLED' || s === 'RETURNED';
        const isStockOut = (s) => !isStockIn(s);

        const updatedOrder = await prisma.$transaction(async (tx) => {
            // Case 1: Moving from Stock-Out to Stock-In (e.g. SHIPPED -> RETURNED)
            // ACTION: Increment Stock
            if (isStockOut(oldStatus) && isStockIn(newStatus)) {
                for (const item of oldOrder.items) {
                    if (item.productId) {
                        await tx.product.update({
                            where: { id: item.productId },
                            data: { stock: { increment: item.quantity } }
                        });
                    }
                }
            }
            // Case 2: Moving from Stock-In to Stock-Out (e.g. CANCELLED -> NEW)
            // ACTION: Decrement Stock (Re-take stock)
            else if (isStockIn(oldStatus) && isStockOut(newStatus)) {
                for (const item of oldOrder.items) {
                    if (item.productId) {
                        // Check if enough stock exists? 
                        // For simplicity, we just decrement. In a real system we'd check availability.
                        await tx.product.update({
                            where: { id: item.productId },
                            data: { stock: { decrement: item.quantity } }
                        });
                    }
                }
            }

            const orderUpdate = await tx.order.update({
                where: { id: parseInt(id) },
                data: {
                    status: newStatus,
                    completedAt: newStatus === 'COMPLETED' ? new Date() : undefined
                },
            });

            // Loyalty Points Logic
            if (oldOrder.customerId) {
                const amountForPoints = Number(oldOrder.totalSellingPrice) - Number(oldOrder.discount);
                const pointsValue = Math.floor(amountForPoints / 1000) * 10;

                if (pointsValue > 0) {
                    // Award points if moving to COMPLETED
                    if (oldStatus !== 'COMPLETED' && newStatus === 'COMPLETED') {
                        await tx.customer.update({
                            where: { id: oldOrder.customerId },
                            data: { points: { increment: pointsValue } }
                        });
                    }
                    // Reverse points if moving away from COMPLETED (e.g. to RETURNED/CANCELLED)
                    else if (oldStatus === 'COMPLETED' && newStatus !== 'COMPLETED') {
                        await tx.customer.update({
                            where: { id: oldOrder.customerId },
                            data: { points: { decrement: pointsValue } }
                        });
                    }
                }
            }

            // Refund Redeemed Points if order is CANCELLED or RETURNED
            if (oldOrder.customerId && oldOrder.redeemedPoints > 0) {
                if (!isStockIn(oldStatus) && isStockIn(newStatus)) {
                    // Moving to CANCELLED/RETURNED from a non-cancelled state
                    await tx.customer.update({
                        where: { id: oldOrder.customerId },
                        data: { points: { increment: oldOrder.redeemedPoints } }
                    });
                } else if (isStockIn(oldStatus) && !isStockIn(newStatus)) {
                    // Moving back to active state from CANCELLED/RETURNED
                    await tx.customer.update({
                        where: { id: oldOrder.customerId },
                        data: { points: { decrement: oldOrder.redeemedPoints } }
                    });
                }
            }

            return orderUpdate;
        });

        res.json({ success: true, data: updatedOrder });
    } catch (err) {
        next(err);
    }
};
