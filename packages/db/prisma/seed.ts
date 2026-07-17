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

// ─── Full-lifecycle demo data ────────────────────────────────────────────────
// EmailOtp and PasswordResetToken are deliberately never seeded — they are
// transient security artifacts that only the live flows should create.

const sha256Hex = (input: string) => {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
};

/** Placeholder object keys: list/checklist UIs render fully; downloads are
 *  expected to 404 unless a real object is uploaded through the app. */
const seedStorageKey = (companyId: string, fileName: string) =>
  `${companyId}/seed-demo/${fileName}`;

async function seedDocument(args: {
  ownerCompanyId: string;
  uploadedById: string;
  kind: Parameters<typeof prisma.document.create>[0]["data"]["kind"];
  fileName: string;
  expiresAt?: Date;
  listingId?: string;
  orderId?: string;
}) {
  const storageKey = seedStorageKey(args.ownerCompanyId, args.fileName);
  await prisma.document.upsert({
    where: { storageKey },
    update: {},
    create: {
      ownerCompanyId: args.ownerCompanyId,
      uploadedById: args.uploadedById,
      kind: args.kind,
      fileName: args.fileName,
      contentType: "application/pdf",
      size: 184_320,
      storageKey,
      expiresAt: args.expiresAt,
      status: "ACTIVE",
      scanStatus: "CLEAN",
      uploadCompletedAt: new Date(),
      listingId: args.listingId,
      orderId: args.orderId,
    },
  });
}

async function seedCompanyDocuments(companyId: string, uploaderId: string) {
  const in180d = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  const docs = [
    { kind: "CERTIFICATE_OF_INCORPORATION", fileName: "certificate-of-incorporation.pdf" },
    { kind: "TRADING_LICENCE", fileName: "trading-licence.pdf", expiresAt: in180d },
    { kind: "TAX_ID", fileName: "tax-registration.pdf" },
    { kind: "IMPORT_EXPORT_LICENCE", fileName: "import-export-licence.pdf", expiresAt: in180d },
    { kind: "MANUFACTURING_LICENCE", fileName: "manufacturing-licence.pdf", expiresAt: in180d },
    { kind: "GMP_CERTIFICATE", fileName: "gmp-certificate.pdf", expiresAt: in180d },
  ] as const;
  for (const doc of docs) {
    await seedDocument({ ownerCompanyId: companyId, uploadedById: uploaderId, ...doc });
  }
}

interface TradeActors {
  supplier: { id: string };
  manufacturer: { id: string };
  supplierOpsId: string;
  manufacturerOpsId: string;
  apiCategoryId: string;
  excipientCategoryId: string;
}

/** Quotations on the open RFQ plus a fully progressed order:
 *  RFQ → superseded + accepted quotations → order → shipment history → thread. */
