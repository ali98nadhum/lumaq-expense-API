const jwt = require('jsonwebtoken');

const authMiddleware = (roles = []) => {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                const error = new Error('Not authenticated');
                error.statusCode = 401;
                throw error;
            }

            const token = authHeader.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
            req.user = decoded;

            // Check roles if specified
            if (roles.length > 0 && !roles.includes(decoded.role)) {
                const error = new Error('Not authorized');
                error.statusCode = 403;
                throw error;
            }

            next();
        } catch (err) {
            if (err.name === 'JsonWebTokenError') {
                err.statusCode = 401;
                err.message = 'Invalid token';
            }
            next(err);
        }
    };
};

module.exports = authMiddleware;
