import { Injectable } from "@nestjs/common";
import type { DocumentRequestUpload } from "@pharmachain/core";
import { isVerificationKind, MAX_FILE_SIZE_BYTES } from "@pharmachain/core";
import type { Document } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { recordAudit } from "../../common/audit";
import { badRequest, forbidden, notFound } from "../../common/errors";
import type { AuthUser, Membership } from "../../lib/context";
import { scanUploadedObject } from "./scan";
import { buildStorageKey, presignDownload, presignUpload, statObject } from "./storage";

@Injectable()
export class DocumentService {
  private async assertLinkOwnership(
    input: DocumentRequestUpload,
    membership: Membership,
  ): Promise<void> {
    const companyId = membership.companyId;
    if (input.listingId) {
      const listing = await prisma.listing.findUnique({ where: { id: input.listingId } });
      if (!listing || listing.companyId !== companyId) throw notFound("Listing not found");
    }
    if (input.orderId) {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order || (order.buyerCompanyId !== companyId && order.sellerCompanyId !== companyId)) {
        throw notFound("Order not found");
      }
    }
    if (input.rfqId) {
      const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId } });
      if (!rfq || rfq.buyerCompanyId !== companyId) throw notFound("RFQ not found");
    }
    if (input.quotationId) {
      const quotation = await prisma.quotation.findUnique({ where: { id: input.quotationId } });
      if (!quotation || quotation.supplierCompanyId !== companyId) {
        throw notFound("Quotation not found");
      }
    }
  }

  async requestUpload(user: AuthUser, membership: Membership, input: DocumentRequestUpload) {
    // Verification documents & logo are company-level assets (US-102)
    if ((isVerificationKind(input.kind) || input.kind === "COMPANY_LOGO") === false) {
      await this.assertLinkOwnership(input, membership);
    }

    let version = 1;
    if (input.replacesDocumentId) {
      const previous = await prisma.document.findUnique({
        where: { id: input.replacesDocumentId },
      });
      if (!previous || previous.ownerCompanyId !== membership.companyId) {
        throw notFound("Document to replace not found");
      }
      if (previous.kind !== input.kind) {
        throw badRequest("Replacement must have the same document kind");
      }
      version = previous.version + 1;
    }

    const storageKey = buildStorageKey(membership.companyId, input.fileName);
    const document = await prisma.document.create({
      data: {
        ownerCompanyId: membership.companyId,
        uploadedById: user.id,
        kind: input.kind,
        fileName: input.fileName,
        contentType: input.contentType,
        size: input.size,
        storageKey,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        version,
        listingId: input.listingId,
        rfqId: input.rfqId,
        quotationId: input.quotationId,
        orderId: input.orderId,
      },
    });

    if (input.replacesDocumentId) {
      // Mark the pending supersede; it becomes effective when the upload completes.
      await prisma.document.update({
        where: { id: input.replacesDocumentId },
        data: { supersededById: document.id },
      });
    }

    const upload = await presignUpload(storageKey, input.contentType);
    return { document, upload };
  }

  async completeUpload(user: AuthUser, membership: Membership, documentId: string) {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.ownerCompanyId !== membership.companyId) {
      throw notFound("Document not found");
    }
    if (document.uploadedById !== user.id) {
      throw forbidden("Only the uploader can complete this upload");
    }

    // Trust nothing the client declared: a presigned PUT cannot cap the size,
    // and complete can be called without any upload at all. Verify what is
    // actually in the bucket before the document becomes visible.
    const stored = await statObject(document.storageKey);
    if (!stored) {
      throw badRequest("No uploaded file found for this document — upload it, then complete");
    }
    if (stored.size !== document.size || stored.size > MAX_FILE_SIZE_BYTES) {
      throw badRequest("Uploaded file does not match the declared size");
    }
    if (stored.contentType && stored.contentType !== document.contentType) {
      throw badRequest("Uploaded file does not match the declared content type");
    }

    const scanStatus = await scanUploadedObject(document.storageKey);
    const { updated, requeued } = await prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: documentId },
        data: { uploadCompletedAt: new Date(), scanStatus },
      });
      // Version history (US-102/303/502): prior versions retained, never removed
      await tx.document.updateMany({
        where: { supersededById: documentId },
        data: { status: "SUPERSEDED" },
      });
      // US-103: re-uploading a verification document after a rejection returns the
      // company to the review queue automatically (as the status page promises).
      // Scoped to REJECTED so it's a no-op for companies already pending/verified.
      let requeued = false;
      if (isVerificationKind(document.kind)) {
        const { count } = await tx.company.updateMany({
          where: { id: document.ownerCompanyId, verificationStatus: "REJECTED" },
          data: { verificationStatus: "PENDING_VERIFICATION", rejectionReason: null },
        });
        requeued = count > 0;
      }
      return { updated, requeued };
    });
    if (requeued) {
      await recordAudit(
        { id: user.id, email: user.email },
        {
          action: "company.verification-resubmit",
          entityType: "Company",
          entityId: document.ownerCompanyId,
          companyId: document.ownerCompanyId,
        },
      );
    }
    return updated;
  }

  async listCompanyDocuments(
    membership: Membership,
    query: {
      kind?: Document["kind"];
      expiringWithinDays?: number;
      orderId?: string;
      listingId?: string;
    },
  ) {
    const expiryFilter = query.expiringWithinDays
      ? {
          expiresAt: {
            gte: new Date(),
            lte: new Date(Date.now() + query.expiringWithinDays * 24 * 60 * 60 * 1000),
          },
        }
      : {};
    return prisma.document.findMany({
      where: {
        ownerCompanyId: membership.companyId,
        status: { not: "DELETED" },
        uploadCompletedAt: { not: null },
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.listingId ? { listingId: query.listingId } : {}),
        ...expiryFilter,
      },
      include: { uploadedBy: { select: { name: true } } },
      orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
  }

  /** Order-scoped document list — both parties see the same set (US-502). */
  async listOrderDocuments(membership: Membership, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (
      !order ||
      (order.buyerCompanyId !== membership.companyId &&
        order.sellerCompanyId !== membership.companyId)
    ) {
      throw notFound("Order not found");
    }
    return prisma.document.findMany({
      where: { orderId, status: { not: "DELETED" }, uploadCompletedAt: { not: null } },
      include: {
        uploadedBy: { select: { name: true } },
        ownerCompany: { select: { name: true } },
      },
      orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
    });
  }

  /**
   * Server-side access control for downloads (US-503): owner company, the
   * other order party, RFQ/quotation counterparties, SDS readers, thread
   * participants, or a super admin (whose access is audit-logged).
   */
  async downloadUrl(
    user: AuthUser,
    membership: Membership | undefined,
    documentId: string,
    requestMeta: { ip?: string; userAgent?: string },
  ) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        listing: { include: { company: { select: { verificationStatus: true } } } },
        order: true,
        rfq: true,
        quotation: { include: { rfq: true } },
        message: { include: { thread: true } },
      },
    });
    if (!document || document.status === "DELETED" || !document.uploadCompletedAt) {
      throw notFound("Document not found");
    }

    const companyId = membership?.companyId;
    let allowed = false;
    let auditAccess = false;

    if (user.isSuperAdmin) {
      allowed = true;
      auditAccess = true; // US-503: admin access is logged
    } else if (companyId && document.ownerCompanyId === companyId) {
      allowed = true;
    } else if (companyId && document.order) {
      allowed =
        document.order.buyerCompanyId === companyId || document.order.sellerCompanyId === companyId;
      auditAccess = allowed; // non-owner party download (US-903)
    } else if (document.listing && document.kind === "SDS") {
      // US-303: SDS downloadable by any authenticated buyer on a published listing
      allowed =
        document.listing.status === "PUBLISHED" &&
        document.listing.company.verificationStatus === "VERIFIED";
    } else if (companyId && document.rfq) {
      allowed =
        document.rfq.buyerCompanyId === companyId ||
        (membership !== undefined &&
          document.rfq.targetCompanyType === membership.company.type &&
          membership.company.verificationStatus === "VERIFIED");
    } else if (companyId && document.quotation) {
      allowed =
        document.quotation.supplierCompanyId === companyId ||
        document.quotation.rfq.buyerCompanyId === companyId;
      auditAccess = allowed && document.quotation.supplierCompanyId !== companyId;
    } else if (companyId && document.message) {
      allowed =
        document.message.thread.buyerCompanyId === companyId ||
        document.message.thread.supplierCompanyId === companyId;
    }

    if (!allowed) throw forbidden();

    if (auditAccess && document.ownerCompanyId !== companyId) {
      await recordAudit(
        { id: user.id, email: user.email },
        {
          action: "document.download",
          entityType: "Document",
          entityId: document.id,
          companyId: document.ownerCompanyId,
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
        },
      );
    }

    return presignDownload(document.storageKey, document.fileName);
  }

  async softDelete(membership: Membership, documentId: string) {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.ownerCompanyId !== membership.companyId) {
      throw notFound("Document not found");
    }
    // Retained in history, not physically removed (US-502)
    return prisma.document.update({ where: { id: documentId }, data: { status: "DELETED" } });
  }
}
