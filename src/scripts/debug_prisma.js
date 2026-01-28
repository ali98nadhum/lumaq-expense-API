
const { Prisma } = require('@prisma/client');

async function main() {
    try {
        console.log('Checking Prism Client DMMF...');
        const dmmf = Prisma.dmmf;
        if (!dmmf) {
            console.error('FAILURE: Could not access Prisma.dmmf');
            return;
        }

        const productModel = dmmf.datamodel.models.find(m => m.name === 'Product');
        if (!productModel) {
            console.error('FAILURE: Product model not found in DMMF');
            return;
        }

        const oldPriceField = productModel.fields.find(f => f.name === 'oldPrice');

        if (oldPriceField) {
            console.log('SUCCESS: oldPrice field found in Prisma Client DMMF.');
            // console.log(JSON.stringify(oldPriceField, null, 2));
        } else {
            console.error('FAILURE: oldPrice field NOT found in Prisma Client DMMF.');
            console.log('Available fields:', productModel.fields.map(f => f.name).join(', '));
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

main();
