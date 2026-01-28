const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware(['OWNER', 'ADMIN']));

router.get('/dashboard', reportController.getDashboardStats);
router.get('/performance', reportController.getProductPerformance);
router.get('/yearly', reportController.getYearlyStats);
router.get('/roi', reportController.getMarketingROI);
router.get('/expenses/breakdown', reportController.getExpenseBreakdown);

module.exports = router;
