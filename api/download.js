/**
 * Vercel serverless function — generates CSV or Excel from posted rows.
 * POST /api/download?format=csv|excel
 * Body: JSON array of row objects
 */

import * as XLSX from "xlsx";

const COLUMNS = [
  "seed_keyword", "depth", "parent_question", "paa_question",
  "snippet", "source_title", "source_link", "displayed_link", "date",
];

function toCSV(rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = COLUMNS.join(",");
  const lines = rows.map((r) => COLUMNS.map((c) => escape(r[c])).join(","));
  return [header, ...lines].join("\n");
}

function toExcel(rows) {
  const wb = XLSX.utils.book_new();

  // All PAA sheet
  const ws1 = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  XLSX.utils.book_append_sheet(wb, ws1, "All PAA");

  // Unique questions sheet
  const seen = new Set();
  const unique = rows.filter((r) => {
    if (seen.has(r.paa_question)) return false;
    seen.add(r.paa_question);
    return true;
  });
  const ws2 = XLSX.utils.json_to_sheet(unique, { header: COLUMNS });
  XLSX.utils.book_append_sheet(wb, ws2, "Unique Questions");

  // Per-keyword sheets
  const byKeyword = {};
  for (const r of rows) {
    (byKeyword[r.seed_keyword] = byKeyword[r.seed_keyword] || []).push(r);
  }
  for (const [kw, kwRows] of Object.entries(byKeyword)) {
    const ws = XLSX.utils.json_to_sheet(kwRows, { header: COLUMNS });
    XLSX.utils.book_append_sheet(wb, ws, kw.slice(0, 31));
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const format = req.query.format || "csv";
  const rows = req.body;

  if (!Array.isArray(rows)) return res.status(400).json({ error: "Body must be a JSON array." });

  if (format === "excel") {
    const buf = toExcel(rows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="paa_results.xlsx"');
    res.send(buf);
  } else {
    const csv = toCSV(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="paa_results.csv"');
    res.send(csv);
  }
}
