import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL es obligatoria");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedUser(input: {
  name: string;
  email?: string;
  password?: string;
  role: "SYSTEM_OWNER" | "ADMIN" | "MANAGER" | "DRIVER";
  locationId?: string;
  hiddenFromAdmin?: boolean;
}) {
  if (!input.email || !input.password) return null;
  return prisma.user.upsert({
    where: { email: input.email.toLowerCase() },
    update: {
      name: input.name,
      role: input.role,
      locationId: input.locationId,
      active: true,
      hiddenFromAdmin: input.hiddenFromAdmin ?? false
    },
    create: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hash(input.password, 12),
      role: input.role,
      locationId: input.locationId,
      hiddenFromAdmin: input.hiddenFromAdmin ?? false
    }
  });
}

async function main() {
  const locationData = [
    { name: "Venecia", code: "V", type: "BRANCH" as const },
    { name: "San Marcos", code: "SM", type: "BRANCH" as const },
    { name: "Américas", code: "AM", type: "BRANCH" as const }
  ];
  const locations = [];
  for (const item of locationData) {
    locations.push(
      await prisma.location.upsert({
        where: { code: item.code },
        update: { name: item.name, active: true },
        create: item
      })
    );
  }

  const units = new Map<string, string>();
  for (const item of [
    { name: "pieza", symbol: "pieza", allowDecimals: false, decimalPlaces: 0 },
    { name: "kilogramo", symbol: "kg", allowDecimals: true, decimalPlaces: 2 },
    { name: "caja", symbol: "caja", allowDecimals: true, decimalPlaces: 2 },
    { name: "paquete", symbol: "paquete", allowDecimals: false, decimalPlaces: 0 },
    { name: "bote", symbol: "bote", allowDecimals: false, decimalPlaces: 0 },
    { name: "litro", symbol: "litro", allowDecimals: true, decimalPlaces: 2 },
    { name: "costal", symbol: "costal", allowDecimals: true, decimalPlaces: 2 }
  ]) {
    const unit = await prisma.unit.upsert({
      where: { name: item.name },
      update: item,
      create: item
    });
    units.set(item.name, unit.id);
  }

  const categories = new Map<string, string>();
  for (const [index, name] of [
    "Verduras",
    "Proteínas",
    "Panadería",
    "Salsas y aderezos",
    "Desechables",
    "Bebidas"
  ].entries()) {
    const category = await prisma.category.upsert({
      where: { name },
      update: { sortOrder: index, active: true },
      create: { name, sortOrder: index }
    });
    categories.set(name, category.id);
  }

  const products = [];
  const productImages: Record<string, string> = {
    "Tomate saladet": "/products/tomate-saladet.png",
    Aguacate: "/products/aguacate.png",
    "Pan hamburguesa": "/products/pan-hamburguesa.png",
    "Carne hamburguesa": "/products/carne-hamburguesa.png",
    Mayonesa: "/products/mayonesa.png",
    Papa: "/products/papa.png",
    "Aceite vegetal": "/products/aceite-vegetal.png",
    Catsup: "/products/catsup.png"
  };
  for (const item of [
    ["Tomate saladet", "Verduras", "caja"],
    ["Aguacate", "Verduras", "kilogramo"],
    ["Pan hamburguesa", "Panadería", "paquete"],
    ["Carne hamburguesa", "Proteínas", "pieza"],
    ["Mayonesa", "Salsas y aderezos", "bote"],
    ["Papa", "Verduras", "costal"],
    ["Aceite vegetal", "Salsas y aderezos", "litro"],
    ["Catsup", "Salsas y aderezos", "bote"]
  ] as const) {
    const [name, category, unit] = item;
    const normalizedName = name.toLocaleLowerCase("es-MX");
    products.push(
      await prisma.product.upsert({
        where: { normalizedName },
        update: { active: true, imageUrl: productImages[name] },
        create: {
          name,
          normalizedName,
          categoryId: categories.get(category)!,
          unitId: units.get(unit)!,
          imageUrl: productImages[name]
        }
      })
    );
  }

  for (const location of locations) {
    for (const [sortOrder, product] of products.entries()) {
      await prisma.locationProduct.upsert({
        where: { locationId_productId: { locationId: location.id, productId: product.id } },
        update: { active: true, sortOrder },
        create: { locationId: location.id, productId: product.id, sortOrder }
      });
    }
  }

  const admin = await seedUser({
    name: "Administrador FATBOY",
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    role: "ADMIN"
  });
  await seedUser({
    name: "Encargado Venecia",
    email: process.env.SEED_MANAGER_EMAIL,
    password: process.env.SEED_MANAGER_PASSWORD,
    role: "MANAGER",
    locationId: locations[0].id
  });
  await seedUser({
    name: "Repartidor FATBOY",
    email: process.env.SEED_DRIVER_EMAIL,
    password: process.env.SEED_DRIVER_PASSWORD,
    role: "DRIVER"
  });
  await seedUser({
    name: "Propietario del sistema",
    email: process.env.SYSTEM_OWNER_EMAIL,
    password: process.env.SYSTEM_OWNER_PASSWORD,
    role: "SYSTEM_OWNER",
    hiddenFromAdmin: true
  });

  if (admin) {
    await prisma.$transaction(async (tx) => {
      for (const location of locations) {
        for (const product of products) {
          const referenceLineId = `seed:${location.code}:${product.id}`;
          const exists = await tx.inventoryMovement.findUnique({
            where: { type_referenceLineId: { type: "INITIAL_STOCK", referenceLineId } }
          });
          if (exists) continue;
          const balance = await tx.inventoryBalance.upsert({
            where: { locationId_productId: { locationId: location.id, productId: product.id } },
            create: { locationId: location.id, productId: product.id, quantity: 0 },
            update: {}
          });
          const after = balance.quantity.add(10);
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { quantity: after, version: { increment: 1 } }
          });
          await tx.inventoryMovement.create({
            data: {
              locationId: location.id,
              productId: product.id,
              type: "INITIAL_STOCK",
              quantityDelta: 10,
              balanceBefore: balance.quantity,
              balanceAfter: after,
              referenceType: "Seed",
              referenceId: "initial",
              referenceLineId,
              performedByUserId: admin.id
            }
          });
        }
      }
    });
  }
}

main()
  .finally(async () => prisma.$disconnect());
