import { Injectable } from "@nestjs/common";
import type { CatalogueSearch, ListingCreate, ListingUpdate } from "@pharmachain/core";
import { paginate, skipTake } from "@pharmachain/core";
import type { DocumentKind, Prisma } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { forbidden, notFound } from "../../common/errors";
import type { Membership } from "../../lib/context";

const DOC_SELECT = { id: true, fileName: true, version: true, kind: true } as const;

/**
 * Both listing-scoped document kinds come back in one relation read — Prisma
 * cannot alias a relation twice in an include — and are split by kind below.
 */
const LISTING_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  documents: {
    where: {
      kind: { in: ["SDS", "CERTIFICATE_OF_ANALYSIS"] },
      status: "ACTIVE",
      uploadCompletedAt: { not: null },
    },
    select: DOC_SELECT,
    orderBy: { version: "desc" },
  },
} satisfies Prisma.ListingInclude;

interface ListingDocument {
  id: string;
  fileName: string;
  version: number;
  kind: DocumentKind;
}

/**
 * US-303: hazardous-classified materials without an SDS get a warning badge.
 * The Certificate of Analysis is the quality evidence buyers shortlist on, so
 * the marketplace shows it beside the price; only the current version is
 * surfaced, older ones stay retrievable through /documents.
 *
 * `documents` keeps its original meaning — the SDS versions — so existing
 * callers are unaffected by the CoA joining the same relation read.
 */
function withDocumentFlags<
  T extends { ghsClassification: string | null; documents: ListingDocument[] },
>(listing: T) {
  const sds = listing.documents.filter((d) => d.kind === "SDS");
  const coaDocument = listing.documents.find((d) => d.kind === "CERTIFICATE_OF_ANALYSIS") ?? null;
  const hasSds = sds.length > 0;
  return {
    ...listing,
    documents: sds,
    hasSds,
    sdsMissing: Boolean(listing.ghsClassification) && !hasSds,
    hasCoa: coaDocument !== null,
    coaDocument,
  };
}

@Injectable()
export class CatalogueService {
  /** Marketplace search (US-304): only VERIFIED companies' PUBLISHED listings. */
  async search(query: CatalogueSearch) {
    const where: Prisma.ListingWhereInput = {
      status: "PUBLISHED",
      company: { verificationStatus: "VERIFIED", profileStatus: "PUBLISHED" },
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.country
        ? { countryOfOrigin: { contains: query.country, mode: "insensitive" } }
        : {}),
      ...(query.certification ? { certifications: { has: query.certification } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { casNumber: { contains: query.q } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
      query.sort === "company"
        ? [{ company: { name: "asc" } }, { name: "asc" }]
        : [{ name: "asc" }];

    const [rows, total] = await prisma.$transaction([
      prisma.listing.findMany({
        where,
        orderBy,
        ...skipTake(query),
        include: {
          ...LISTING_INCLUDE,
          company: {
            select: { id: true, name: true, country: true, subscriptionTier: true },
          },
        },
      }),
      prisma.listing.count({ where }),
    ]);

    // Premium/Featured placement (US-905) within the page for relevance sort.
    const tierRank = { FEATURED: 0, PREMIUM: 1, FREEMIUM: 2 } as const;
    const items = rows.map(withDocumentFlags);
    if (query.sort === "relevance") {
      items.sort(
        (a, b) => tierRank[a.company.subscriptionTier] - tierRank[b.company.subscriptionTier],
      );
    }
    return paginate(items, total, query);
  }

  listCategories() {
    return prisma.category.findMany({ orderBy: { name: "asc" } });
  }

  listExchangeRates() {
    return prisma.exchangeRate.findMany({ orderBy: [{ base: "asc" }, { quote: "asc" }] });
  }

  async listMine(membership: Membership, query: { status?: string; kind?: string }) {
    const rows = await prisma.listing.findMany({
      where: {
        companyId: membership.companyId,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.kind ? { kind: query.kind as never } : {}),
      },
      include: LISTING_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(withDocumentFlags);
  }

  async create(membership: Membership, body: ListingCreate) {
    const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category) throw notFound("Category not found");
    return prisma.listing.create({
      data: { ...body, companyId: membership.companyId },
    });
  }

  async findOwn(membership: Membership, id: string) {
    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing || listing.companyId !== membership.companyId) throw notFound("Listing not found");
    return listing;
  }

  async getById(id: string, membership: Membership | undefined, isSuperAdmin: boolean) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        ...LISTING_INCLUDE,
        company: {
          select: {
            id: true,
            name: true,
            country: true,
            subscriptionTier: true,
            verificationStatus: true,
            profileStatus: true,
          },
        },
      },
    });
    if (!listing) throw notFound("Listing not found");
    const isOwner = membership?.companyId === listing.companyId;
    const isPublic =
      listing.status === "PUBLISHED" &&
      listing.company.verificationStatus === "VERIFIED" &&
      listing.company.profileStatus === "PUBLISHED";
    if (!isOwner && !isPublic && !isSuperAdmin) throw notFound("Listing not found");
    return withDocumentFlags(listing);
  }

  async update(membership: Membership, id: string, body: ListingUpdate) {
    const before = await this.findOwn(membership, id);
    const updated = await prisma.listing.update({ where: { id: before.id }, data: body });
    const oldValues = Object.fromEntries(
      Object.keys(body).map((k) => [k, (before as Record<string, unknown>)[k]]),
    );
    return { before, updated, oldValues };
  }

  async publish(membership: Membership, id: string) {
    const listing = await this.findOwn(membership, id);
    // US-302: requires a verified company with a published profile
    if (membership.company.verificationStatus !== "VERIFIED") {
      throw forbidden("Your company must be verified before publishing listings");
    }
    if (membership.company.profileStatus !== "PUBLISHED") {
      throw forbidden("Publish your company profile before publishing listings");
    }
    // US-302: raw materials need a CAS number to go live — optional while
    // drafting, enforced here so an incomplete listing can still be saved.
    if (listing.kind === "RAW_MATERIAL" && !listing.casNumber) {
      throw forbidden("Add a CAS number before publishing this raw material listing");
    }
    // Phase 4 §4: pharmacopoeia claims (BP/USP/IP/EP) are enforced — a
    // listing claiming a standard needs a quality document on file.
    if (listing.standards.length > 0) {
      const qualityDoc = await prisma.document.findFirst({
        where: {
          ownerCompanyId: membership.companyId,
          kind: { in: ["QUALITY_CERTIFICATE", "GMP_CERTIFICATE", "CERTIFICATE_OF_ANALYSIS"] },
          status: "ACTIVE",
          uploadCompletedAt: { not: null },
        },
        select: { id: true },
      });
      if (!qualityDoc) {
        throw forbidden(
          `This listing claims ${listing.standards.join("/")} conformity — upload a quality certificate (CoA, GMP or quality certificate) before publishing`,
        );
      }
    }
    return prisma.listing.update({ where: { id: listing.id }, data: { status: "PUBLISHED" } });
  }

  async setActive(membership: Membership, id: string, active: boolean) {
    const listing = await this.findOwn(membership, id);
    return prisma.listing.update({
      where: { id: listing.id },
      data: { status: active ? "PUBLISHED" : "DEACTIVATED" },
    });
  }
}
