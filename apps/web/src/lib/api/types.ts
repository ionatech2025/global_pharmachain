// Response typing shared with the API via type-only Prisma imports (erased at
// build time — no Prisma runtime reaches the browser bundle).

import type { Paginated, UsageEvaluation } from "@pharmachain/core";
import type {
  Announcement,
  AuditLog,
  Bom,
  BomItem,
  Category,
  Company,
  CompanyRole,
  CompanyUserRole,
  CreditRequest,
  DataDeletionRequest,
  Document,
  ExchangeRate,
  Invite,
  Listing,
  LoginActivity,
  Message,
  MessageThread,
  Notification,
  Order,
  OrderStatusEvent,
  Quotation,
  Rfq,
  SystemParameter,
} from "@pharmachain/db";
import type { Jsonify } from "./http";

export type { Paginated };

export type CategoryRow = Jsonify<Category>;
export type ExchangeRateRow = Jsonify<ExchangeRate>;
export type NotificationRow = Jsonify<Notification>;
export type AnnouncementRow = Pick<
  Jsonify<Announcement>,
  "id" | "title" | "body" | "createdAt" | "expiresAt"
>;
export type SystemParameterRow = Jsonify<SystemParameter>;
export type InviteRow = Pick<Jsonify<Invite>, "id" | "email" | "role" | "expiresAt" | "createdAt">;
export type CreditRequestRow = Jsonify<CreditRequest>;

export interface CompanyRef {
  id: string;
  name: string;
  country?: string;
  subscriptionTier?: "FREEMIUM" | "PREMIUM" | "FEATURED";
}

export type CompanyMe = Jsonify<Company> & {
  _count: { members: number; listings: number };
};

/** GET /companies/me wraps the company with the caller's role. */
export type CompanyMeResponse = { company: CompanyMe; role: CompanyRole };

export type MemberRow = Jsonify<CompanyUserRole> & {
  user: {
    id: string;
    name: string;
    email: string;
    status: "INVITED" | "ACTIVE" | "DEACTIVATED";
    lastLoginAt: string | null;
  };
};

export type ListingRow = Jsonify<Listing> & {
  category: Pick<CategoryRow, "id" | "name" | "slug">;
  documents: Array<{ id: string; fileName: string; version: number }>;
  hasSds: boolean;
  sdsMissing: boolean;
  company?: CompanyRef;
};

export type RfqRow = Jsonify<Rfq> & {
  category: { name: string } | null;
  _count: { quotations: number };
};

export type RfqInboxRow = Jsonify<Rfq> & {
  buyerCompany: CompanyRef;
  category: { name: string } | null;
  quotations: Array<{ id: string; status: string; version: number }>;
};

export type RfqDetail = Jsonify<Rfq> & {
  buyerCompany: CompanyRef;
  category: { id: string; name: string } | null;
  documents: Array<{ id: string; fileName: string; size: number }>;
  bomItem: { id: string; materialName: string; bomId: string } | null;
  order: { id: string; orderNo: string } | null;
  viewerIsBuyer: boolean;
  myQuotation: Jsonify<Quotation> | null;
};

export type QuotationRow = Jsonify<Quotation> & {
  supplierCompany: CompanyRef;
  documents: Array<{ id: string; fileName: string }>;
};

export type OrderRow = Jsonify<Order> & {
  buyerCompany: CompanyRef;
  sellerCompany: CompanyRef;
  rfq: { refNo: string };
};

export type OrderDetail = Jsonify<Order> & {
  buyerCompany: CompanyRef;
  sellerCompany: CompanyRef;
  rfq: { id: string; refNo: string; title: string };
  quotation: { id: string; refNo: string; leadTimeDays: number; validUntil: string };
  statusEvents: Array<Jsonify<OrderStatusEvent> & { actor: { name: string } }>;
  thread: { id: string } | null;
  viewerIsSeller: boolean;
  viewerIsBuyer: boolean;
};

export type DocumentRow = Jsonify<Document> & {
  uploadedBy: { name: string };
  ownerCompany?: { name: string };
};

export type BomRow = Jsonify<Bom> & {
  items: Array<
    Jsonify<BomItem> & {
      category: { id: string; name: string } | null;
      rfqs: Array<{ id: string; refNo: string; status: string }>;
    }
  >;
  createdBy: { name: string };
  productListing?: { id: string; name: string };
};

export type ThreadRow = Jsonify<MessageThread> & {
  buyerCompany: CompanyRef;
  supplierCompany: CompanyRef;
  rfq: { id: string; refNo: string; title: string } | null;
  quotation: { id: string; refNo: string } | null;
  order: { id: string; orderNo: string; title: string } | null;
  messages: Array<{ body: string; createdAt: string }>;
};

export type MessageRow = Jsonify<Message> & {
  sender: { id: string; name: string };
  attachments: Array<{ id: string; fileName: string; size: number }>;
};

/** GET /threads/:id/messages — thread header plus the message page. */
export interface ThreadMessages {
  thread: Omit<ThreadRow, "messages">;
  messages: MessageRow[];
}

export interface UsageSummary {
  rfq: UsageEvaluation;
  quotation: UsageEvaluation;
}

// ── Platform-admin responses ─────────────────────────────────────────────────

export type AdminCompanyRow = Pick<
  Jsonify<Company>,
  | "id"
  | "name"
  | "type"
  | "country"
  | "verificationStatus"
  | "subscriptionTier"
  | "reverificationDueAt"
  | "createdAt"
>;

export interface AdminCompanyDetail {
  company: Jsonify<Company> & { members: MemberRow[] };
  documents: DocumentRow[];
  checks: Array<{
    kind: string;
    present: boolean;
    notExpired: boolean;
    scanClean: boolean;
    documentId: string | null;
    expiresAt: string | null;
  }>;
  checksPass: boolean;
}

export type LoginActivityRow = Jsonify<LoginActivity>;

export type AuditLogRow = Jsonify<AuditLog>;

export type AdminCreditRequestRow = CreditRequestRow & {
  company: { id: string; name: string; subscriptionTier: string };
  requestedBy: { name: string; email: string };
};

export type AdminAnnouncementRow = Jsonify<Announcement> & {
  createdBy: { name: string };
  targetCompany: { name: string } | null;
};

export type DeletionRequestRow = Jsonify<DataDeletionRequest> & {
  user: { id: string; email: string; name: string };
};

export interface DashboardSummary {
  scope: "platform" | "company";
  platform: {
    totalCompanies: number;
    verifiedCompanies: number;
    pendingVerifications: number;
    totalUsers: number;
    openRfqs: number;
    ordersLast30d: number;
    pendingCredits: number;
    pendingDeletions: number;
  } | null;
  company: {
    verificationStatus: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED" | "EXPIRED_DOCUMENT";
    publishedListings: number;
    draftListings: number;
    openRfqs: number;
    activeQuotations: number;
    ordersAsBuyer: number;
    ordersAsSeller: number;
    unreadNotifications: number;
    expiringDocuments: number;
    usage: UsageSummary;
  } | null;
}

export interface VerificationChecklist {
  verificationStatus: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED" | "EXPIRED_DOCUMENT";
  rejectionReason: string | null;
  verifiedAt: string | null;
  reverificationDueAt: string | null;
  required: Array<{
    kind: string;
    status: "MISSING" | "UPLOADED" | "EXPIRING_SOON" | "EXPIRED";
    documentId: string | null;
    fileName: string | null;
    expiresAt: string | null;
    version: number | null;
  }>;
  additional: Array<{
    kind: string;
    documentId: string;
    fileName: string;
    expiresAt: string | null;
    version: number;
  }>;
  complete: boolean;
}
