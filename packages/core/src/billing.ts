import type { SubscriptionTier } from "./enums";

// Freemium usage accounting (US-906/907).
// Effective limit = tier base limit + confirmed credits purchased this UTC
// calendar month. Usage = rows created this month — no reset job needed.
// Premium/Featured tiers are exempt from limits in Phase 1.

export const USAGE_WARN_RATIO = 0.8;

export interface UsageEvaluation {
  limited: boolean;
  limit: number | null; // null = unlimited
  used: number;
  remaining: number | null;
  blocked: boolean;
  /** True when this *next* action crosses the 80% warning threshold. */
  crossesWarnThreshold: boolean;
}

export function evaluateUsage(args: {
  tier: SubscriptionTier;
  baseLimit: number;
  confirmedCredits: number;
  used: number;
}): UsageEvaluation {
  const { tier, baseLimit, confirmedCredits, used } = args;
  if (tier !== "FREEMIUM") {
    return {
      limited: false,
      limit: null,
      used,
      remaining: null,
      blocked: false,
      crossesWarnThreshold: false,
    };
  }
  const limit = baseLimit + confirmedCredits;
  const blocked = used >= limit;
  const warnAt = Math.ceil(limit * USAGE_WARN_RATIO);
  const crossesWarnThreshold = !blocked && used + 1 >= warnAt && used < warnAt;
  return {
    limited: true,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    blocked,
    crossesWarnThreshold,
  };
}

/** First instant of the current UTC calendar month. */
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
