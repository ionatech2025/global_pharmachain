// System parameters (US-904): business rules the super admin can tune without
// a deployment. Defaults are seeded; the API validates writes against `type`.

export const PARAM_KEYS = {
  DOC_EXPIRY_ALERT_DAYS: "document_expiry_alert_days",
  RFQ_DEFAULT_DEADLINE_DAYS: "rfq_default_deadline_days",
  FREEMIUM_RFQ_MONTHLY_LIMIT: "freemium_rfq_monthly_limit",
  FREEMIUM_QUOTATION_MONTHLY_LIMIT: "freemium_quotation_monthly_limit",
  CREDIT_FEE_RFQ_USD: "credit_fee_rfq_usd",
  CREDIT_FEE_QUOTATION_USD: "credit_fee_quotation_usd",
  CREDIT_FEE_CURRENCY: "credit_fee_currency",
  COMPANY_USER_LIMIT: "company_user_limit",
  PLATFORM_COMMISSION_PCT: "platform_commission_pct",
  PLATFORM_BANK_DETAILS: "platform_bank_details",
  FEATURED_FEE_USD: "featured_fee_usd",
  VERIFICATION_PREMIUM_FEE_USD: "verification_premium_fee_usd",
  DATA_INSIGHTS_FEE_USD: "data_insights_fee_usd",
  LOGISTICS_LEAD_FEE_USD: "logistics_lead_fee_usd",
} as const;
export type ParamKey = (typeof PARAM_KEYS)[keyof typeof PARAM_KEYS];

export type ParamType = "int" | "decimal" | "csv-int" | "currency" | "text";

export interface ParamDefinition {
  key: ParamKey;
  type: ParamType;
  defaultValue: string;
  description: string;
}

export const PARAM_DEFINITIONS: readonly ParamDefinition[] = [
  {
    key: PARAM_KEYS.DOC_EXPIRY_ALERT_DAYS,
    type: "csv-int",
    defaultValue: "60,30,7",
    description: "Days before document expiry at which alerts are sent (comma-separated)",
  },
  {
    key: PARAM_KEYS.RFQ_DEFAULT_DEADLINE_DAYS,
    type: "int",
    defaultValue: "14",
    description: "Default RFQ response window suggested to buyers, in days",
  },
  {
    key: PARAM_KEYS.FREEMIUM_RFQ_MONTHLY_LIMIT,
    type: "int",
    defaultValue: "5",
    description: "RFQs a Freemium company may raise per calendar month (UTC)",
  },
  {
    key: PARAM_KEYS.FREEMIUM_QUOTATION_MONTHLY_LIMIT,
    type: "int",
    defaultValue: "10",
    description: "Quotations a Freemium company may submit per calendar month (UTC)",
  },
  {
    key: PARAM_KEYS.CREDIT_FEE_RFQ_USD,
    type: "decimal",
    defaultValue: "25.00",
    description: "Fee (USD) per additional RFQ credit beyond the Freemium limit",
  },
  {
    key: PARAM_KEYS.CREDIT_FEE_QUOTATION_USD,
    type: "decimal",
    defaultValue: "10.00",
    description: "Fee (USD) per additional quotation credit beyond the Freemium limit",
  },
  {
    key: PARAM_KEYS.CREDIT_FEE_CURRENCY,
    type: "currency",
    defaultValue: "USD",
    description: "ISO 4217 currency the per-credit fees are charged in",
  },
  {
    key: PARAM_KEYS.COMPANY_USER_LIMIT,
    type: "int",
    defaultValue: "0",
    description: "Maximum users per company (0 = unlimited)",
  },
  {
    key: PARAM_KEYS.PLATFORM_COMMISSION_PCT,
    type: "decimal",
    defaultValue: "1.50",
    description: "Platform commission (%) recorded on each confirmed payment (Phase 3)",
  },
  {
    key: PARAM_KEYS.PLATFORM_BANK_DETAILS,
    type: "text",
    defaultValue: "Bank of Africa · PharmaChain Ltd · A/C 01234567890 · SWIFT BOAUGKA",
    description: "Bank instructions shown for manual bank-transfer payments (Phase 3)",
  },
  {
    key: PARAM_KEYS.FEATURED_FEE_USD,
    type: "decimal",
    defaultValue: "199.00",
    description: "Fee (USD) for 30 days of featured marketplace placement (Phase 4)",
  },
  {
    key: PARAM_KEYS.VERIFICATION_PREMIUM_FEE_USD,
    type: "decimal",
    defaultValue: "499.00",
    description: "Fee (USD) for the premium verification package (Phase 4)",
  },
  {
    key: PARAM_KEYS.DATA_INSIGHTS_FEE_USD,
    type: "decimal",
    defaultValue: "299.00",
    description: "Fee (USD) for 30 days of market data-insights access (Phase 5)",
  },
  {
    key: PARAM_KEYS.LOGISTICS_LEAD_FEE_USD,
    type: "decimal",
    defaultValue: "5.00",
    description:
      "Lead-generation fee (USD) recorded when a logistics partner is appointed (Phase 5)",
  },
];

export function paramDefinition(key: ParamKey): ParamDefinition {
  const def = PARAM_DEFINITIONS.find((d) => d.key === key);
  if (!def) throw new Error(`Unknown system parameter: ${key}`);
  return def;
}

export function validateParamValue(type: ParamType, value: string): boolean {
  switch (type) {
    case "int":
      return /^\d+$/.test(value.trim());
    case "decimal":
      return /^\d+(\.\d{1,2})?$/.test(value.trim());
    case "csv-int": {
      const parts = value.split(",").map((p) => p.trim());
      return parts.length > 0 && parts.every((p) => /^\d+$/.test(p) && Number(p) > 0);
    }
    case "currency":
      return /^[A-Z]{3}$/.test(value.trim());
    case "text":
      return value.trim().length > 0 && value.length <= 500;
  }
}

export function parseCsvInts(value: string): number[] {
  return value
    .split(",")
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}
