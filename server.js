const app = require('./src/app');
const prisma = require('./src/config/db');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Check DB connection
        await prisma.$connect();
        console.log('Connected to Database');

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
}

startServer();