async function seedTradeCycle(actors: TradeActors) {
  const openRfq = await prisma.rfq.findFirst({
    where: { buyerCompanyId: actors.manufacturer.id, status: "OPEN" },
  });
  if (openRfq) {
    const activeQuote = await prisma.quotation.findFirst({
      where: { rfqId: openRfq.id, supplierCompanyId: actors.supplier.id },
    });
    if (!activeQuote) {
      await prisma.quotation.create({
        data: {
          refNo: generateRefNo("QUO"),
          rfqId: openRfq.id,
          supplierCompanyId: actors.supplier.id,
          submittedById: actors.supplierOpsId,
          unitPrice: "11.9000",
          currency: "USD",
          totalPrice: "5950.00",
          leadTimeDays: 21,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          notes: "BP/EP grade, CoA per batch. FOB Kampala.",
          status: "ACTIVE",
        },
      });
    }
  }

  const existingOrder = await prisma.order.findFirst({
    where: { buyerCompanyId: actors.manufacturer.id },
  });
  if (existingOrder) return existingOrder;

  const day = 24 * 60 * 60 * 1000;
  const awardedRfq = await prisma.rfq.create({
    data: {
      refNo: generateRefNo("RFQ"),
      buyerCompanyId: actors.manufacturer.id,
      createdById: actors.manufacturerOpsId,
      title: "Microcrystalline Cellulose PH102 — 800 kg",
      specifications: "PH102 grade, moisture ≤ 5%, supplied in 20 kg bags.",
      quantity: "800.0000",
      unit: "kg",
      targetCompanyType: "RAW_MATERIAL_MANUFACTURER",
      categoryId: actors.excipientCategoryId,
      deadline: new Date(Date.now() - 4 * day),
      status: "AWARDED",
      awardedAt: new Date(Date.now() - 3 * day),
      closedAt: new Date(Date.now() - 4 * day),
      visibleSupplierCount: 1,
      createdAt: new Date(Date.now() - 12 * day),
    },
  });
  // Resubmission history: v1 superseded, v2 accepted (matches the live flow
  // and the one-live-quotation partial unique index).
  await prisma.quotation.create({
    data: {
      refNo: generateRefNo("QUO"),
      rfqId: awardedRfq.id,
      supplierCompanyId: actors.supplier.id,
      submittedById: actors.supplierOpsId,
      version: 1,
      unitPrice: "4.6000",
      currency: "USD",
      totalPrice: "3680.00",
      leadTimeDays: 14,
      validUntil: new Date(Date.now() + 20 * day),
      status: "SUPERSEDED",
      createdAt: new Date(Date.now() - 10 * day),
    },
  });
  const accepted = await prisma.quotation.create({
    data: {
      refNo: generateRefNo("QUO"),
      rfqId: awardedRfq.id,
      supplierCompanyId: actors.supplier.id,
      submittedById: actors.supplierOpsId,
      version: 2,
      unitPrice: "4.4000",
      currency: "USD",
      totalPrice: "3520.00",
      leadTimeDays: 12,
      validUntil: new Date(Date.now() + 20 * day),
      notes: "Revised price for full-truck consolidation.",
      status: "ACCEPTED",
      createdAt: new Date(Date.now() - 8 * day),
    },
  });

  const order = await prisma.order.create({
    data: {
      orderNo: generateRefNo("ORD"),
      rfqId: awardedRfq.id,
      quotationId: accepted.id,
      buyerCompanyId: actors.manufacturer.id,
      sellerCompanyId: actors.supplier.id,
      createdById: actors.manufacturerOpsId,
      title: awardedRfq.title,
      quantity: awardedRfq.quantity,
      unit: awardedRfq.unit,
      unitPrice: accepted.unitPrice,
      currency: accepted.currency,
      totalAmount: accepted.totalPrice,
      status: "IN_TRANSIT",
      eta: new Date(Date.now() + 5 * day),
      forwarderName: "TransAfrica Logistics",
      forwarderEmail: "dispatch@transafrica.demo",
      createdAt: new Date(Date.now() - 3 * day),
    },
  });
  const history = [
    { status: "ORDER_CONFIRMED", note: "Order confirmed after award", offset: -3 * day },
    { status: "PICKUP_SCHEDULED", note: "Pickup booked with forwarder", offset: -2.5 * day },
    { status: "GOODS_COLLECTED", note: "Collected from Kampala plant", offset: -2 * day },
    { status: "IN_TRANSIT", note: "On the road — Malaba border crossing", offset: -1 * day },
  ] as const;
  for (const event of history) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        status: event.status,
        note: event.note,
        eta: new Date(Date.now() + 5 * day),
        actorUserId: actors.supplierOpsId,
        createdAt: new Date(Date.now() + event.offset),
      },
    });
  }

  const thread = await prisma.messageThread.create({
    data: {
      buyerCompanyId: actors.manufacturer.id,
      supplierCompanyId: actors.supplier.id,
      orderId: order.id,
      lastEmailNotifiedAt: new Date(Date.now() - 1 * day),
    },
  });
  const conversation = [
    {
      senderId: actors.manufacturerOpsId,
      senderCompanyId: actors.manufacturer.id,
      body: "Hi — can you confirm the truck cleared Malaba? Our QA slot is booked for Friday.",
      offset: -1 * day,
    },
    {
      senderId: actors.supplierOpsId,
      senderCompanyId: actors.supplier.id,
      body: "Cleared this morning. CoA and packing list are attached to the order documents.",
      offset: -0.9 * day,
    },
  ];
  for (const message of conversation) {
    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: message.senderId,
        senderCompanyId: message.senderCompanyId,
        senderRole: "OPERATIONS",
        body: message.body,
        createdAt: new Date(Date.now() + message.offset),
      },
    });
  }

  return order;
}

