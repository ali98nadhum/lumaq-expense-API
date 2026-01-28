const prisma = require('../config/db');

exports.getDashboardStats = async (req, res, next) => {
    try {
        const now = new Date();
        const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
        const startOfWeek = new Date(new Date().setDate(now.getDate() - 7));

        // Calendar Month Logic: Start of current month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const getStatsForRange = async (startDate, endDate = null) => {
            const dateFilter = { createdAt: { gte: startDate } };
            const expenseDateFilter = { date: { gte: startDate } };

            if (endDate) {
                dateFilter.createdAt.lte = endDate;
                expenseDateFilter.date.lte = endDate;
            }

            // 1. Orders Stats
            const orders = await prisma.order.findMany({
                where: {
                    ...dateFilter,
                    status: { not: 'CANCELLED' }
                }
            });

            const completedOrders = orders.filter(o => o.status === 'COMPLETED');
            const orderCount = orders.length;
            const revenue = completedOrders.reduce((acc, o) => acc + Number(o.totalSellingPrice), 0);
            const profit = completedOrders.reduce((acc, o) => acc + Number(o.totalProfit), 0);
            const capital = completedOrders.reduce((acc, o) => acc + Number(o.totalCost), 0);

            // 2. Expenses Stats
            const expenses = await prisma.expense.findMany({
                where: expenseDateFilter
            });
            const totalExpenses = expenses.reduce((acc, e) => acc + Number(e.amount), 0);

            return {
                orderCount,
                revenue,
                profit,
                capital,
                expenses: totalExpenses,
            };
        };

        const today = await getStatsForRange(startOfToday);
        const weekly = await getStatsForRange(startOfWeek);
        const monthly = await getStatsForRange(startOfMonth);

        // Overall Totals
        const overallOrders = await prisma.order.aggregate({
            _sum: { totalProfit: true, totalCost: true },
            _count: { id: true },
            where: { status: 'COMPLETED' }
        });

        res.json({
            success: true,
            data: {
                today,
                weekly,
                monthly,
                totals: {
                    totalProfit: Number(overallOrders._sum.totalProfit || 0),
                    totalCapital: Number(overallOrders._sum.totalCost || 0),
                    totalOrders: overallOrders._count.id
                }
            },
        });
    } catch (err) {
        next(err);
    }
};

exports.getYearlyStats = async (req, res, next) => {
    try {
        const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
        const monthlyStats = [];

        for (let m = 0; m < 12; m++) {
            const startDate = new Date(year, m, 1);
            const endDate = new Date(year, m + 1, 0, 23, 59, 59);

            const orders = await prisma.order.findMany({
                where: {
                    createdAt: { gte: startDate, lte: endDate },
                    status: { not: 'CANCELLED' }
                }
            });

            const completedOrders = orders.filter(o => o.status === 'COMPLETED');
            const expenses = await prisma.expense.findMany({
                where: { date: { gte: startDate, lte: endDate } }
            });

            monthlyStats.push({
                month: m + 1,
                monthName: startDate.toLocaleString('ar', { month: 'long' }),
                enMonthName: startDate.toLocaleString('en-US', { month: 'long' }),
                orderCount: orders.length,
                revenue: completedOrders.reduce((acc, o) => acc + Number(o.totalSellingPrice), 0),
                profit: completedOrders.reduce((acc, o) => acc + Number(o.totalProfit), 0),
                capital: completedOrders.reduce((acc, o) => acc + Number(o.totalCost), 0),
                expenses: expenses.reduce((acc, e) => acc + Number(e.amount), 0)
            });
        }

        res.json({
            success: true,
            data: monthlyStats
        });
    } catch (err) {
        next(err);
    }
};

exports.getProductPerformance = async (req, res, next) => {
    try {
        const { period } = req.query;
        let dateFilter = {};

        if (period === 'today') {
            dateFilter = { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } };
        } else if (period === 'week') {
            dateFilter = { createdAt: { gte: new Date(new Date().setDate(new Date().getDate() - 7)) } };
        } else if (period === 'month') {
            dateFilter = { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } };
        }

        const items = await prisma.orderItem.groupBy({
            where: {
                order: {
                    status: 'COMPLETED',
                    ...dateFilter
                }
            },
            by: ['productName'],
            _sum: {
                quantity: true,
            },
            orderBy: {
                _sum: {
                    quantity: 'desc',
                },
            },
            take: 10,
        });

        res.json({
            success: true,
            data: items,
        });
    } catch (err) {
        next(err);
    }
};

exports.getMarketingROI = async (req, res, next) => {
    try {
        const stats = await prisma.order.groupBy({
            where: { status: 'COMPLETED' },
            by: ['orderSource'],
            _sum: {
                totalSellingPrice: true,
                totalProfit: true
            },
            _count: {
                id: true
            }
        });

        res.json({
            success: true,
            data: stats.map(s => ({
                source: s.orderSource || 'غير محدد',
                orderCount: s._count.id,
                revenue: Number(s._sum.totalSellingPrice || 0),
                profit: Number(s._sum.totalProfit || 0)
            }))
        });
    } catch (err) {
        next(err);
    }
};

exports.getExpenseBreakdown = async (req, res, next) => {
    try {
        const expenses = await prisma.expense.findMany({
            orderBy: { date: 'desc' }
        });

        // Group by month
        const grouped = expenses.reduce((acc, exp) => {
            const date = new Date(exp.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthName = date.toLocaleString('ar', { month: 'long', year: 'numeric' });

            if (!acc[monthKey]) {
                acc[monthKey] = {
                    monthKey,
                    monthName,
                    breakdown: {}
                };
            }

            if (!acc[monthKey].breakdown[exp.type]) {
                acc[monthKey].breakdown[exp.type] = 0;
            }
            acc[monthKey].breakdown[exp.type] += Number(exp.amount);

            return acc;
        }, {});

        // Convert to array and format for frontend
        const result = Object.values(grouped).map(m => ({
            ...m,
            total: Object.values(m.breakdown).reduce((sum, val) => sum + val, 0),
            breakdown: Object.entries(m.breakdown).map(([type, total]) => ({
                type,
                total: Number(total)
            }))
        })).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};
