import {
  CURRENCIES,
  LEDGER_ENTRY_LABELS,
  LISTING_KINDS,
  orderStatusIndex,
  requiredShipmentDocKinds,
} from "@pharmachain/core";
import type { ListingKind, Prisma } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notificationProviders, notify, runOutboxRetryJob } from "@pharmachain/notifications";
import { env } from "../env";
import { logger } from "../lib/logger";
import { shipmentPartyUserIds } from "../lib/shipment-access";
import { runWebhookDeliveryPass } from "../lib/webhooks";
import { deleteObject } from "../modules/document/storage";

/** RFQs past their deadline auto-close (US-402); buyers are told. */
export async function runRfqAutoCloseJob(now = new Date()): Promise<void> {
  const due = await prisma.rfq.findMany({
    where: { status: "OPEN", deadline: { lt: now } },
    select: { id: true, refNo: true, title: true, buyerCompanyId: true, createdById: true },
  });
  if (due.length === 0) return;
  await prisma.rfq.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { status: "CLOSED", closedAt: now },
  });
  await Promise.all(
    due.map((rfq) =>
      notify({
        userIds: [rfq.createdById],
        type: "RFQ_STATUS_CHANGE",
        title: "RFQ closed",
        body: `${rfq.refNo} — ${rfq.title} — reached its deadline. Compare the quotations and award.`,
        href: `/rfqs/${rfq.id}`,
        emailContent: genericEventEmail({
          title: "Your RFQ closed",
          body: `RFQ ${rfq.refNo} — ${rfq.title} — reached its response deadline.`,
          url: `${env.APP_URL}/rfqs/${rfq.id}`,
          cta: "Compare quotations",
        }),
      }),
    ),
  );
  logger.info("rfq auto-close job done", { closed: due.length });
}

/** Quotations past their validity window expire (US-404). */
export async function runQuotationExpiryJob(now = new Date()): Promise<void> {
  const result = await prisma.quotation.updateMany({
    where: { status: "ACTIVE", validUntil: { lt: now } },
    data: { status: "EXPIRED" },
  });
  if (result.count > 0) logger.info("quotation expiry job done", { expired: result.count });
}

/**
 * Requested uploads that were never completed (browser closed, PUT failed)
 * leave invisible Document rows and possibly partial objects behind. After a
 * generous grace period both are removed; supersede markers pointing at an
 * abandoned replacement are unwound so the old version stays current.
 */
export async function runUploadCleanupJob(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stale = await prisma.document.findMany({
    where: { uploadCompletedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
    take: 500,
  });
  if (stale.length === 0) return;

  for (const doc of stale) {
    try {
      await deleteObject(doc.storageKey);
    } catch (err) {
      // Best-effort: the row is removed regardless; a leaked object without a
      // row is unreachable (keys are random UUIDs) and caught by bucket audit.
      logger.warn("upload cleanup: object delete failed", {
        storageKey: doc.storageKey,
        error: String(err),
      });
    }
  }

  const ids = stale.map((d) => d.id);
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { supersededById: { in: ids } },
      data: { supersededById: null },
    }),
    prisma.document.deleteMany({ where: { id: { in: ids }, uploadCompletedAt: null } }),
  ]);
  logger.info("upload cleanup job done", { removed: ids.length });
}

/**
 * US-1003: the 30-day data-subject-request SLA is enforced server-side, not
 * just painted in the admin UI — approaching (≤7 days left) and overdue
 * requests page the super admins daily until actioned.
 */
export async function runDsrSlaJob(now = new Date()): Promise<void> {
  const slaDays = 30;
  const warnAt = new Date(now.getTime() - (slaDays - 7) * 24 * 60 * 60 * 1000);
  const pending = await prisma.dataDeletionRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: warnAt } },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return;
  const superAdmins = await prisma.user.findMany({
    where: { isSuperAdmin: true, status: "ACTIVE" },
    select: { id: true },
  });
  const overdue = pending.filter(
    (r) => now.getTime() - r.createdAt.getTime() > slaDays * 24 * 60 * 60 * 1000,
  );
  const summary =
    overdue.length > 0
      ? `${overdue.length} deletion request(s) are PAST the ${slaDays}-day SLA`
      : `${pending.length} deletion request(s) are within 7 days of the ${slaDays}-day SLA`;
  await notify({
    userIds: superAdmins.map((u) => u.id),
    type: "DATA_REQUEST",
    title: overdue.length > 0 ? "GDPR SLA breached" : "GDPR SLA approaching",
    body: `${summary}. Oldest: ${pending[0]?.user.email ?? "?"} (${pending[0]?.createdAt.toDateString()}).`,
    href: "/admin/data-requests",
    emailContent: genericEventEmail({
      title: "Data deletion requests need action",
      body: `${summary}. Process them in the data-requests queue.`,
      url: `${env.APP_URL}/admin/data-requests`,
      cta: "Open the queue",
    }),
  });
  logger.info("dsr sla job done", { pending: pending.length, overdue: overdue.length });
}