/** Announcements, notifications + preferences, credit request, pending
 *  invite, login history, GDPR queue entry and verification audit rows. */
async function seedWorkspaceExtras(args: {
  superAdminId: string;
  superAdminEmail: string;
  supplier: { id: string; name: string };
  manufacturer: { id: string; name: string };
  users: { email: string; id: string; companyId: string }[];
  orderId: string;
  supplierAdminId: string;
  manufacturerAdminId: string;
}) {
  const announcementTitle = "Scheduled maintenance — Sunday 02:00–04:00 UTC";
  const existingAnnouncement = await prisma.announcement.findFirst({
    where: { title: announcementTitle },
  });
  if (!existingAnnouncement) {
    await prisma.announcement.create({
      data: {
        title: announcementTitle,
        body: "The platform will be briefly unavailable while we apply database upgrades. Open RFQs and orders are unaffected.",
        audience: "ALL",
        status: "PUBLISHED",
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdById: args.superAdminId,
      },
    });
  }

  for (const user of args.users) {
    const hasNotifications = await prisma.notification.findFirst({
      where: { userId: user.id },
    });
    if (!hasNotifications) {
      await prisma.notification.createMany({
        data: [
          {
            userId: user.id,
            type: "SHIPMENT_STATUS_CHANGE",
            title: "Order in transit",
            body: "Your order crossed the Malaba border and is en route.",
            href: `/orders/${args.orderId}`,
            readAt: new Date(),
          },
          {
            userId: user.id,
            type: "NEW_MESSAGE",
            title: "New message on your order",
            body: "There is a reply waiting in the order conversation.",
            href: "/messages",
          },
        ],
      });
    }
    await prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId: user.id, eventType: "NEW_MESSAGE" } },
      update: {},
      create: { userId: user.id, eventType: "NEW_MESSAGE", email: true, whatsapp: false },
    });
  }

  const existingCredit = await prisma.creditRequest.findFirst({
    where: { companyId: args.manufacturer.id },
  });
  if (!existingCredit) {
    await prisma.creditRequest.create({
      data: {
        companyId: args.manufacturer.id,
        kind: "RFQ",
        count: 5,
        fee: "25.00",
        currency: "USD",
        status: "PENDING_PAYMENT",
        requestedById: args.manufacturerAdminId,
      },
    });
  }

  const inviteEmail = "finance@nilepharma.demo";
  await prisma.invite.upsert({
    where: { tokenHash: sha256Hex(`seed-invite:${inviteEmail}`) },
    update: {},
    create: {
      companyId: args.manufacturer.id,
      email: inviteEmail,
      role: "FINANCE",
      tokenHash: sha256Hex(`seed-invite:${inviteEmail}`),
      invitedById: args.manufacturerAdminId,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  });

  const hasLogins = await prisma.loginActivity.findFirst({
    where: { userId: args.manufacturerAdminId },
  });
  if (!hasLogins) {
    await prisma.loginActivity.createMany({
      data: [
        {
          userId: args.manufacturerAdminId,
          email: "admin@nilepharma.demo",
          method: "PASSWORD",
          success: true,
          ip: "203.0.113.10",
          userAgent: "Mozilla/5.0 (seed)",
        },
        {
          userId: args.manufacturerAdminId,
          email: "admin@nilepharma.demo",
          method: "PASSWORD",
          success: false,
          ip: "203.0.113.10",
          userAgent: "Mozilla/5.0 (seed)",
        },
      ],
    });
  }

  // A departed staff member with a pending GDPR deletion request
  const departedEmail = "former.staff@kampalafinechem.demo";
  const departed = await prisma.user.upsert({
    where: { email: departedEmail },
    update: {},
    create: {
      email: departedEmail,
      name: "Former Staff",
      status: "DEACTIVATED",
      deactivatedAt: new Date(),
    },
  });
  const hasDeletionRequest = await prisma.dataDeletionRequest.findFirst({
    where: { userId: departed.id },
  });
  if (!hasDeletionRequest) {
    await prisma.dataDeletionRequest.create({ data: { userId: departed.id, status: "PENDING" } });
  }

  for (const company of [args.supplier, args.manufacturer]) {
    const hasAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Company", entityId: company.id, action: "company.verify-approve" },
    });
    if (!hasAudit) {
      await prisma.auditLog.create({
        data: {
          actorUserId: args.superAdminId,
          actorEmail: args.superAdminEmail,
          companyId: company.id,
          action: "company.verify-approve",
          entityType: "Company",
          entityId: company.id,
          newValues: { verificationStatus: "VERIFIED" },
        },
      });
    }
  }
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

  // Full lifecycle: quotations, awarded order with shipment history, thread,
  // documents, notifications, credits, invite, GDPR queue, audit rows.
  const [supplierAdmin, supplierOps, manufacturerAdmin] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "admin@kampalafinechem.demo" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "ops@kampalafinechem.demo" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "admin@nilepharma.demo" } }),
  ]);

  const order = await seedTradeCycle({
    supplier,
    manufacturer,
    supplierOpsId: supplierOps.id,
    manufacturerOpsId: manufacturerOps.id,
    apiCategoryId,
    excipientCategoryId,
  });

  await seedCompanyDocuments(supplier.id, supplierAdmin.id);
  await seedCompanyDocuments(manufacturer.id, manufacturerAdmin.id);
  const paracetamol = await prisma.listing.findFirst({
    where: { companyId: supplier.id, name: "Paracetamol BP/EP (API)" },
  });
  if (paracetamol) {
    await seedDocument({
      ownerCompanyId: supplier.id,
      uploadedById: supplierOps.id,
      kind: "SDS",
      fileName: "paracetamol-sds.pdf",
      listingId: paracetamol.id,
    });
  }
  await seedDocument({
    ownerCompanyId: supplier.id,
    uploadedById: supplierOps.id,
    kind: "PROFORMA_INVOICE",
    fileName: "proforma-invoice-mcc-800kg.pdf",
    orderId: order.id,
  });

  await seedWorkspaceExtras({
    superAdminId: superAdmin.id,
    superAdminEmail: SUPER_ADMIN_EMAIL,
    supplier: { id: supplier.id, name: supplier.name },
    manufacturer: { id: manufacturer.id, name: manufacturer.name },
    users: [
      { email: supplierAdmin.email, id: supplierAdmin.id, companyId: supplier.id },
      { email: supplierOps.email, id: supplierOps.id, companyId: supplier.id },
      { email: manufacturerAdmin.email, id: manufacturerAdmin.id, companyId: manufacturer.id },
      { email: manufacturerOps.email, id: manufacturerOps.id, companyId: manufacturer.id },
    ],
    orderId: order.id,
    supplierAdminId: supplierAdmin.id,
    manufacturerAdminId: manufacturerAdmin.id,
  });

  console.log("Seed complete.");
  console.log(
    `  Super admin:        ${SUPER_ADMIN_EMAIL} (password: SEED_SUPER_ADMIN_PASSWORD env)`,
  );
  console.log("  Demo supplier:      admin@kampalafinechem.demo / ops@kampalafinechem.demo");
  console.log("  Demo manufacturer:  admin@nilepharma.demo / ops@nilepharma.demo");
  console.log("  Demo user password: value of SEED_DEMO_PASSWORD (defaults per .env.example)");
  console.log("  Includes: open + awarded RFQs, quotations, in-transit order with history,");
  console.log("  messages, documents, notifications, credit request, invite, GDPR queue.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
