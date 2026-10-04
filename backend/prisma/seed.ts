import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const communities = [
  // Arochukwu
  { name: "Obinkita", slug: "obinkita", lga: "Arochukwu", ward: "Obinkita", state: "Abia" },
  { name: "Arochukwu", slug: "arochukwu", lga: "Arochukwu", state: "Abia" },
  { name: "Ihechiowa", slug: "ihechiowa", lga: "Arochukwu", state: "Abia" },
  { name: "Ututu", slug: "ututu", lga: "Arochukwu", state: "Abia" },
  // Umuahia
  { name: "Umuahia", slug: "umuahia", lga: "Umuahia North", state: "Abia" },
  { name: "Umuahia South", slug: "umuahia-south", lga: "Umuahia South", state: "Abia" },
  { name: "Ibeku", slug: "ibeku", lga: "Umuahia North", state: "Abia" },
  // Bende
  { name: "Bende", slug: "bende", lga: "Bende", state: "Abia" },
  { name: "Item", slug: "item", lga: "Bende", state: "Abia" },
  { name: "Uzuakoli", slug: "uzuakoli", lga: "Bende", state: "Abia" },
  { name: "Ozuitem", slug: "ozuitem", lga: "Bende", state: "Abia" },
  // Ohafia
  { name: "Ohafia", slug: "ohafia", lga: "Ohafia", state: "Abia" },
  { name: "Abiriba", slug: "abiriba", lga: "Ohafia", state: "Abia" },
  // Aba
  { name: "Aba", slug: "aba", lga: "Aba South", state: "Abia" },
  { name: "Aba North", slug: "aba-north", lga: "Aba North", state: "Abia" },
  { name: "Osisioma", slug: "osisioma", lga: "Osisioma Ngwa", state: "Abia" },
  // Others
  { name: "Isuikwuato", slug: "isuikwuato", lga: "Isuikwuato", state: "Abia" },
  { name: "Umunneochi", slug: "umunneochi", lga: "Umunneochi", state: "Abia" },
  { name: "Isiala Ngwa North", slug: "isiala-ngwa-north", lga: "Isiala Ngwa North", state: "Abia" },
  { name: "Isiala Ngwa South", slug: "isiala-ngwa-south", lga: "Isiala Ngwa South", state: "Abia" },
  { name: "Ukwa East", slug: "ukwa-east", lga: "Ukwa East", state: "Abia" },
  { name: "Ukwa West", slug: "ukwa-west", lga: "Ukwa West", state: "Abia" },
  { name: "Ikwuano", slug: "ikwuano", lga: "Ikwuano", state: "Abia" },
  { name: "Obingwa", slug: "obingwa", lga: "Obingwa", state: "Abia" },
  { name: "Ugwunagbo", slug: "ugwunagbo", lga: "Ugwunagbo", state: "Abia" },
];

async function main() {
  const password = await bcrypt.hash("admin123456", 12);

  await prisma.user.upsert({
    where: { email: "admin@aphring.com" },
    update: { role: "ADMIN", password },
    create: {
      name: "Aphring Admin",
      email: "admin@aphring.com",
      password,
      role: "ADMIN",
      reputation: 100,
    },
  });

  console.log("Admin: admin@aphring.com / admin123456");

  for (const c of communities) {
    await prisma.community.upsert({
      where: { slug: c.slug },
      update: c,
      create: c,
    });
  }

  console.log(`Seeded ${communities.length} Abia communities (Phase 2)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
