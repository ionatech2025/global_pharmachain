import { Injectable } from "@nestjs/common";
import type { BomCreate, BomEdit } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { conflict, notFound } from "../../common/errors";
import type { AuthUser, Membership } from "../../lib/context";

const BOM_INCLUDE = {
  items: {
    include: {
      category: { select: { id: true, name: true } },
      // "RFQ in progress" indicator per line (US-802)
      rfqs: { select: { id: true, refNo: true, status: true } },
    },
    orderBy: { sortOrder: "asc" },
  },
  createdBy: { select: { name: true } },
} as const;

@Injectable()
export class BomService {
  private async assertOwnFinishedProduct(membership: Membership, productListingId: string) {
    const listing = await prisma.listing.findUnique({ where: { id: productListingId } });
    if (!listing || listing.companyId !== membership.companyId) throw notFound("Product not found");
    if (listing.kind !== "FINISHED_PRODUCT") {
      throw conflict("BOMs can only be created for finished products");
    }
    return listing;
  }

  private async loadOwnBom(membership: Membership, bomId: string) {
    const bom = await prisma.bom.findUnique({
      where: { id: bomId },
      include: { productListing: true },
    });
    if (!bom || bom.productListing.companyId !== membership.companyId) {
      throw notFound("BOM not found");
    }
    return bom;
  }

  /** All versions for one finished product, newest first (US-803 history). */
  async listForProduct(membership: Membership, productListingId: string) {
    await this.assertOwnFinishedProduct(membership, productListingId);
    return prisma.bom.findMany({
      where: { productListingId },
      include: BOM_INCLUDE,
      orderBy: { version: "desc" },
    });
  }

  async create(user: AuthUser, membership: Membership, body: BomCreate) {
    await this.assertOwnFinishedProduct(membership, body.productListingId);
    const latest = await prisma.bom.findFirst({
      where: { productListingId: body.productListingId },
      orderBy: { version: "desc" },
    });
    return prisma.bom.create({
      data: {
        productListingId: body.productListingId,
        version: (latest?.version ?? 0) + 1,
        notes: body.notes,
        createdById: user.id,
        items: {
          create: body.items.map((item, i) => ({
            materialName: item.materialName,
            categoryId: item.categoryId,
            quantityPerUnit: item.quantityPerUnit,
            unit: item.unit,
            sortOrder: i,
          })),
        },
      },
      include: BOM_INCLUDE,
    });
  }

  async getById(membership: Membership, bomId: string) {
    const bom = await this.loadOwnBom(membership, bomId);
    return prisma.bom.findUniqueOrThrow({
      where: { id: bom.id },
      include: { ...BOM_INCLUDE, productListing: { select: { id: true, name: true } } },
    });
  }

  /** Editing creates a new version — prior versions stay viewable (US-803). */
  async newVersion(user: AuthUser, membership: Membership, bomId: string, body: BomEdit) {
    const base = await this.loadOwnBom(membership, bomId);
    const latest = await prisma.bom.findFirst({
      where: { productListingId: base.productListingId },
      orderBy: { version: "desc" },
    });
    const bom = await prisma.bom.create({
      data: {
        productListingId: base.productListingId,
        version: (latest?.version ?? 0) + 1,
        notes: body.notes,
        createdById: user.id,
        items: {
          create: body.items.map((item, i) => ({
            materialName: item.materialName,
            categoryId: item.categoryId,
            quantityPerUnit: item.quantityPerUnit,
            unit: item.unit,
            sortOrder: i,
          })),
        },
      },
      include: BOM_INCLUDE,
    });
    return { bom, fromVersion: base.version };
  }

  /** One ACTIVE BOM per product — activating archives the previous (US-801). */
  async activate(membership: Membership, bomId: string) {
    const bom = await this.loadOwnBom(membership, bomId);
    if (bom.status === "ACTIVE") throw conflict("This BOM version is already active");
    return prisma.$transaction(async (tx) => {
      await tx.bom.updateMany({
        where: { productListingId: bom.productListingId, status: "ACTIVE" },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      return tx.bom.update({ where: { id: bom.id }, data: { status: "ACTIVE" } });
    });
  }
}
