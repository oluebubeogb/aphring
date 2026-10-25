/**
 * Seed: internal catalog only.
 * - Abia places become PLACE entities with isCatalog=true. They are used to normalise
 *   contributors' free-text places and to suggest entities. They never appear on Explore
 *   until a VERIFIED record links to them.
 * - No users are created. Admins come from ADMIN_USERNAMES; there is no default password.
 * Safe to run repeatedly.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const places = [
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
  for (const p of places) {
    const aliases = Array.from(new Set([`${p.name}, ${p.state}`, p.lga !== p.name ? `${p.name}, ${p.lga}` : ""].filter(Boolean)));
    const description = `${p.lga} LGA, ${p.state} State`;
    await prisma.entity.upsert({
      where: { entityType_slug: { entityType: "PLACE", slug: p.slug } },
      update: { isCatalog: true, aliases, description },
      create: { name: p.name, slug: p.slug, entityType: "PLACE", isCatalog: true, aliases, description },
    });
  }
  console.log(`Seeded ${places.length} catalog places (hidden until linked to verified records).`);
  console.log("No admin user is seeded. Set ADMIN_USERNAMES and register that username.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
