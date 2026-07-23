-- Phase 2 — Logistics & Operations Expansion (issue #1)
-- Company types for logistics providers, the full 13-stage shipment
-- lifecycle (lossless 6→13 migration: AT_PORT → AT_PORT_OF_DESTINATION),
-- logistics/customs document kinds, the alerts-engine notification types,
-- and the appointment / driver / GPS / POD / dispute tables.

-- 1) Logistics company types (added values are only referenced at runtime,
--    never later in this transaction)
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'FREIGHT_FORWARDER';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'CLEARING_AGENT';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'TRANSPORTER';

-- 2) Logistics document kinds
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'BILL_OF_LADING';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'AIR_WAYBILL';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'COMMERCIAL_INVOICE';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'PACKING_LIST';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'CERTIFICATE_OF_ORIGIN';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'CUSTOMS_DECLARATION';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'DANGEROUS_GOODS_DECLARATION';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'PHYTOSANITARY_CERTIFICATE';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'TAX_WORKSHEET';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'PROOF_OF_DELIVERY_PHOTO';

-- 3) Alerts-engine notification types
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SHIPMENT_DELAYED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CUSTOMS_ALERT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOCUMENT_MISSING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPROVAL_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_OVERDUE';

-- 4) 13-stage OrderStatus: rebuild the type with the lossless mapping
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM (
  'ORDER_CONFIRMED',
  'PICKUP_SCHEDULED',
  'GOODS_COLLECTED',
  'IN_TRANSIT',
  'AT_PORT_OF_ORIGIN',
  'CUSTOMS_ORIGIN',
  'DEPARTED',
  'AT_PORT_OF_DESTINATION',
  'CUSTOMS_DESTINATION',
  'INLAND_TRANSPORT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_CONFIRMED'
);
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order"
  ALTER COLUMN "status" TYPE "OrderStatus"
  USING (CASE "status"::text WHEN 'AT_PORT' THEN 'AT_PORT_OF_DESTINATION' ELSE "status"::text END)::"OrderStatus";
ALTER TABLE "OrderStatusEvent"
  ALTER COLUMN "status" TYPE "OrderStatus"
  USING (CASE "status"::text WHEN 'AT_PORT' THEN 'AT_PORT_OF_DESTINATION' ELSE "status"::text END)::"OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'ORDER_CONFIRMED';
DROP TYPE "OrderStatus_old";

-- 5) New logistics enums
CREATE TYPE "FreightMode" AS ENUM ('SEA', 'AIR', 'LAND', 'MULTIMODAL');
CREATE TYPE "LogisticsRole" AS ENUM ('FORWARDER', 'CLEARING_AGENT', 'TRANSPORTER');
CREATE TYPE "AppointmentStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED', 'WITHDRAWN');

-- 6) Order logistics metadata + exception annotations on the timeline
ALTER TABLE "Order"
  ADD COLUMN "freightMode" "FreightMode",
  ADD COLUMN "coldChain" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dispatchDate" TIMESTAMP(3),
  ADD COLUMN "deliveryConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "dangerousGoods" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "phytoRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastDelayAlertAt" TIMESTAMP(3),
  ADD COLUMN "lastDocAlertAt" TIMESTAMP(3);
CREATE INDEX "Order_eta_status_idx" ON "Order"("eta", "status");
ALTER TABLE "OrderStatusEvent" ADD COLUMN "exception" TEXT;

-- 7) Shipment appointments (one ACTIVE per order+role)
CREATE TABLE "ShipmentAppointment" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "role" "LogisticsRole" NOT NULL,
  "companyId" UUID NOT NULL,
  "appointedById" UUID NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentAppointment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShipmentAppointment_orderId_role_status_idx"
  ON "ShipmentAppointment"("orderId", "role", "status");
CREATE INDEX "ShipmentAppointment_companyId_status_createdAt_idx"
  ON "ShipmentAppointment"("companyId", "status", "createdAt");
CREATE UNIQUE INDEX "ShipmentAppointment_one_active_per_role"
  ON "ShipmentAppointment"("orderId", "role") WHERE "status" = 'ACTIVE';
ALTER TABLE "ShipmentAppointment"
  ADD CONSTRAINT "ShipmentAppointment_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ShipmentAppointment_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ShipmentAppointment_appointedById_fkey" FOREIGN KEY ("appointedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8) Driver profiles
CREATE TABLE "DriverProfile" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "licenceNo" TEXT NOT NULL,
  "vehicleReg" TEXT NOT NULL,
  "vehicleType" TEXT,
  "coldChainCapable" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId");
ALTER TABLE "DriverProfile"
  ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 9) GPS pings
CREATE TABLE "ShipmentLocation" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "lat" DECIMAL(9,6) NOT NULL,
  "lng" DECIMAL(9,6) NOT NULL,
  "note" TEXT,
  "recordedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentLocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShipmentLocation_orderId_createdAt_idx"
  ON "ShipmentLocation"("orderId", "createdAt");
ALTER TABLE "ShipmentLocation"
  ADD CONSTRAINT "ShipmentLocation_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ShipmentLocation_recordedById_fkey" FOREIGN KEY ("recordedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 10) Proof of delivery
CREATE TABLE "ProofOfDelivery" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "signedByName" TEXT NOT NULL,
  "signatureData" TEXT,
  "photoDocumentId" UUID,
  "note" TEXT,
  "capturedById" UUID NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProofOfDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProofOfDelivery_orderId_key" ON "ProofOfDelivery"("orderId");
ALTER TABLE "ProofOfDelivery"
  ADD CONSTRAINT "ProofOfDelivery_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProofOfDelivery_capturedById_fkey" FOREIGN KEY ("capturedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 11) Disputes
CREATE TABLE "Dispute" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "raisedByCompanyId" UUID NOT NULL,
  "raisedById" UUID NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "legalReference" TEXT,
  "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "escalatedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" UUID,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Dispute_orderId_createdAt_idx" ON "Dispute"("orderId", "createdAt");
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status", "createdAt");
ALTER TABLE "Dispute"
  ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Dispute_raisedByCompanyId_fkey" FOREIGN KEY ("raisedByCompanyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