/** Retries failed email/WhatsApp deliveries captured in the outbox. */
export async function runOutboxJob(now = new Date()): Promise<void> {
  const result = await runOutboxRetryJob(notificationProviders(), now);
  if (result.retried > 0) logger.info("outbox retry job done", result);
}

/**
 * Saved-search alerts (deferred item): each saved search re-runs against
 * listings published since its last notification; matches page the owner
 * in-app + email with a deep link back to the live search.
 */
export async function runSavedSearchAlertJob(now = new Date()): Promise<void> {
  const searches = await prisma.savedSearch.findMany({
    include: { user: { select: { id: true, status: true } } },
  });
  let alerted = 0;
  for (const search of searches) {
    if (search.user.status !== "ACTIVE") continue;
    const p = (search.params ?? {}) as {
      q?: string;
      kind?: string;
      categoryId?: string;
      country?: string;
    };
    const kind = LISTING_KINDS.includes(p.kind as ListingKind)
      ? (p.kind as ListingKind)
      : undefined;
    const where: Prisma.ListingWhereInput = {
      status: "PUBLISHED",
      createdAt: { gt: search.lastNotifiedAt },
      company: { verificationStatus: "VERIFIED", profileStatus: "PUBLISHED" },
      ...(kind ? { kind } : {}),
      ...(p.categoryId ? { categoryId: p.categoryId } : {}),
      ...(p.country ? { countryOfOrigin: { contains: p.country, mode: "insensitive" } } : {}),
      ...(p.q
        ? {
            OR: [
              { name: { contains: p.q, mode: "insensitive" } },
              { casNumber: { contains: p.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const matches = await prisma.listing.count({ where });
    if (matches === 0) continue;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
    const href = `/marketplace?${qs.toString()}`;
    await notify({
      userIds: [search.userId],
      type: "ANNOUNCEMENT",
      title: `New matches: ${search.name}`,
      body: `${matches} new listing(s) match your saved search "${search.name}".`,
      href,
      emailContent: genericEventEmail({
        title: "New marketplace matches",
        body: `${matches} new listing(s) match your saved search "${search.name}".`,
        url: `${env.APP_URL}${href}`,
        cta: "View matches",
      }),
    });
    await prisma.savedSearch.update({
      where: { id: search.id },
      data: { lastNotifiedAt: now },
    });
    alerted += 1;
  }
  if (alerted > 0) logger.info("saved-search alert job done", { alerted });
}

/**
 * Phase 2 §4 alerts engine: shipments past their ETA, shipments deep in the
 * lifecycle missing required documents, and a daily approvals digest for the
 * platform team. Each order alerts at most once per 24h (dedupe columns).
 */
export async function runLogisticsAlertsJob(now = new Date()): Promise<void> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1) Delayed past ETA (buyer, seller and logistics parties all hear it)
  const delayed = await prisma.order.findMany({
    where: {
      eta: { lt: now },
      status: { notIn: ["DELIVERED", "DELIVERY_CONFIRMED"] },
      OR: [{ lastDelayAlertAt: null }, { lastDelayAlertAt: { lt: dayAgo } }],
    },
    select: {
      id: true,
      orderNo: true,
      eta: true,
      buyerCompanyId: true,
      sellerCompanyId: true,
    },
    take: 200,
  });
  for (const order of delayed) {
    await notify({
      userIds: await shipmentPartyUserIds(order),
      type: "SHIPMENT_DELAYED",
      title: `Order ${order.orderNo} is past its ETA`,
      body: `Estimated delivery was ${order.eta?.toDateString()}. Update the ETA or record a delay note.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Shipment delayed — order ${order.orderNo}`,
        body: `The shipment is past its estimated delivery (${order.eta?.toDateString()}).`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Open the shipment",
      }),
      whatsappText: `PharmaChain: order ${order.orderNo} is past its ETA.`,
    });
    await prisma.order.update({ where: { id: order.id }, data: { lastDelayAlertAt: now } });
  }

  // 2) Missing shipment documents once the goods are moving internationally
  const inLifecycle = await prisma.order.findMany({
    where: {
      status: { notIn: ["DELIVERED", "DELIVERY_CONFIRMED"] },
      OR: [{ lastDocAlertAt: null }, { lastDocAlertAt: { lt: dayAgo } }],
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      freightMode: true,
      dangerousGoods: true,
      phytoRequired: true,
      buyerCompanyId: true,
      sellerCompanyId: true,
    },
    take: 300,
  });
  let docAlerts = 0;
  for (const order of inLifecycle) {
    if (orderStatusIndex(order.status) < orderStatusIndex("AT_PORT_OF_ORIGIN")) continue;
    const required = requiredShipmentDocKinds(order);
    const present = await prisma.document.findMany({
      where: {
        orderId: order.id,
        kind: { in: required },
        status: "ACTIVE",
        uploadCompletedAt: { not: null },
      },
      select: { kind: true },
      distinct: ["kind"],
    });
    const missing = required.filter((k) => !present.some((d) => d.kind === k));
    if (missing.length === 0) continue;
    await notify({
      userIds: await shipmentPartyUserIds(order),
      type: "DOCUMENT_MISSING",
      title: `Order ${order.orderNo}: ${missing.length} shipment document(s) missing`,
      body: `Still needed: ${missing.join(", ").replaceAll("_", " ").toLowerCase()}.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Missing shipment documents — order ${order.orderNo}`,
        body: `The shipment has entered international transit but is missing: ${missing.join(", ")}.`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Upload documents",
      }),
    });
    await prisma.order.update({ where: { id: order.id }, data: { lastDocAlertAt: now } });
    docAlerts += 1;
  }

  // 3) Pending-approval digest for the platform team
  const [pendingVerifications, pendingCredits, escalatedDisputes] = await prisma.$transaction([
    prisma.company.count({ where: { verificationStatus: "PENDING_VERIFICATION" } }),
    prisma.creditRequest.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.dispute.count({ where: { status: "ESCALATED" } }),
  ]);
  if (pendingVerifications + pendingCredits + escalatedDisputes > 0) {
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    await notify({
      userIds: superAdmins.map((u) => u.id),
      type: "APPROVAL_PENDING",
      title: "Approvals waiting on the platform team",
      body: `${pendingVerifications} verification(s), ${pendingCredits} credit request(s), ${escalatedDisputes} escalated dispute(s).`,
      href: "/admin/verification",
    });
  }

  if (delayed.length + docAlerts > 0) {
    logger.info("logistics alerts job done", { delayed: delayed.length, docAlerts });
  }
}

