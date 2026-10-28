import { Injectable } from "@nestjs/common";
import type { DocumentRequestUpload } from "@pharmachain/core";
import {
  can,
  contentMatchesType,
  DOCUMENT_KIND_LABELS,
  formatFileSize,
  isAllowedMime,
  isVerificationKind,
  MAX_FILE_SIZE_BYTES,
} from "@pharmachain/core";
import type { Document } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { recordAudit } from "../../common/audit";
import { badRequest, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { requeueIfRenewed } from "../company/renewal";
import { scanUploadedObject } from "./scan";
import { buildStorageKey, presignDownload, putObject, statObject } from "./storage";

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
      // Phase 2 §2: appointed logistics companies (clearing agents uploading
      // customs declarations, forwarders attaching transport docs) share the
      // order document space with the two trade parties.
      const appointed =
        order &&
        order.buyerCompanyId !== companyId &&
        order.sellerCompanyId !== companyId &&
        (await prisma.shipmentAppointment.findFirst({
          where: { orderId: order.id, companyId, status: "ACTIVE" },
          select: { id: true },
        }));
      if (
        !order ||
        (order.buyerCompanyId !== companyId && order.sellerCompanyId !== companyId && !appointed)
      ) {
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

    // No presigned PUT is handed back: the bytes come to PUT :id/content and
    // this API writes them to storage itself.
    return { document };
  }

  /**
   * Receives the file bytes and writes them to storage server-side.
   *
   * Browsers reach this through the web app's same-origin /api/proxy, so an
   * upload never depends on the object store being reachable from — or
   * CORS-configured for — the user's browser. A presigned PUT straight from the
   * page fails with an opaque "network error" whenever the bucket has no CORS
   * rule for the app origin, which is the default for a new bucket.
   */
  async uploadContent(
    user: AuthUser,
    membership: Membership,
    documentId: string,
    body: Buffer,
    contentType: string | undefined,
  ) {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.ownerCompanyId !== membership.companyId) {
      throw notFound("Document not found");
    }
    if (document.uploadedById !== user.id) {
      throw forbidden("Only the uploader can upload this document");
    }
    if (document.uploadCompletedAt) {
      throw badRequest("This document has already been uploaded");
    }

    // Re-check what the client actually sent against what it declared at
    // request-upload — the declared values are what the checklist and the
    // download contract are built on.
    if (body.byteLength === 0) throw badRequest("Uploaded file is empty");
    if (body.byteLength > MAX_FILE_SIZE_BYTES) {
      throw badRequest(`File exceeds the ${formatFileSize(MAX_FILE_SIZE_BYTES)} limit`);
    }
    if (body.byteLength !== document.size) {
      throw badRequest("Uploaded file does not match the declared size");
    }
    const sent = contentType?.split(";")[0]?.trim();
    if (sent && sent !== document.contentType) {
      throw badRequest("Uploaded file does not match the declared content type");
    }
    if (!isAllowedMime(document.kind, document.contentType)) {
      throw badRequest("File type not allowed for this document kind");
    }
    // The declared type is otherwise taken on trust from the extension and
    // the browser: a script or executable renamed `.pdf` would be stored and
    // later opened by a counterparty — or by the admin reviewing a
    // verification upload — as a PDF. The bytes must be what they claim.
    if (!contentMatchesType(new Uint8Array(body), document.contentType)) {
      throw badRequest(
        "This file's contents don't match its type — it may be damaged or renamed. Export it again and retry.",
      );
    }

    await putObject(document.storageKey, new Uint8Array(body), document.contentType);
    return { id: document.id, size: body.byteLength };
  }

  async completeUpload(user: AuthUser, membership: Membership, documentId: string) {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.ownerCompanyId !== membership.companyId) {
      throw notFound("Document not found");
    }
    if (document.uploadedById !== user.id) {
      throw forbidden("Only the uploader can complete this upload");
    }
    // Idempotent: a retried or double-clicked completion returns the
    // document as it is, instead of re-running the checks and telling every
    // order party about the same upload twice.
    if (document.uploadCompletedAt) return document;

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
    // US-104: the same for a company flagged for an expired document, once this
    // upload leaves nothing lapsed or missing. Read after the commit — the
    // checklist has to see this version in place of the one it supersedes.
    if (
      isVerificationKind(document.kind) &&
      membership.company.verificationStatus === "EXPIRED_DOCUMENT" &&
      (await requeueIfRenewed(document.ownerCompanyId))
    ) {
      await recordAudit(
        { id: user.id, email: user.email },
        {
          action: "company.verification-renewal",
          entityType: "Company",
          entityId: document.ownerCompanyId,
          companyId: document.ownerCompanyId,
        },
      );
    }
    // US-501/606: an order document is shared material — tell every OTHER
    // shipment party (trade parties + appointed logistics companies) it
    // exists instead of leaving them to discover it on the order page.
    if (document.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: document.orderId },
        select: { id: true, orderNo: true, buyerCompanyId: true, sellerCompanyId: true },
      });
      if (order) {
        const appointments = await prisma.shipmentAppointment.findMany({
          where: { orderId: order.id, status: "ACTIVE" },
          select: { companyId: true },
        });
        const partyCompanyIds = [
          order.buyerCompanyId,
          order.sellerCompanyId,
          ...appointments.map((a) => a.companyId),
        ].filter((id) => id !== membership.companyId);
        const recipients = await prisma.user.findMany({
          where: { status: "ACTIVE", membership: { companyId: { in: partyCompanyIds } } },
          select: { id: true },
        });
        const kindLabel = DOCUMENT_KIND_LABELS[document.kind] ?? document.kind;
        await notify({
          userIds: recipients.map((u) => u.id),
          type: "DOCUMENT_UPLOADED",
          title: "Document uploaded",
          body: `${membership.company.name} added a ${kindLabel} to order ${order.orderNo}.`,
          href: `/orders/${order.id}`,
          emailContent: genericEventEmail({
            title: "New order document",
            body: `${membership.company.name} uploaded a ${kindLabel} to order ${order.orderNo}.`,
            url: `${env.APP_URL}/orders/${order.id}`,
            cta: "Open the order",
          }),
          whatsappText: `PharmaChain: new ${kindLabel} on order ${order.orderNo}.`,
        });
      }
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

  /** Order-scoped document list — both parties, appointed logistics companies,
   *  and super admins (auditing disputes) see the same set (US-502, Phase 2 §2). */
  async listOrderDocuments(user: AuthUser, membership: Membership | undefined, orderId: string) {
    if (!user.isSuperAdmin && (!membership || !can(membership.role, "document:read"))) {
      throw forbidden();
    }
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const isParty =
      order &&
      membership !== undefined &&
      (order.buyerCompanyId === membership.companyId ||
        order.sellerCompanyId === membership.companyId);
    const appointed =
      order &&
      membership !== undefined &&
      !isParty &&
      (await prisma.shipmentAppointment.findFirst({
        where: { orderId, companyId: membership.companyId, status: "ACTIVE" },
        select: { id: true },
      }));
    if (!order || (!user.isSuperAdmin && !isParty && !appointed)) {
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
        document.order.buyerCompanyId === companyId ||
        document.order.sellerCompanyId === companyId ||
        // Phase 2 §2: appointed logistics companies read the order documents
        Boolean(
          await prisma.shipmentAppointment.findFirst({
            where: { orderId: document.order.id, companyId, status: "ACTIVE" },
            select: { id: true },
          }),
        );
      auditAccess = allowed; // non-owner party download (US-903)
    } else if (document.kind === "COMPANY_LOGO") {
      // US-301: the logo is a public profile asset — viewable by any
      // authenticated user once the owning company's profile is live.
      const owner = await prisma.company.findUnique({
        where: { id: document.ownerCompanyId },
        select: { verificationStatus: true, profileStatus: true },
      });
      allowed = owner?.verificationStatus === "VERIFIED" && owner?.profileStatus === "PUBLISHED";
    } else if (
      document.listing &&
      (document.kind === "SDS" || document.kind === "CERTIFICATE_OF_ANALYSIS")
    ) {
      // US-303: SDS downloadable by any authenticated buyer on a published
      // listing. A listing's Certificate of Analysis is published on the same
      // terms — it is the quality evidence buyers shortlist suppliers on.
      allowed =
        document.listing.status === "PUBLISHED" &&
        document.listing.company.verificationStatus === "VERIFIED";
    } else if (companyId && document.rfq) {
      if (document.rfq.buyerCompanyId === companyId) {
        allowed = true;
      } else if (
        membership !== undefined &&
        document.rfq.targetCompanyType === membership.company.type &&
        membership.company.verificationStatus === "VERIFIED"
      ) {
        allowed = document.rfq.categoryId
          ? Boolean(
              await prisma.listing.findFirst({
                where: {
                  companyId,
                  status: "PUBLISHED",
                  categoryId: document.rfq.categoryId,
                },
                select: { id: true },
              }),
            )
          : true;
      }
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
