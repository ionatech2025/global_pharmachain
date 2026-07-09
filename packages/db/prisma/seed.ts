// Seed for local development and demos. Idempotent — safe to re-run.
// Run with: bun run db:seed   (requires DATABASE_URL and a pushed schema)
import { generateRefNo, PARAM_DEFINITIONS } from "@pharmachain/core";
import { prisma } from "../src/index";

const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@pharmachain.local";
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "admin-ChangeMe-1";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "demo-Pass-1";

async function hash(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

async function seedParameters() {
  for (const def of PARAM_DEFINITIONS) {
    await prisma.systemParameter.upsert({
      where: { key: def.key },
      update: { type: def.type, description: def.description },
      create: {
        key: def.key,
        value: def.defaultValue,
        type: def.type,
        description: def.description,
      },
    });
  }
}

async function seedCategories() {
  const categories = [
    { slug: "apis", name: "Active Pharmaceutical Ingredients (APIs)", kind: "RAW_MATERIAL" },
    { slug: "excipients", name: "Excipients", kind: "RAW_MATERIAL" },
    { slug: "solvents", name: "Solvents & Reagents", kind: "RAW_MATERIAL" },
    { slug: "lab-chemicals", name: "Laboratory Chemicals", kind: "RAW_MATERIAL" },
    { slug: "packaging", name: "Packaging Materials", kind: "RAW_MATERIAL" },
    { slug: "water-treatment", name: "Water System & Treatment Chemicals", kind: "RAW_MATERIAL" },
    { slug: "analgesics", name: "Analgesics & Antipyretics", kind: "FINISHED_PRODUCT" },
    { slug: "antibiotics", name: "Antibiotics", kind: "FINISHED_PRODUCT" },
    { slug: "antimalarials", name: "Antimalarials", kind: "FINISHED_PRODUCT" },
    { slug: "syrups", name: "Oral Liquid Dosages (Syrups)", kind: "FINISHED_PRODUCT" },
    { slug: "iv-fluids", name: "Sterile Products & IV Fluids", kind: "FINISHED_PRODUCT" },
    { slug: "supplements", name: "Supplements", kind: "FINISHED_PRODUCT" },
  ] as const;
  const bySlug: Record<string, string> = {};
  for (const c of categories) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, kind: c.kind },
      create: { slug: c.slug, name: c.name, kind: c.kind },
    });
    bySlug[c.slug] = row.id;
  }
  return bySlug;
}

async function seedExchangeRates() {
  const rates: Array<[string, string, string]> = [
    ["USD", "UGX", "3820.00"],
    ["USD", "KES", "129.50"],
    ["USD", "TZS", "2680.00"],
    ["USD", "RWF", "1420.00"],
    ["USD", "EUR", "0.92"],
    ["USD", "GBP", "0.78"],
    ["USD", "INR", "84.10"],
    ["USD", "CNY", "7.21"],
  ];
  for (const [base, quote, rate] of rates) {
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base, quote } },
      update: { rate },
      create: { base, quote, rate },
    });
  }
}

async function seedSuperAdmin() {
  return prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: { isSuperAdmin: true, status: "ACTIVE" },
    create: {
      email: SUPER_ADMIN_EMAIL,
      name: "Platform Super Admin",
      passwordHash: await hash(SUPER_ADMIN_PASSWORD),
      status: "ACTIVE",
      isSuperAdmin: true,
    },
  });
}

interface DemoCompanySpec {
  name: string;
  type: "RAW_MATERIAL_MANUFACTURER" | "FINISHED_PRODUCT_MANUFACTURER";
  country: string;
  registrationNumber: string;
  adminEmail: string;
  adminName: string;
  opsEmail: string;
  opsName: string;
  description: string;
}

async function seedDemoCompany(spec: DemoCompanySpec, verifiedById: string) {
  const company = await prisma.company.upsert({
    where: { registrationNumber: spec.registrationNumber },
    update: {},
    create: {
      name: spec.name,
      type: spec.type,
      country: spec.country,
      address: `Plot 12, Industrial Area, ${spec.country}`,
      registrationNumber: spec.registrationNumber,
      primaryContactName: spec.adminName,
      primaryContactEmail: spec.adminEmail,
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
      verifiedById,
      reverificationDueAt: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000),
      profileDescription: spec.description,
      profileStatus: "PUBLISHED",
      profilePublishedAt: new Date(),
      countriesOfOperation: [spec.country, "Kenya", "Tanzania"],
      displayedCertifications: ["ISO 9001", "WHO-GMP"],
    },
  });

  const passwordHash = await hash(DEMO_PASSWORD);
  for (const [email, name, role] of [
    [spec.adminEmail, spec.adminName, "COMPANY_ADMIN"],
    [spec.opsEmail, spec.opsName, "OPERATIONS"],
  ] as const) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, passwordHash, status: "ACTIVE" },
    });
    await prisma.companyUserRole.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, companyId: company.id, role },
    });
  }
  return company;
}

