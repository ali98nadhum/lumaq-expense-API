const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = require('../src/config/db');

async function main() {
    // Create Owner
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const owner = await prisma.user.upsert({
        where: { username: 'owner' },
        update: {},
        create: {
            username: 'owner',
            password: hashedPassword,
            role: 'OWNER',
        },
    });

    console.log({ owner });

    // Create initial product for testing
    const product = await prisma.product.create({
        data: {
            name: 'Lipstick Matte Red',
            costPrice: 5.00,
            sellingPrice: 15.00,
            supplier: 'BeautySupply Co',
        }
    });

    console.log({ product });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
