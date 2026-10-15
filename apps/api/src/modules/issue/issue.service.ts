import { Injectable } from "@nestjs/common";
import {
  generateRefNo,
  ISSUE_CATEGORY_LABELS,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  type IssueAdminUpdateInput,
  type IssueCreateInput,
  type IssueQuery,
  type IssueReplyInput,
  type IssueStatus,
  paginate,
  skipTake,
} from "@pharmachain/core";
import { type Prisma, prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";

let schemaEnsurePromise: Promise<void> | null = null;

/**
 * Ensures the additive SupportIssue / SupportIssueMessage tables exist even if
 * `scripts/deploy-vercel.sh` ships before the manual `db-migrate` workflow is
 * dispatched. Every statement matches 20261015000000_support_issues/migration.sql
 * with IF NOT EXISTS / duplicate_object guards, so a subsequent `prisma migrate deploy`
 * remains a clean no-op.
 */
async function ensureSupportSchema(): Promise<void> {
  if (!schemaEnsurePromise) {
    schemaEnsurePromise = (async () => {
      const statements = [
        `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ISSUE_UPDATE'`,
        `DO $$ BEGIN CREATE TYPE "IssueCategory" AS ENUM ('BUG', 'FEATURE_REQUEST', 'ONBOARDING', 'VERIFICATION', 'BILLING', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "IssuePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `CREATE TABLE IF NOT EXISTS "SupportIssue" ("id" UUID NOT NULL, "refNo" TEXT NOT NULL, "companyId" UUID, "reportedById" UUID NOT NULL, "category" "IssueCategory" NOT NULL DEFAULT 'BUG', "priority" "IssuePriority" NOT NULL DEFAULT 'MEDIUM', "status" "IssueStatus" NOT NULL DEFAULT 'OPEN', "subject" TEXT NOT NULL, "description" TEXT NOT NULL, "pageUrl" TEXT, "resolution" TEXT, "resolvedById" UUID, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SupportIssue_pkey" PRIMARY KEY ("id"))`,
        `CREATE TABLE IF NOT EXISTS "SupportIssueMessage" ("id" UUID NOT NULL, "issueId" UUID NOT NULL, "authorId" UUID NOT NULL, "isStaff" BOOLEAN NOT NULL DEFAULT false, "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupportIssueMessage_pkey" PRIMARY KEY ("id"))`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "SupportIssue_refNo_key" ON "SupportIssue"("refNo")`,
        `CREATE INDEX IF NOT EXISTS "SupportIssue_companyId_createdAt_idx" ON "SupportIssue"("companyId", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "SupportIssue_reportedById_createdAt_idx" ON "SupportIssue"("reportedById", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "SupportIssue_status_priority_createdAt_idx" ON "SupportIssue"("status", "priority", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "SupportIssueMessage_issueId_createdAt_idx" ON "SupportIssueMessage"("issueId", "createdAt")`,
        `DO $$ BEGIN ALTER TABLE "SupportIssue" ADD CONSTRAINT "SupportIssue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TABLE "SupportIssue" ADD CONSTRAINT "SupportIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TABLE "SupportIssue" ADD CONSTRAINT "SupportIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TABLE "SupportIssueMessage" ADD CONSTRAINT "SupportIssueMessage_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "SupportIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN ALTER TABLE "SupportIssueMessage" ADD CONSTRAINT "SupportIssueMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      ];
      for (const sql of statements) {
        await prisma.$executeRawUnsafe(sql);
      }
    })().catch((err) => {
      schemaEnsurePromise = null;
      console.error("[issue] ensureSupportSchema failed:", err);
    });
  }
  await schemaEnsurePromise;
}

async function withSupportSchema<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const msg = String((err as Error)?.message ?? "");
    if (code === "P2021" || /SupportIssue|does not exist/i.test(msg)) {
      await ensureSupportSchema();
      return fn();
    }
    throw err;
  }
}

@Injectable()
export class IssueService {
  /** Raise a new platform issue / support ticket for the development team. */
  async create(user: AuthUser, membership: Membership | undefined, body: IssueCreateInput) {
    const refNo = generateRefNo("ISS");
    const issue = await withSupportSchema(() =>
      prisma.supportIssue.create({
        data: {
          refNo,
          companyId: membership?.companyId ?? null,
          reportedById: user.id,
          category: body.category,
          priority: body.priority,
          subject: body.subject,
          description: body.description,
          pageUrl: body.pageUrl || null,
        },
        include: {
          company: { select: { id: true, name: true, type: true, country: true } },
          reportedBy: { select: { id: true, name: true, email: true } },
        },
      }),
    );

    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });

    const reporterLabel = membership ? `${membership.company.name} (${user.name})` : user.name;
    if (superAdmins.length > 0) {
      await notify({
        userIds: superAdmins.map((u) => u.id),
        type: "ISSUE_UPDATE",
        title: `[${ISSUE_PRIORITY_LABELS[issue.priority]}] Issue ${issue.refNo}: ${issue.subject}`,
        body: `${reporterLabel} reported a ${ISSUE_CATEGORY_LABELS[issue.category].toLowerCase()} issue.`,
        href: `/issues/${issue.id}`,
        emailContent: genericEventEmail({
          title: `New support issue ${issue.refNo}`,
          body: `Reporter: ${reporterLabel} (${user.email})\nCategory: ${ISSUE_CATEGORY_LABELS[issue.category]}\nPriority: ${ISSUE_PRIORITY_LABELS[issue.priority]}${issue.pageUrl ? `\nPage: ${issue.pageUrl}` : ""}\n\n${issue.subject}\n\n${issue.description}`,
          url: `${env.APP_URL}/issues/${issue.id}`,
          cta: "Open ticket",
        }),
      });
    }

    return issue;
  }

  /** Paginated list of issues for the caller's company (or personal account). */
  async listMine(user: AuthUser, membership: Membership | undefined, query: IssueQuery) {
    const scopeWhere: Prisma.SupportIssueWhereInput = membership
      ? { companyId: membership.companyId }
      : { reportedById: user.id };

    const where: Prisma.SupportIssueWhereInput = {
      ...scopeWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.q
        ? {
            OR: [
              { refNo: { contains: query.q, mode: "insensitive" } },
              { subject: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total, grouped] = await withSupportSchema(() =>
      prisma.$transaction([
        prisma.supportIssue.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...skipTake(query),
          include: {
            company: { select: { id: true, name: true } },
            reportedBy: { select: { id: true, name: true, email: true } },
            resolvedBy: { select: { id: true, name: true } },
            _count: { select: { messages: true } },
          },
        }),
        prisma.supportIssue.count({ where }),
        prisma.supportIssue.groupBy({
          by: ["status"],
          where: scopeWhere,
          orderBy: { status: "asc" },
          _count: { _all: true },
        }),
      ]),
    );

    const byStatus = new Map(
      grouped.map((g) => [
        g.status,
        typeof g._count === "object" && g._count ? (g._count._all ?? 0) : 0,
      ]),
    );

    return {
      ...paginate(items, total, query),
      counts: {
        open: byStatus.get("OPEN") ?? 0,
        inProgress: byStatus.get("IN_PROGRESS") ?? 0,
        resolved: byStatus.get("RESOLVED") ?? 0,
        closed: byStatus.get("CLOSED") ?? 0,
      },
    };
  }

  /** Load full ticket detail + conversation thread, enforcing tenant isolation. */
  async detail(user: AuthUser, membership: Membership | undefined, id: string) {
    const issue = await withSupportSchema(() =>
      prisma.supportIssue.findUnique({
        where: { id },
        include: {
          company: { select: { id: true, name: true, type: true, country: true } },
          reportedBy: { select: { id: true, name: true, email: true } },
          resolvedBy: { select: { id: true, name: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: { id: true, name: true, email: true, isSuperAdmin: true } },
            },
          },
        },
      }),
    );
    if (!issue) throw notFound("Support issue not found");

    const canAccess =
      user.isSuperAdmin ||
      issue.reportedById === user.id ||
      (membership !== undefined && issue.companyId === membership.companyId);

    if (!canAccess) throw notFound("Support issue not found");
    return issue;
  }

  /** Post a reply on an issue thread (either company user or development team). */
  async addMessage(
    user: AuthUser,
    membership: Membership | undefined,
    id: string,
    body: IssueReplyInput,
  ) {
    const issue = await this.detail(user, membership, id);
    const isStaff = user.isSuperAdmin;

    // Staff reply on an OPEN ticket moves it to IN_PROGRESS automatically;
    // a user reply on a RESOLVED/CLOSED ticket re-opens it for attention.
    let nextStatus: IssueStatus | undefined;
    if (isStaff && issue.status === "OPEN") {
      nextStatus = "IN_PROGRESS";
    } else if (!isStaff && (issue.status === "RESOLVED" || issue.status === "CLOSED")) {
      nextStatus = "OPEN";
    }

    const [message] = await prisma.$transaction([
      prisma.supportIssueMessage.create({
        data: {
          issueId: issue.id,
          authorId: user.id,
          isStaff,
          body: body.body,
        },
        include: {
          author: { select: { id: true, name: true, email: true, isSuperAdmin: true } },
        },
      }),
      prisma.supportIssue.update({
        where: { id: issue.id },
        data: nextStatus ? { status: nextStatus } : { updatedAt: new Date() },
      }),
    ]);

    if (isStaff) {
      if (issue.reportedById !== user.id) {
        await notify({
          userIds: [issue.reportedById],
          type: "ISSUE_UPDATE",
          title: `Development team replied on ${issue.refNo}`,
          body: body.body.length > 180 ? `${body.body.slice(0, 180)}…` : body.body,
          href: `/issues/${issue.id}`,
          emailContent: genericEventEmail({
            title: `Update on support issue ${issue.refNo}`,
            body: `The development team replied to "${issue.subject}":\n\n${body.body}`,
            url: `${env.APP_URL}/issues/${issue.id}`,
            cta: "View ticket",
          }),
        });
      }
    } else {
      const superAdmins = await prisma.user.findMany({
        where: { isSuperAdmin: true, status: "ACTIVE" },
        select: { id: true },
      });
      if (superAdmins.length > 0) {
        await notify({
          userIds: superAdmins.map((u) => u.id),
          type: "ISSUE_UPDATE",
          title: `New reply on ${issue.refNo}: ${issue.subject}`,
          body: `${user.name}: ${body.body.length > 160 ? `${body.body.slice(0, 160)}…` : body.body}`,
          href: `/issues/${issue.id}`,
        });
      }
    }

    return message;
  }

  /** Allow the reporting user or company member to close or reopen their ticket. */
  async updateOwnStatus(
    user: AuthUser,
    membership: Membership | undefined,
    id: string,
    status: "OPEN" | "CLOSED",
  ) {
    const issue = await this.detail(user, membership, id);
    if (
      !user.isSuperAdmin &&
      issue.reportedById !== user.id &&
      (!membership || issue.companyId !== membership.companyId)
    ) {
      throw forbidden("You cannot modify this support issue");
    }
    return prisma.supportIssue.update({
      where: { id: issue.id },
      data: {
        status,
        ...(status === "CLOSED"
          ? { resolvedAt: issue.resolvedAt ?? new Date() }
          : { resolvedAt: null }),
      },
    });
  }

  // ─── Platform Admin / Development Team ─────────────────────────────────────

  async adminList(query: IssueQuery) {
    const where: Prisma.SupportIssueWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.q
        ? {
            OR: [
              { refNo: { contains: query.q, mode: "insensitive" } },
              { subject: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
              { company: { name: { contains: query.q, mode: "insensitive" } } },
              { reportedBy: { email: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total, grouped, criticalOpen] = await withSupportSchema(() =>
      prisma.$transaction([
        prisma.supportIssue.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          ...skipTake(query),
          include: {
            company: { select: { id: true, name: true, type: true, country: true } },
            reportedBy: { select: { id: true, name: true, email: true } },
            resolvedBy: { select: { id: true, name: true } },
            _count: { select: { messages: true } },
          },
        }),
        prisma.supportIssue.count({ where }),
        prisma.supportIssue.groupBy({
          by: ["status"],
          orderBy: { status: "asc" },
          _count: { _all: true },
        }),
        prisma.supportIssue.count({
          where: { status: { in: ["OPEN", "IN_PROGRESS"] }, priority: "CRITICAL" },
        }),
      ]),
    );

    const byStatus = new Map(
      grouped.map((g) => [
        g.status,
        typeof g._count === "object" && g._count ? (g._count._all ?? 0) : 0,
      ]),
    );

    return {
      ...paginate(items, total, query),
      counts: {
        open: byStatus.get("OPEN") ?? 0,
        inProgress: byStatus.get("IN_PROGRESS") ?? 0,
        resolved: byStatus.get("RESOLVED") ?? 0,
        closed: byStatus.get("CLOSED") ?? 0,
        criticalOpen,
      },
    };
  }

  async adminUpdate(admin: AuthUser, id: string, body: IssueAdminUpdateInput) {
    const before = await withSupportSchema(() => prisma.supportIssue.findUnique({ where: { id } }));
    if (!before) throw notFound("Support issue not found");

    const nextStatus = body.status ?? before.status;
    const isTerminal = nextStatus === "RESOLVED" || nextStatus === "CLOSED";

    const updated = await prisma.supportIssue.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.priority ? { priority: body.priority } : {}),
        ...(body.resolution !== undefined ? { resolution: body.resolution || null } : {}),
        ...(isTerminal
          ? { resolvedById: admin.id, resolvedAt: new Date() }
          : body.status === "OPEN" || body.status === "IN_PROGRESS"
            ? { resolvedAt: null, resolvedById: null }
            : {}),
      },
      include: {
        company: { select: { id: true, name: true, type: true, country: true } },
        reportedBy: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    const statusChanged = body.status && body.status !== before.status;
    const resolutionAdded = body.resolution && body.resolution !== before.resolution;

    if ((statusChanged || resolutionAdded) && before.reportedById !== admin.id) {
      const statusLabel = ISSUE_STATUS_LABELS[updated.status];
      const summary = updated.resolution
        ? `Status: ${statusLabel} — ${updated.resolution}`
        : `Your support ticket status is now "${statusLabel}".`;

      await notify({
        userIds: [before.reportedById],
        type: "ISSUE_UPDATE",
        title: `Issue ${updated.refNo}: ${statusLabel}`,
        body: summary.length > 200 ? `${summary.slice(0, 200)}…` : summary,
        href: `/issues/${updated.id}`,
        emailContent: genericEventEmail({
          title: `Issue ${updated.refNo} — ${statusLabel}`,
          body: `The development team updated your ticket "${updated.subject}".\n\nStatus: ${statusLabel}${updated.resolution ? `\n\nResolution / Notes:\n${updated.resolution}` : ""}`,
          url: `${env.APP_URL}/issues/${updated.id}`,
          cta: "View support ticket",
        }),
      });
    }

    return { before, updated };
  }
}