/**
 * Phase 3 §3: refresh display FX rates from a live feed (default: the free
 * open.er-api.com USD table), falling back silently to the admin-managed
 * manual rows when the feed is unreachable — the documented degradation.
 */
export async function runFxRefreshJob(): Promise<void> {
  const feedUrl = process.env.FX_FEED_URL ?? "https://open.er-api.com/v6/latest/USD";
  let rates: Record<string, number>;
  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    if (!data.rates) throw new Error("feed shape unexpected");
    rates = data.rates;
  } catch (err) {
    logger.warn("fx refresh: live feed unavailable — manual table remains authoritative", {
      error: String(err),
    });
    return;
  }
  let updated = 0;
  for (const quote of CURRENCIES) {
    if (quote === "USD") continue;
    const rate = rates[quote];
    if (!rate || !Number.isFinite(rate) || rate <= 0) continue;
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: "USD", quote } },
      update: { rate, source: "LIVE" },
      create: { base: "USD", quote, rate, source: "LIVE" },
    });
    updated += 1;
  }
  logger.info("fx refresh job done", { updated });
}

/**
 * Phase 3 §4: scheduled financial report delivery. WEEKLY sends on Mondays,
 * MONTHLY on the 1st; each opted-in user gets their company summary by email.
 */
export async function runScheduledReportsJob(now = new Date()): Promise<void> {
  const isMonday = now.getUTCDay() === 1;
  const isFirst = now.getUTCDate() === 1;
  const due = await prisma.scheduledReport.findMany({
    where: {
      active: true,
      OR: [
        ...(isMonday ? [{ frequency: "WEEKLY" }] : []),
        ...(isFirst ? [{ frequency: "MONTHLY" }] : []),
      ],
    },
    include: { user: { select: { id: true, email: true, status: true, membership: true } } },
  });
  let sent = 0;
  for (const schedule of due) {
    if (schedule.user.status !== "ACTIVE") continue;
    // Idempotence across restarts: skip if already sent this UTC day.
    if (
      schedule.lastSentAt &&
      schedule.lastSentAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
    ) {
      continue;
    }
    const companyId = schedule.user.membership?.companyId;
    if (schedule.report === "company-finance" && companyId) {
      const since = new Date(
        now.getTime() - (schedule.frequency === "WEEKLY" ? 7 : 31) * 24 * 60 * 60 * 1000,
      );
      const entries = await prisma.ledgerEntry.findMany({
        where: { companyId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const lines =
        entries.length === 0
          ? "No financial activity in the period."
          : entries
              .map(
                (e) =>
                  `${e.createdAt.toISOString().slice(0, 10)}  ${LEDGER_ENTRY_LABELS[e.kind]}  ${Number(e.amount).toFixed(2)} ${e.currency}  ${e.note ?? ""}`,
              )
              .join("\n");
      await notify({
        userIds: [schedule.userId],
        type: "ACCOUNT_UPDATE",
        title: `Your ${schedule.frequency.toLowerCase()} finance report`,
        body: `${entries.length} ledger entrie(s) in the period. Full report on the Finance page.`,
        href: "/finance",
        emailContent: genericEventEmail({
          title: `PharmaChain ${schedule.frequency.toLowerCase()} finance report`,
          body: `Ledger activity since ${since.toDateString()}:\n\n${lines}`,
          url: `${env.APP_URL}/finance`,
          cta: "Open finance workspace",
        }),
      });
      sent += 1;
    }
    await prisma.scheduledReport.update({
      where: { id: schedule.id },
      data: { lastSentAt: now },
    });
  }
  if (sent > 0) logger.info("scheduled reports job done", { sent });
}

/**
 * Phase 4 §3 trust system: the Trusted Supplier badge is earned, not bought —
 * granted nightly to VERIFIED companies with ≥3 published ratings averaging
 * ≥4.5★, revoked when the average slips. Paid featured placement expires here
 * too (tier reverts to FREEMIUM when featuredUntil passes).
 */
export async function runTrustBadgeJob(now = new Date()): Promise<void> {
  const aggregates = await prisma.rating.groupBy({
    by: ["targetCompanyId"],
    where: { status: "PUBLISHED" },
    _avg: { stars: true },
    _count: true,
    orderBy: { targetCompanyId: "asc" },
  });
  let granted = 0;
  let revoked = 0;
  const qualifying = new Set(
    aggregates
      .filter((a) => (a._count ?? 0) >= 3 && (a._avg?.stars ?? 0) >= 4.5)
      .map((a) => a.targetCompanyId),
  );
  const badged = await prisma.company.findMany({
    where: { trustedBadgeAt: { not: null } },
    select: { id: true },
  });
  for (const companyId of qualifying) {
    const result = await prisma.company.updateMany({
      where: { id: companyId, verificationStatus: "VERIFIED", trustedBadgeAt: null },
      data: { trustedBadgeAt: now },
    });
    if (result.count > 0) {
      granted += 1;
      await notify({
        companyId,
        roles: ["COMPANY_ADMIN"],
        type: "ACCOUNT_UPDATE",
        title: "Trusted Supplier badge earned 🏅",
        body: "Your verified ratings now average 4.5★ or better across 3+ engagements.",
        href: "/company",
      });
    }
  }
  for (const company of badged) {
    if (!qualifying.has(company.id)) {
      await prisma.company.update({
        where: { id: company.id },
        data: { trustedBadgeAt: null },
      });
      revoked += 1;
    }
  }
  // Featured placement expiry (Phase 4 §3 monetisation)
  const expired = await prisma.company.updateMany({
    where: { subscriptionTier: "FEATURED", featuredUntil: { lt: now } },
    data: { subscriptionTier: "FREEMIUM", featuredUntil: null },
  });
  if (granted + revoked + expired.count > 0) {
    logger.info("trust badge job done", { granted, revoked, featuredExpired: expired.count });
  }
}

/** Retries pending partner webhook deliveries with backoff (Phase 5 §3). */
export async function runWebhookRetryJob(now = new Date()): Promise<void> {
  const result = await runWebhookDeliveryPass(now);
  if (result.delivered > 0) logger.info("webhook retry job done", result);
}

/** Drops rate-limit buckets whose window and block have both long passed. */
export async function runThrottleCleanupJob(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const result = await prisma.throttleBucket.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
      OR: [{ blockedUntil: null }, { blockedUntil: { lt: cutoff } }],
    },
  });
  if (result.count > 0) logger.info("throttle cleanup job done", { removed: result.count });
}

/** Clears consumed/expired short-lived credentials. */
export async function runTokenCleanupJob(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [otps, resets] = await prisma.$transaction([
    prisma.emailOtp.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
    }),
  ]);
  if (otps.count + resets.count > 0) {
    logger.info("token cleanup job done", { otps: otps.count, resets: resets.count });
  }
}
