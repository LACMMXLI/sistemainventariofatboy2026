import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
const email = process.env.SYSTEM_OWNER_EMAIL?.trim().toLowerCase();
const password = process.env.SYSTEM_OWNER_PASSWORD;

if (!connectionString) throw new Error("DATABASE_URL es obligatoria");
if (!email || !password) {
  throw new Error("SYSTEM_OWNER_EMAIL y SYSTEM_OWNER_PASSWORD son obligatorias");
}
const ownerEmail = email;
const ownerPassword = password;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const existingOwner = await prisma.user.findFirst({ where: { role: "SYSTEM_OWNER" } });
  if (existingOwner) {
    await prisma.user.update({
      where: { id: existingOwner.id },
      data: {
        role: "SYSTEM_OWNER",
        locationId: null,
        active: true,
        hiddenFromAdmin: true
      }
    });
  } else {
    await prisma.user.create({
      data: {
        name: "Propietario del sistema",
        email: ownerEmail,
        passwordHash: await hash(ownerPassword, 12),
        role: "SYSTEM_OWNER",
        hiddenFromAdmin: true
      }
    });
  }
}

main().finally(async () => prisma.$disconnect());
