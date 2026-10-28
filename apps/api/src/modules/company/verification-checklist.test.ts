import { describe, expect, test } from "bun:test";
import {
  type ChecklistItem,
  type ChecklistItemStatus,
  describeBlocking,
  lapsedCurrentDocuments,
  selectBlocking,
} from "./verification-checklist";

const item = (kind: ChecklistItem["kind"], status: ChecklistItemStatus): ChecklistItem => ({
  kind,
  status,
  documentId: status === "MISSING" ? null : "doc-id",
  fileName: status === "MISSING" ? null : `${kind}.pdf`,
  expiresAt: null,
  version: status === "MISSING" ? null : 1,
});

describe("verification approval gate (US-103)", () => {
  test("a complete checklist blocks nothing", () => {
    const required = [
      item("CERTIFICATE_OF_INCORPORATION", "UPLOADED"),
      item("TRADING_LICENCE", "UPLOADED"),
      item("TAX_ID", "UPLOADED"),
    ];
    expect(selectBlocking(required)).toEqual([]);
  });

  test("a missing mandatory document blocks approval", () => {
    // Regression: approval used to check only the company's current status, so a
    // company with no documents at all could be verified.
    const required = [
      item("CERTIFICATE_OF_INCORPORATION", "MISSING"),
      item("TRADING_LICENCE", "MISSING"),
      item("TAX_ID", "MISSING"),
    ];
    expect(selectBlocking(required).map((b) => b.kind)).toEqual([
      "CERTIFICATE_OF_INCORPORATION",
      "TRADING_LICENCE",
      "TAX_ID",
    ]);
  });

  test("an already-expired licence blocks approval", () => {
    const required = [item("TRADING_LICENCE", "EXPIRED"), item("TAX_ID", "UPLOADED")];
    expect(selectBlocking(required).map((b) => b.kind)).toEqual(["TRADING_LICENCE"]);
  });

  test("an expiring-soon licence is still valid and does not block", () => {
    const required = [item("TRADING_LICENCE", "EXPIRING_SOON"), item("TAX_ID", "UPLOADED")];
    expect(selectBlocking(required)).toEqual([]);
  });

  test("the message names each outstanding document and why", () => {
    const message = describeBlocking([
      item("CERTIFICATE_OF_INCORPORATION", "MISSING"),
      item("TRADING_LICENCE", "EXPIRED"),
    ]);
    expect(message).toBe("Certificate of Incorporation (missing), Trading Licence (expired)");
  });
});

describe("lapsed documents read the current copy only (US-104, client review 2026-10-27)", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const doc = (kind: string, version: number, expiresAt: string | null, createdAt: string) => ({
    kind,
    fileName: `${kind}-v${version}.pdf`,
    version,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdAt: new Date(createdAt),
  });

  test("a lapsed licence is reported", () => {
    const lapsed = lapsedCurrentDocuments(
      [doc("TRADING_LICENCE", 1, "2026-10-23T00:00:00Z", "2026-01-01T00:00:00Z")],
      now,
    );
    expect(lapsed.map((d) => d.kind)).toEqual(["TRADING_LICENCE"]);
  });

  test("a renewal clears it even when the old copy was never marked superseded", () => {
    // Figures 5 and 6: the company replaced the expired document and still read
    // "Document expired". The newer version is the one that counts.
    const lapsed = lapsedCurrentDocuments(
      [
        doc("TRADING_LICENCE", 1, "2026-10-23T00:00:00Z", "2026-01-01T00:00:00Z"),
        doc("TRADING_LICENCE", 2, "2029-10-23T00:00:00Z", "2026-10-24T00:00:00Z"),
      ],
      now,
    );
    expect(lapsed).toEqual([]);
  });

  test("two copies on the same version: the later upload counts", () => {
    const docs = [
      doc("GMP_CERTIFICATE", 1, "2029-01-01T00:00:00Z", "2026-10-25T00:00:00Z"),
      doc("GMP_CERTIFICATE", 1, "2026-10-01T00:00:00Z", "2026-03-01T00:00:00Z"),
    ];
    expect(lapsedCurrentDocuments(docs, now)).toEqual([]);
    expect(lapsedCurrentDocuments([...docs].reverse(), now)).toEqual([]);
  });

  test("an undated document never lapses, and kinds are judged separately", () => {
    const lapsed = lapsedCurrentDocuments(
      [
        doc("TAX_ID", 1, null, "2026-01-01T00:00:00Z"),
        doc("GMP_CERTIFICATE", 3, "2026-10-27T11:00:00Z", "2026-01-01T00:00:00Z"),
        doc("TRADING_LICENCE", 2, "2026-10-28T00:00:00Z", "2026-01-01T00:00:00Z"),
      ],
      now,
    );
    expect(lapsed.map((d) => d.kind)).toEqual(["GMP_CERTIFICATE"]);
  });
});
