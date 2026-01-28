const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware());

router.post('/', packageController.createPackage);
router.get('/', packageController.getPackages);
router.delete('/:id', packageController.deletePackage);

module.exports = router;
