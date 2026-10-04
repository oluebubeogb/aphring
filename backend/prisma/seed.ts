import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const communities = [
  { name: "Obinkita", slug: "obinkita", lga: "Arochukwu", state: "Abia" },
  { name: "Arochukwu", slug: "arochukwu", lga: "Arochukwu", state: "Abia" },
  { name: "Umuahia", slug: "umuahia", lga: "Umuahia North", state: "Abia" },
  { name: "Bende", slug: "bende", lga: "Bende", state: "Abia" },
  { name: "Ohafia", slug: "ohafia", lga: "Ohafia", state: "Abia" },
  { name: "Aba", slug: "aba", lga: "Aba South", state: "Abia" },
  { name: "Isuikwuato", slug: "isuikwuato", lga: "Isuikwuato", state: "Abia" },
  { name: "Item", slug: "item", lga: "Bende", state: "Abia" },
];

async function main() {
  const password = await bcrypt.hash("admin123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@aphring.com" },
    update: {},
    create: {
      name: "Aphring Admin",
      email: "admin@aphring.com",
      password,
      role: "ADMIN",
    },
  });

  console.log("Admin created:", admin.email);

  for (const c of communities) {
    await prisma.community.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }

  console.log(`Seeded ${communities.length} communities`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
