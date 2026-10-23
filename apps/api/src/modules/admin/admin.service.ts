import { Injectable } from "@nestjs/common";
import {
  type BulkClientOnboardInput,
  generateRefNo,
  requiredVerificationKinds,
  VERIFICATION_DOCUMENT_KINDS,
  type VerificationDecision,
} from "@pharmachain/core";
import type { CompanyRole } from "@pharmachain/db";
import { Prisma, prisma } from "@pharmachain/db";
import {
  genericEventEmail,
  passwordResetEmail,
  verificationDecisionEmail,
} from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import { hashToken, randomToken } from "../../lib/crypto";
import { defer } from "../../lib/defer";
import { buildVerificationChecklist, describeBlocking } from "../company/verification-checklist";
import { sendEmailTo } from "../shared/mailer";

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

// Serializable so concurrent role changes cannot strip a company's last
// active admin (surfaces as a retryable 409 via the P2034 mapping).
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

@Injectable()
export class AdminService {
  /** Company detail + the automated document checks admins see (US-103). */
  async companyDetail(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, status: true, lastLoginAt: true },
            },
          },
        },
      },
    });
    if (!company) throw notFound("Company not found");

    const documents = await prisma.document.findMany({
      where: {
        ownerCompanyId: companyId,
        status: { in: ["ACTIVE", "SUPERSEDED"] },
        uploadCompletedAt: { not: null },
        kind: { in: [...VERIFICATION_DOCUMENT_KINDS] },
      },
      orderBy: [{ kind: "asc" }, { version: "desc" }],
      include: { uploadedBy: { select: { name: true } } },
    });

    const now = Date.now();
    const checks = requiredVerificationKinds(company.type).map((kind) => {
      const doc = documents.find((d) => d.kind === kind && d.status === "ACTIVE");
      return {
        kind,
        present: Boolean(doc),
        notExpired: doc ? !doc.expiresAt || doc.expiresAt.getTime() > now : false,
        scanClean: doc ? doc.scanStatus === "CLEAN" : false,
        documentId: doc?.id ?? null,
        expiresAt: doc?.expiresAt ?? null,
      };
    });

    return {
      company,
      documents,
      checks,
      checksPass: checks.every((c) => c.present && c.notExpired),
    };
  }

  /** Approve/reject with a conditional update — safe when two admins review
   *  the same company concurrently (US-103 TC4). */
  async decideVerification(adminId: string, companyId: string, decision: VerificationDecision) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw notFound("Company not found");

    const approve = decision.decision === "APPROVE";
    // US-103: approval is a compliance control, not a formality — a company
    // cannot be verified while a mandatory document is absent or expired. The
    // blocked kinds are named so the admin knows what to chase.
    if (approve) {
      const { blocking } = await buildVerificationChecklist(companyId);
      if (blocking.length > 0) {
        throw badRequest(
          `Cannot approve — mandatory documents outstanding: ${describeBlocking(blocking)}`,
        );
      }
    }
    const result = await prisma.company.updateMany({
      where: {
        id: companyId,
        verificationStatus: { in: ["PENDING_VERIFICATION", "EXPIRED_DOCUMENT"] },
      },
      data: approve
        ? {
            verificationStatus: "VERIFIED",
            verifiedAt: new Date(),
            verifiedById: adminId,
            reverificationDueAt: new Date(Date.now() + THREE_YEARS_MS),
            rejectionReason: null,
          }
        : {
            verificationStatus: "REJECTED",
            rejectionReason: decision.reason,
          },
    });
    if (result.count === 0) {
      throw conflict("This company is not awaiting verification (possibly already reviewed)");
    }

    // US-103: company users notified in-app and by email
    await notify({
      companyId,
      type: "VERIFICATION_DECISION",
      title: approve ? "Company verified 🎉" : "Verification rejected",
      body: approve
        ? "Your company has been verified. You now have full marketplace access."
        : `Verification was rejected: ${decision.reason ?? ""}. Correct the issues and resubmit.`,
      href: "/company/verification",
      emailContent: verificationDecisionEmail({
        companyName: company.name,
        approved: approve,
        reason: decision.reason,
        appUrl: env.APP_URL,
      }),
    });

    return { previousStatus: company.verificationStatus, approved: approve };
  }

  private async loadUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { membership: true },
    });
    if (!user) throw notFound("User not found");
    return user;
  }

  // Super-admin overrides (US-203) — every action carries a mandatory reason.

  async adminResetPassword(userId: string) {
    const user = await this.loadUser(userId);
    const token = randomToken();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    // US-203: the reset link only ever reaches the user, so an admin who is
    // told "reset email sent" when the relay refused it has locked the user
    // out for good rather than helped them. Report what actually happened —
    // unlike an invitation there is no safe fallback to hand over, since the
    // link is the account itself.
    const emailSent = await sendEmailTo(
      user.email,
      passwordResetEmail({ url: `${env.APP_URL}/reset-password?token=${token}` }),
    );
    return { user, emailSent };
  }

  async adminSetUserStatus(userId: string, active: boolean) {
    const user = await this.loadUser(userId);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: active
        ? { status: "ACTIVE", deactivatedAt: null }
        : { status: "DEACTIVATED", deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    await sendEmailTo(
      user.email,
      genericEventEmail({
        title: active ? "Your account was reactivated" : "Your account was deactivated",
        body: "A platform administrator changed your account status. Contact support if unexpected.",
      }),
    );
    return updated;
  }

  /**
   * Break-glass only. Who is Operations or Finance staff is the company's own
   * decision, made by its Company Admin — a platform admin has no business
   * assigning day-to-day roles inside someone else's company (client review,
   * 2026-10-22). The one case that needs the platform is a company left with no
   * active Company Admin and nobody able to appoint one (US-203): then a
   * member can be promoted, and nothing else.
   */
  async adminReassignRole(userId: string, role: CompanyRole) {
    if (role !== "COMPANY_ADMIN") {
      throw badRequest(
        "Platform administrators can only appoint a Company Admin, and only to a company that has none. Other roles are managed by the company's own admins.",
      );
    }
    const user = await this.loadUser(userId);
    if (!user.membership) throw conflict("This user has no company membership");
    const oldRole = user.membership.role;
    const membership = user.membership;
    const updated = await prisma.$transaction(async (tx) => {
      const activeAdmins = await tx.companyUserRole.count({
        where: {
          companyId: membership.companyId,
          role: "COMPANY_ADMIN",
          user: { status: "ACTIVE" },
        },
      });
      if (activeAdmins > 0) {
        throw conflict(
          "This company already has an active Company Admin — roles are managed by its admins",
        );
      }
      return tx.companyUserRole.update({ where: { userId }, data: { role } });
    }, SERIALIZABLE);
    await notify({
      userIds: [userId],
      type: "ACCOUNT_UPDATE",
      title: "Your role was changed by a platform administrator",
      body: `Your role is now ${role}.`,
      href: "/account",
      emailContent: genericEventEmail({
        title: "Your Global PharmaChain role changed",
        body: `A platform administrator changed your role to ${role}.`,
      }),
    });
    return { oldRole, updated };
  }

  /** The personal-data half of GDPR anonymization, shared by the single-user
   *  override and by company deletion so the two can never erase differently. */
  private async tombstoneUser(
    tx: Prisma.TransactionClient,
    adminId: string,
    user: { id: string; email: string },
  ) {
    const anonymized = await tx.user.update({
      where: { id: user.id },
      data: {
        email: `deleted-${user.id}@anonymized.invalid`,
        name: "Deleted User",
        passwordHash: null,
        whatsappNumber: null,
        whatsappVerifiedAt: null,
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
        anonymizedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    // An erased person must not be able to sign in with a credential that is still on file.
    await tx.webAuthnCredential.deleteMany({ where: { userId: user.id } });
    await tx.dataDeletionRequest.updateMany({
      where: { userId: user.id, status: "PENDING" },
      data: { status: "COMPLETED", completedById: adminId, completedAt: new Date() },
    });
    // Strip PII from historical login records; keep the rows for audit counts.
    await tx.loginActivity.updateMany({
      where: { userId: user.id },
      data: { email: "anonymized", ip: null, userAgent: null },
    });
    // Invitations addressed to this email also carry PII.
    await tx.invite.updateMany({
      where: { email: user.email },
      data: { email: `deleted-${user.id}@anonymized.invalid` },
    });
    // Deliberately retained: AuditLog.actorEmail (legal-basis audit trail,
    // US-903) and Company.primaryContact* (company business record, owned
    // by the company rather than the user) — unless the company itself is
    // being deleted, which tombstones those too.
    return anonymized;
  }

  /** GDPR anonymization (US-1003): personal data tombstoned; business records
   *  (RFQs, orders, audit) survive attributed to "Deleted User". */
  async anonymizeUser(adminId: string, userId: string) {
    const user = await this.loadUser(userId);
    if (user.isSuperAdmin) throw forbidden("Super admin accounts cannot be anonymized");
    const membership = user.membership;
    const anonymized = await prisma.$transaction(async (tx) => {
      if (membership?.role === "COMPANY_ADMIN") {
        const otherAdmins = await tx.companyUserRole.count({
          where: {
            companyId: membership.companyId,
            role: "COMPANY_ADMIN",
            userId: { not: userId },
            user: { status: "ACTIVE" },
          },
        });
        if (otherAdmins === 0) {
          throw conflict("Reassign another Company Admin before anonymizing this user");
        }
      }
      return this.tombstoneUser(tx, adminId, user);
    }, SERIALIZABLE);
    return { before: { email: user.email }, anonymized };
  }

  // ── Company lifecycle: suspend / reactivate / delete ───────────────────────

  private async loadCompanyForLifecycle(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { members: { include: { user: true } } },
    });
    if (!company) throw notFound("Company not found");
    return company;
  }

  /**
   * What a company still owes the platform: orders not yet confirmed delivered,
   * disputes still open, payments or invoices unsettled, and shipments it is
   * appointed to carry or clear. Deleting a company out from under any of these
   * would strand a counterparty mid-trade, so it is refused. Takes the client so
   * the delete can run it inside its own transaction — a check made beforehand
   * would let an order slip in between the check and the delete.
   */
  async companyObligations(
    companyId: string,
    db: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const parties = [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }];
    const [openOrders, openDisputes, pendingPayments, openInvoices, activeAppointments] =
      await Promise.all([
        db.order.count({ where: { OR: parties, status: { not: "DELIVERY_CONFIRMED" } } }),
        db.dispute.count({
          where: { order: { OR: parties }, status: { in: ["OPEN", "ESCALATED"] } },
        }),
        db.payment.count({ where: { payerCompanyId: companyId, status: "PENDING" } }),
        db.invoice.count({
          where: {
            OR: [{ issuerCompanyId: companyId }, { recipientCompanyId: companyId }],
            status: "ISSUED",
          },
        }),
        db.shipmentAppointment.count({
          where: {
            companyId,
            status: "ACTIVE",
            order: { status: { not: "DELIVERY_CONFIRMED" } },
          },
        }),
      ]);
    return { openOrders, openDisputes, pendingPayments, openInvoices, activeAppointments };
  }

  private mailMembers(
    company: Awaited<ReturnType<AdminService["loadCompanyForLifecycle"]>>,
    title: string,
    body: string,
  ) {
    const recipients = new Set(
      company.members.filter((m) => m.user.status === "ACTIVE").map((m) => m.user.email),
    );
    defer(
      Promise.allSettled(
        [...recipients].map((to) => sendEmailTo(to, genericEventEmail({ title, body }))),
      ),
    );
  }

  /** Reversible. Members are signed out at once and cannot sign back in; the
   *  company stops appearing anywhere (listings, directory, RFQ reach). */
  async suspendCompany(companyId: string) {
    const company = await this.loadCompanyForLifecycle(companyId);
    if (company.verificationStatus === "SUSPENDED") throw conflict("Company is already suspended");
    if (company.verificationStatus === "DELETED") throw conflict("Company has been deleted");
    await prisma.$transaction(async (tx) => {
      // Conditional, so two admins acting at once cannot both "succeed".
      const moved = await tx.company.updateMany({
        where: { id: companyId, verificationStatus: { notIn: ["SUSPENDED", "DELETED"] } },
        data: { verificationStatus: "SUSPENDED" },
      });
      if (moved.count === 0)
        throw conflict("Company was just suspended or deleted by someone else");
      // Every member's session version moves on, so open sessions die on their next request.
      await tx.user.updateMany({
        where: { membership: { companyId } },
        data: { sessionVersion: { increment: 1 } },
      });
    });
    this.mailMembers(
      company,
      "Your company's access has been suspended",
      `A platform administrator has suspended ${company.name}. Members cannot sign in until it is reactivated. Contact support if this is unexpected.`,
    );
    return { previousStatus: company.verificationStatus, companyName: company.name };
  }

  /** Back to VERIFIED only when it was verified before and its documents still
   *  pass; otherwise into the verification queue — never silently trusted. */
  async reactivateCompany(companyId: string) {
    const company = await this.loadCompanyForLifecycle(companyId);
    if (company.verificationStatus !== "SUSPENDED") {
      throw conflict("Only a suspended company can be reactivated");
    }
    const checklist = await buildVerificationChecklist(companyId);
    const next = company.verifiedAt && checklist.complete ? "VERIFIED" : "PENDING_VERIFICATION";
    const moved = await prisma.company.updateMany({
      where: { id: companyId, verificationStatus: "SUSPENDED" },
      data: { verificationStatus: next },
    });
    if (moved.count === 0) throw conflict("Company is no longer suspended");
    this.mailMembers(
      company,
      "Your company's access has been restored",
      next === "VERIFIED"
        ? `${company.name} has been reactivated and is verified again. You can sign in.`
        : `${company.name} has been reactivated. It is back in the verification queue — marketplace actions unlock once it is verified again.`,
    );
    return { nextStatus: next, companyName: company.name };
  }

  /**
   * Irreversible, so deliberately hard to reach: the company must already be
   * suspended, the admin must type its name, and nothing may be in flight.
   * Rows are NOT removed — EU GDP requires transaction records to be kept for
   * at least five years, and every order, document and audit entry hangs off
   * the company. What goes is everything personal: members are anonymised,
   * the primary contact tombstoned, keys and invitations revoked, listings
   * withdrawn.
   */
  async deleteCompany(adminId: string, companyId: string, confirmName: string) {
    const company = await this.loadCompanyForLifecycle(companyId);
    if (company.verificationStatus === "DELETED") throw conflict("Company is already deleted");
    if (company.verificationStatus !== "SUSPENDED") {
      throw conflict("Suspend the company first — deletion is a second, deliberate step");
    }
    if (confirmName.trim().toLowerCase() !== company.name.trim().toLowerCase()) {
      throw badRequest("The name you typed does not match this company — nothing was deleted");
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Inside the serializable transaction: an order accepted a moment ago is
      // seen here, and one accepted a moment from now makes this one retry.
      const owed = await this.companyObligations(companyId, tx);
      if (Object.values(owed).some((n) => n > 0)) {
        throw conflict(
          `Cannot delete: ${owed.openOrders} order(s) not yet delivered, ${owed.openDisputes} open dispute(s), ${owed.pendingPayments} pending payment(s), ${owed.openInvoices} unsettled invoice(s) and ${owed.activeAppointments} active shipment appointment(s). Let them finish, or keep the company suspended.`,
        );
      }
      const moved = await tx.company.updateMany({
        where: { id: companyId, verificationStatus: "SUSPENDED" },
        data: {
          verificationStatus: "DELETED",
          profileStatus: "DRAFT",
          primaryContactName: "Deleted contact",
          primaryContactEmail: `deleted-${companyId}@anonymized.invalid`,
          primaryContactPhone: null,
        },
      });
      if (moved.count === 0) throw conflict("Company is no longer suspended");
      // Invitations first, then the member list — both inside the transaction,
      // so nobody can join between "who are the members" and "erase them".
      await tx.invite.updateMany({
        where: { companyId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      const members = await tx.companyUserRole.findMany({
        where: { companyId },
        include: { user: true },
      });
      for (const { user } of members) {
        // Platform staff never hold a company membership; if one somehow does,
        // leave the account (it is not the company's to erase).
        if (!user.isSuperAdmin) await this.tombstoneUser(tx, adminId, user);
      }
      await tx.apiKey.updateMany({
        where: { companyId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.webhook.updateMany({ where: { companyId, active: true }, data: { active: false } });
      await tx.listing.updateMany({
        where: { companyId, status: "PUBLISHED" },
        data: { status: "DEACTIVATED" },
      });
    }, SERIALIZABLE);
    return {
      before: {
        name: company.name,
        type: company.type,
        country: company.country,
        registrationNumber: company.registrationNumber,
        memberCount: company.members.length,
      },
    };
  }

  /**
   * Provision a single or bulk cohort of client companies (up to 200 at once).
   * Each company gets an active Company Admin account and a 7-day password-setup
   * link (plus immediate OTP login access), skipping existing emails/reg numbers
   * without failing the batch.
   */
  async onboardClients(input: BulkClientOnboardInput) {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const created: Array<{
      companyId: string;
      companyName: string;
      contactName: string;
      contactEmail: string;
      registrationNumber: string;
      setupUrl: string;
    }> = [];
    const skipped: Array<{
      companyName: string;
      contactEmail: string;
      reason: string;
    }> = [];

    const seenEmails = new Set<string>();
    const seenRegs = new Set<string>();
    const candidates: Array<{
      row: (typeof input.clients)[number];
      email: string;
      regNo: string;
    }> = [];

    for (const row of input.clients) {
      const email = row.contactEmail.trim().toLowerCase();
      const regNo = (row.registrationNumber?.trim() || generateRefNo("REG")).toUpperCase();

      if (seenEmails.has(email) || seenRegs.has(regNo)) {
        skipped.push({
          companyName: row.companyName,
          contactEmail: email,
          reason: "Duplicate email or registration number in batch",
        });
        continue;
      }
      seenEmails.add(email);
      seenRegs.add(regNo);
      candidates.push({ row, email, regNo });
    }

    if (candidates.length === 0) {
      return { created, skipped };
    }

    // Batch lookup: 2 queries total for the entire 100-200 client cohort instead of 2N.
    const [existingUsers, existingCompanies] = await Promise.all([
      prisma.user.findMany({
        where: { email: { in: candidates.map((c) => c.email) } },
        select: { email: true },
      }),
      prisma.company.findMany({
        where: { registrationNumber: { in: candidates.map((c) => c.regNo) } },
        select: { registrationNumber: true },
      }),
    ]);

    const takenEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
    const takenRegs = new Set(existingCompanies.map((c) => c.registrationNumber.toUpperCase()));

    const toCreate: typeof candidates = [];
    for (const item of candidates) {
      if (takenEmails.has(item.email)) {
        skipped.push({
          companyName: item.row.companyName,
          contactEmail: item.email,
          reason: "Email already registered",
        });
      } else if (takenRegs.has(item.regNo)) {
        skipped.push({
          companyName: item.row.companyName,
          contactEmail: item.email,
          reason: `Registration number ${item.regNo} already registered`,
        });
      } else {
        toCreate.push(item);
      }
    }

    // Bounded concurrency (10 per wave) so a 100-client batch completes well
    // inside serverless timeouts without exhausting connection pool slots.
    const CHUNK_SIZE = 10;
    for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
      const chunk = toCreate.slice(i, i + CHUNK_SIZE);
      const batchCreated = await Promise.all(
        chunk.map(async ({ row, email, regNo }) => {
          const token = randomToken();
          const company = await prisma.$transaction(async (tx) => {
            const company = await tx.company.create({
              data: {
                name: row.companyName.trim(),
                type: row.companyType,
                country: row.country.trim(),
                address: row.address?.trim() || `${row.country.trim()} (Registered Office)`,
                registrationNumber: regNo,
                primaryContactName: row.contactName.trim(),
                primaryContactEmail: email,
                primaryContactPhone: row.contactPhone?.trim() || null,
              },
            });
            const user = await tx.user.create({
              data: {
                email,
                name: row.contactName.trim(),
                status: "ACTIVE",
              },
            });
            await tx.companyUserRole.create({
              data: {
                userId: user.id,
                companyId: company.id,
                role: "COMPANY_ADMIN",
              },
            });
            await tx.passwordResetToken.create({
              data: {
                userId: user.id,
                tokenHash: hashToken(token),
                expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
              },
            });
            return company;
          });

          const setupUrl = `${env.APP_URL}/reset-password?token=${token}`;
          return {
            companyId: company.id,
            companyName: company.name,
            contactName: row.contactName.trim(),
            contactEmail: email,
            registrationNumber: regNo,
            setupUrl,
          };
        }),
      );
      created.push(...batchCreated);
    }

    if (input.sendWelcomeEmail && created.length > 0) {
      defer(
        Promise.allSettled(
          created.map((item) =>
            sendEmailTo(
              item.contactEmail,
              genericEventEmail({
                title: `Welcome to Global PharmaChain — ${item.companyName} is ready`,
                body: `Your company "${item.companyName}" has been set up on Global PharmaChain.\n\nUse the button below to choose your password (or sign in anytime using a one-time email code at ${env.APP_URL}/login).`,
                url: item.setupUrl,
                cta: "Set password & sign in",
              }),
            ),
          ),
        ),
      );
    }

    return { created, skipped };
  }
}