async function main() {
  console.log("Seeding PharmaChain…");

  await seedParameters();
  const categories = await seedCategories();
  await seedExchangeRates();
  const superAdmin = await seedSuperAdmin();

  const supplier = await seedDemoCompany(
    {
      name: "Kampala Fine Chemicals Ltd",
      type: "RAW_MATERIAL_MANUFACTURER",
      country: "Uganda",
      registrationNumber: "UG-80010023456",
      adminEmail: "admin@kampalafinechem.demo",
      adminName: "Sarah Nakato",
      opsEmail: "ops@kampalafinechem.demo",
      opsName: "James Okello",
      description:
        "Manufacturer of pharmaceutical-grade APIs and excipients serving East African formulators.",
    },
    superAdmin.id,
  );

  const manufacturer = await seedDemoCompany(
    {
      name: "Nile Pharma Industries",
      type: "FINISHED_PRODUCT_MANUFACTURER",
      country: "Uganda",
      registrationNumber: "UG-80010098765",
      adminEmail: "admin@nilepharma.demo",
      adminName: "Grace Mbabazi",
      opsEmail: "ops@nilepharma.demo",
      opsName: "Peter Ssemakula",
      description: "WHO-GMP certified manufacturer of oral solid dosage forms and syrups.",
    },
    superAdmin.id,
  );

  // Supplier catalogue
  const apiCategoryId = categories.apis;
  const excipientCategoryId = categories.excipients;
  if (!apiCategoryId || !excipientCategoryId) throw new Error("Category seed failed");

  // Seed-integrity assertion: the supplier ops user must exist by this point.
  await prisma.user.findUniqueOrThrow({
    where: { email: "ops@kampalafinechem.demo" },
  });

  const listingSpecs = [
    {
      name: "Paracetamol BP/EP (API)",
      casNumber: "103-90-2",
      categoryId: apiCategoryId,
      price: "12.5000",
      ghs: "Not classified as hazardous",
      pack: "25 kg fibre drum",
    },
    {
      name: "Microcrystalline Cellulose PH102",
      casNumber: "9004-34-6",
      categoryId: excipientCategoryId,
      price: "4.2000",
      ghs: undefined,
      pack: "20 kg bag",
    },
  ];
  for (const spec of listingSpecs) {
    const existing = await prisma.listing.findFirst({
      where: { companyId: supplier.id, name: spec.name },
    });
    if (!existing) {
      await prisma.listing.create({
        data: {
          companyId: supplier.id,
          kind: "RAW_MATERIAL",
          name: spec.name,
          casNumber: spec.casNumber,
          ghsClassification: spec.ghs,
          countryOfOrigin: "Uganda",
          packagingType: "Drum/Bag",
          packSize: spec.pack,
          unit: "kg",
          hsCode: "293624",
          shelfLifeMonths: 36,
          storageConditions: "Store below 25°C in a dry place",
          certifications: ["BP", "EP", "WHO-GMP"],
          categoryId: spec.categoryId,
          price: spec.price,
          currency: "USD",
          status: "PUBLISHED",
        },
      });
    }
  }

  // Manufacturer finished product + BOM + an open demo RFQ
  const manufacturerOps = await prisma.user.findUniqueOrThrow({
    where: { email: "ops@nilepharma.demo" },
  });
  const analgesicsId = categories.analgesics;
  if (!analgesicsId) throw new Error("Category seed failed");

  let product = await prisma.listing.findFirst({
    where: { companyId: manufacturer.id, name: "Painex 500mg Tablets" },
  });
  if (!product) {
    product = await prisma.listing.create({
      data: {
        companyId: manufacturer.id,
        kind: "FINISHED_PRODUCT",
        name: "Painex 500mg Tablets",
        countryOfOrigin: "Uganda",
        packagingType: "Blister pack",
        packSize: "10 x 10 tablets",
        unit: "pack",
        shelfLifeMonths: 24,
        storageConditions: "Store below 30°C",
        certifications: ["WHO-GMP"],
        categoryId: analgesicsId,
        price: "1.8000",
        currency: "USD",
        status: "PUBLISHED",
      },
    });
  }

  let bom = await prisma.bom.findFirst({ where: { productListingId: product.id, version: 1 } });
  if (!bom) {
    bom = await prisma.bom.create({
      data: {
        productListingId: product.id,
        version: 1,
        status: "ACTIVE",
        notes: "Per 1000 tablets",
        createdById: manufacturerOps.id,
        items: {
          create: [
            {
              materialName: "Paracetamol BP (API)",
              categoryId: apiCategoryId,
              quantityPerUnit: "500.000000",
              unit: "g",
              sortOrder: 0,
            },
            {
              materialName: "Microcrystalline Cellulose PH102",
              categoryId: excipientCategoryId,
              quantityPerUnit: "120.000000",
              unit: "g",
              sortOrder: 1,
            },
          ],
        },
      },
    });
  }

  const existingRfq = await prisma.rfq.findFirst({ where: { buyerCompanyId: manufacturer.id } });
  if (!existingRfq) {
    const visibleSupplierCount = await prisma.company.count({
      where: { type: "RAW_MATERIAL_MANUFACTURER", verificationStatus: "VERIFIED" },
    });
    await prisma.rfq.create({
      data: {
        refNo: generateRefNo("RFQ"),
        buyerCompanyId: manufacturer.id,
        createdById: manufacturerOps.id,
        title: "Paracetamol BP (API) — 500 kg",
        specifications: "BP/EP grade, assay ≥ 99.0%, CoA per batch, WHO-GMP source required.",
        quantity: "500.0000",
        unit: "kg",
        targetCompanyType: "RAW_MATERIAL_MANUFACTURER",
        categoryId: apiCategoryId,
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: "OPEN",
        visibleSupplierCount,
      },
    });
  }

  console.log("Seed complete.");
  console.log(
    `  Super admin:        ${SUPER_ADMIN_EMAIL} (password: SEED_SUPER_ADMIN_PASSWORD env)`,
  );
  console.log("  Demo supplier:      admin@kampalafinechem.demo / ops@kampalafinechem.demo");
  console.log("  Demo manufacturer:  admin@nilepharma.demo / ops@nilepharma.demo");
  console.log("  Demo user password: value of SEED_DEMO_PASSWORD (defaults per .env.example)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
