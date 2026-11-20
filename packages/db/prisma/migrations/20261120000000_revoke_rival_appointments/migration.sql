-- ADR-0007: a company that quoted on an order's RFQ and was not awarded it must not be
-- appointed to that order, because an appointee reads the order's awarded terms.
-- LogisticsService.appoint refuses new ones; this revokes any made before that guard.
-- Only logistics companies can be appointed, and a company can quote only on RFQs aimed at
-- its own type, so such a row is a losing bidder placed on the logistics contract its rival
-- won. Each revocation is written to the audit log. Matches ACTIVE rows only, so re-running
-- the statement changes nothing. Timestamps are written in UTC, as the app writes them (the
-- columns are timestamp without time zone, and now() would give the server's local time).
WITH rival AS (
  SELECT sa.id, sa."orderId", sa."companyId", sa.role
  FROM "ShipmentAppointment" sa
  JOIN "Order" o ON o.id = sa."orderId"
  WHERE sa.status = 'ACTIVE'
    AND sa."companyId" <> o."sellerCompanyId"
    AND EXISTS (
      SELECT 1 FROM "Quotation" q
      WHERE q."rfqId" = o."rfqId" AND q."supplierCompanyId" = sa."companyId"
    )
), revoked AS (
  UPDATE "ShipmentAppointment" sa
  SET status = 'REVOKED', "revokedAt" = now() AT TIME ZONE 'UTC'
  FROM rival
  WHERE sa.id = rival.id
  RETURNING sa.id, sa."orderId", sa."companyId", sa.role
)
INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "companyId", "oldValues", "newValues", reason, "createdAt")
SELECT
  gen_random_uuid(),
  'order.appointment-revoked-rival-bidder',
  'Order',
  r."orderId"::text,
  r."companyId",
  jsonb_build_object('appointmentId', r.id, 'role', r.role::text, 'status', 'ACTIVE'),
  jsonb_build_object('status', 'REVOKED'),
  'The appointee quoted on this order''s RFQ and was not awarded it (ADR-0007)',
  now() AT TIME ZONE 'UTC'
FROM revoked r;
