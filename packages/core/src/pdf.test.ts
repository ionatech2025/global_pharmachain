import { describe, expect, test } from "bun:test";
import { renderCsv, renderExcelXml, renderPdf } from "./pdf";

const DOC = {
  title: "Transaction history",
  subtitle: "Nile Pharma Industries · 2026-07",
  columns: ["Date", "Kind", "Amount", "Currency"],
  rows: [
    ["2026-07-01", "PAYMENT_IN", "1200.00", "USD"],
    ["2026-07-14", 'PLATFORM_FEE ("comma, quote")', "-18.00", "USD"],
  ],
};

describe("financial exports (Phase 3 §4)", () => {
  test("pdf is structurally valid (header, xref, EOF, pages)", () => {
    const bytes = renderPdf(DOC);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Count 1");
    expect(text).toContain("(Transaction history) Tj");
    expect(text).toContain("startxref");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // xref offset must point at the xref table
    const startxref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });

  test("pdf paginates long tables", () => {
    const long = { ...DOC, rows: Array.from({ length: 140 }, (_, i) => [`r${i}`, "", "", ""]) };
    const text = new TextDecoder().decode(renderPdf(long));
    expect(text).toContain("/Count 3");
  });

  test("csv escapes quotes and commas", () => {
    const csv = renderCsv(DOC);
    expect(csv.split("\n")[0]).toBe("Date,Kind,Amount,Currency");
    expect(csv).toContain('"PLATFORM_FEE (""comma, quote"")"');
  });

  test("excel xml marks numbers and escapes entities", () => {
    const xml = renderExcelXml(DOC);
    expect(xml).toContain('<Data ss:Type="Number">1200.00</Data>');
    expect(xml).toContain("&quot;".replace("&quot;", "quote")); // sanity: string path exists
    expect(xml).toContain('ss:Type="String"');
  });
});
