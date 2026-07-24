/**
 * Minimal PDF writer for tabular financial exports (Phase 3 §4): headed
 * pages of monospaced-aligned text rows in built-in Helvetica. ~120 lines of
 * the PDF 1.4 object model beats a rendering dependency for documents this
 * regular; output opens in every viewer (verified structurally by pdf.test).
 */

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 48;
const LINE_H = 14;
const FONT_SIZE = 9;
const TITLE_SIZE = 14;

export interface PdfTable {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  /** Optional QR code (dark-module matrix) drawn on the first page — the
   *  physical-world affordance for /verify (review UX finding). */
  qr?: { modules: boolean[][]; caption: string };
}

function escapePdfText(text: string): string {
  // Latin-1 only: replace anything outside with '?' so offsets stay valid.
  return text.replace(/[^ -ÿ]/g, "?").replace(/([\\()])/g, "\\$1");
}

/** Lay the table out into per-page arrays of content-stream text lines. */
function layout(doc: PdfTable): string[][] {
  const usable = PAGE_H - MARGIN * 2;
  const linesPerPage = Math.floor(usable / LINE_H) - 4; // header block
  // Column x-offsets: distribute evenly across the page width.
  const colW = (PAGE_W - MARGIN * 2) / Math.max(1, doc.columns.length);
  const xFor = (i: number) => MARGIN + i * colW;

  const textRow = (cells: string[], y: number, bold = false): string => {
    const font = bold ? "/F2" : "/F1";
    return cells
      .map(
        (cell, i) =>
          `BT ${font} ${FONT_SIZE} Tf ${xFor(i).toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(
            cell.slice(0, Math.floor(colW / (FONT_SIZE * 0.5))),
          )}) Tj ET`,
      )
      .join("\n");
  };

  const pages: string[][] = [];
  let rowIdx = 0;
  while (rowIdx === 0 || rowIdx < doc.rows.length) {
    const lines: string[] = [];
    let y = PAGE_H - MARGIN;
    lines.push(
      `BT /F2 ${TITLE_SIZE} Tf ${MARGIN} ${y.toFixed(2)} Td (${escapePdfText(doc.title)}) Tj ET`,
    );
    y -= LINE_H * 1.5;
    if (doc.subtitle) {
      lines.push(
        `BT /F1 ${FONT_SIZE} Tf ${MARGIN} ${y.toFixed(2)} Td (${escapePdfText(doc.subtitle)}) Tj ET`,
      );
      y -= LINE_H * 1.5;
    }
    lines.push(textRow(doc.columns, y, true));
    y -= LINE_H;
    let onPage = 0;
    while (rowIdx < doc.rows.length && onPage < linesPerPage) {
      lines.push(textRow(doc.rows[rowIdx] ?? [], y));
      y -= LINE_H;
      rowIdx += 1;
      onPage += 1;
    }
    pages.push(lines);
    if (doc.rows.length === 0) break;
  }
  return pages;
}

/** Renders the table to a complete single-file PDF. */
export function renderPdf(doc: PdfTable): Uint8Array {
  const pages = layout(doc);
  const objects: string[] = [];
  // 1: catalog · 2: pages · 3: F1 · 4: F2 · then per page: page obj + stream
  const pageObjNums = pages.map((_, i) => 5 + i * 2);
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
  for (const [i, lines] of pages.entries()) {
    let stream = lines.join("\n");
    if (i === 0 && doc.qr && doc.qr.modules.length > 0) {
      stream += `\n${renderQr(doc.qr)}`;
    }
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, obj] of objects.entries()) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(body);
}

/** QR as filled PDF rects, top-right of the first page, with a caption. */
function renderQr(qr: NonNullable<PdfTable["qr"]>): string {
  const count = qr.modules.length;
  const size = 92; // points
  const cell = size / count;
  const x0 = PAGE_W - MARGIN - size;
  const y0 = PAGE_H - MARGIN - size + 14;
  const ops: string[] = ["0 g"];
  for (let r = 0; r < count; r += 1) {
    const row = qr.modules[r] as boolean[];
    for (let c = 0; c < count; c += 1) {
      if (!row[c]) continue;
      const x = x0 + c * cell;
      const y = y0 + (count - 1 - r) * cell;
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re f`);
    }
  }
  ops.push(
    `BT /F1 7 Tf ${x0.toFixed(2)} ${(y0 - 10).toFixed(2)} Td (${escapePdfText(qr.caption)}) Tj ET`,
  );
  return ops.join("\n");
}

/** CSV export sharing the same table shape. */
export function renderCsv(doc: PdfTable): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return [doc.columns, ...doc.rows].map((row) => row.map(esc).join(",")).join("\n");
}

/** Excel-compatible SpreadsheetML (opens natively in Excel/LibreOffice). */
export function renderExcelXml(doc: PdfTable): string {
  const esc = (v: string) =>
    v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const row = (cells: string[], bold = false) =>
    `<Row>${cells
      .map(
        (c) =>
          `<Cell${bold ? ' ss:StyleID="h"' : ""}><Data ss:Type="${
            !bold && /^-?\d+(\.\d+)?$/.test(c) ? "Number" : "String"
          }">${esc(c)}</Data></Cell>`,
      )
      .join("")}</Row>`;
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="${esc(doc.title.slice(0, 30))}"><Table>
${row(doc.columns, true)}
${doc.rows.map((r) => row(r)).join("\n")}
</Table></Worksheet></Workbook>`;
}
