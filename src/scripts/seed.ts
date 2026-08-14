import { trackedProducts } from "../../data/tracked-products";
import { prisma } from "../lib/db";

async function main() {
  for (const product of trackedProducts) {
    const existing = await prisma.product.findFirst({ where: { name: product.name } });
    const dbProduct = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: {
            category: product.category,
            subcategory: product.subcategory,
            unit: product.unit,
          },
        })
      : await prisma.product.create({
          data: {
            name: product.name,
            category: product.category,
            subcategory: product.subcategory,
            unit: product.unit,
          },
        });

    for (const listing of product.listings) {
      await prisma.storeListing.upsert({
        where: {
          store_storeProductId: {
            store: listing.store,
            storeProductId: listing.storeProductId,
          },
        },
        update: {
          url: listing.url,
          packageSize: listing.packageSize,
          productId: dbProduct.id,
        },
        create: {
          store: listing.store,
          storeProductId: listing.storeProductId,
          url: listing.url,
          packageSize: listing.packageSize,
          productId: dbProduct.id,
        },
      });
    }

    console.log(`Seeded "${product.name}" with ${product.listings.length} listings`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
