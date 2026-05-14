/**
 * docx_generator.js
 *
 * Called by export.py:
 *   node docx_generator.js <payload_json_path> <output_docx_path>
 *
 * Reads the JSON payload, builds a designed DOCX, writes it to disk.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, LevelFormat, PageNumber, Footer,
  TabStopType, TabStopPosition,
} = require("docx");

// ── CLI args ──────────────────────────────────────────────────────────────
const [,, payloadPath, outPath] = process.argv;
if (!payloadPath || !outPath) {
  console.error("Usage: node docx_generator.js <payload.json> <output.docx>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

// ── Design tokens ─────────────────────────────────────────────────────────
const ACCENT       = "1A56DB";
const ACCENT_LIGHT = "EBF5FF";
const ACCENT_DARK  = "1E40AF";
const DARK         = "111827";
const MID          = "374151";
const MUTED        = "6B7280";
const DIVIDER      = "E5E7EB";
const HIGHLIGHT    = "F9FAFB";
const WHITE        = "FFFFFF";

// US Letter, 0.75 inch margins
const PAGE_W    = 12240;
const PAGE_H    = 15840;
const MARGIN    = 1080;
const CONTENT_W = PAGE_W - MARGIN * 2;  // 10080

// ── Border helpers ────────────────────────────────────────────────────────
const B = (color = DIVIDER, size = 1) =>
  ({ style: BorderStyle.SINGLE, size, color });

const borderAll  = (c, s) => ({ top: B(c,s), bottom: B(c,s), left: B(c,s), right: B(c,s) });
const borderNone = ()     => ({ top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL },
                                 left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } });
const borderBottom = (c = DIVIDER, s = 1) =>
  ({ ...borderNone(), bottom: B(c, s) });

// ── Text run factory ──────────────────────────────────────────────────────
const R = (text, opts = {}) =>
  new TextRun({ text: String(text || ""), font: "Arial", ...opts });

const empty = (before = 0, after = 0) =>
  new Paragraph({ children: [R("")], spacing: { before, after } });

// ── Cell factory (reduces repetition) ────────────────────────────────────
function cell(children, width, opts = {}) {
  return new TableCell({
    borders: borderNone(),
    width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    ...opts,
    children: Array.isArray(children) ? children : [children],
  });
}

// ──────────────────────────────────────────────────────────────────────────
// COVER BLOCK
// ──────────────────────────────────────────────────────────────────────────
function buildCover() {
  return [
    // Thin accent strip at top
    new Paragraph({
      children: [R(" ", { size: 8 })],
      shading: { fill: ACCENT, type: ShadingType.CLEAR },
      spacing: { before: 0, after: 0 },
    }),

    empty(280, 0),

    // "Study Notes" eyebrow label
    new Paragraph({
      children: [R("STUDY NOTES", { size: 18, bold: true, color: ACCENT, characterSpacing: 120 })],
      spacing: { before: 0, after: 80 },
    }),

    // Video title
    new Paragraph({
      children: [R(data.video_title, { size: 46, bold: true, color: DARK })],
      spacing: { before: 0, after: 100 },
    }),

    // Channel · date
    new Paragraph({
      children: [
        R(data.channel_name, { size: 22, bold: true, color: ACCENT }),
        R("   ·   ", { size: 22, color: MUTED }),
        R(data.generated_at, { size: 22, color: MUTED }),
      ],
      spacing: { before: 0, after: 60 },
    }),

    // URL
    new Paragraph({
      children: [R(data.video_url, { size: 18, color: MUTED, italics: true })],
      spacing: { before: 0, after: 0 },
    }),

    // Accent divider line
    new Paragraph({
      children: [R("")],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
      spacing: { before: 200, after: 320 },
    }),
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// SUMMARY CARD
// ──────────────────────────────────────────────────────────────────────────
function buildSummary() {
  return [
    new Paragraph({
      children: [R("Overview", { size: 26, bold: true, color: DARK })],
      spacing: { before: 0, after: 140 },
    }),

    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: {
                left:   { style: BorderStyle.SINGLE, size: 14, color: ACCENT },
                top:    { style: BorderStyle.NIL },
                bottom: { style: BorderStyle.NIL },
                right:  { style: BorderStyle.NIL },
              },
              shading: { fill: ACCENT_LIGHT, type: ShadingType.CLEAR },
              width: { size: CONTENT_W, type: WidthType.DXA },
              margins: { top: 140, bottom: 140, left: 220, right: 220 },
              children: [
                new Paragraph({
                  children: [R(data.summary, { size: 22, color: MID, italics: true })],
                  spacing: { before: 0, after: 0 },
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    empty(280, 0),
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION HEADING helper
// ──────────────────────────────────────────────────────────────────────────
function sectionHeading(text) {
  return new Paragraph({
    children: [R(text, { size: 26, bold: true, color: DARK })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: DIVIDER, space: 1 } },
    spacing: { before: 360, after: 180 },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// NOTES SECTIONS
// ──────────────────────────────────────────────────────────────────────────
function buildNotes() {
  const items = [];
  for (const section of (data.sections || [])) {
    items.push(sectionHeading(section.heading));
    for (const bullet of (section.bullets || [])) {
      items.push(
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [R(bullet, { size: 22, color: MID })],
          spacing: { before: 60, after: 60 },
        })
      );
    }
  }
  return items;
}

// ──────────────────────────────────────────────────────────────────────────
// KEY TAKEAWAYS  (numbered accent rows)
// ──────────────────────────────────────────────────────────────────────────
function buildTakeaways() {
  const takeaways = (data.key_takeaways || []).slice(0, 4);
  if (takeaways.length === 0) return [];

  const W_NUM  = 520;
  const W_TEXT = CONTENT_W - W_NUM;

  const rows = takeaways.map((t, i) =>
    new TableRow({
      children: [
        // Numbered accent cell
        new TableCell({
          borders: borderNone(),
          shading: { fill: i % 2 === 0 ? ACCENT : ACCENT_DARK, type: ShadingType.CLEAR },
          width: { size: W_NUM, type: WidthType.DXA },
          margins: { top: 120, bottom: 120, left: 140, right: 140 },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              children: [R(`${i + 1}`, { size: 24, bold: true, color: WHITE })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
        // Takeaway text cell
        new TableCell({
          borders: borderBottom(DIVIDER, 1),
          shading: { fill: i % 2 === 0 ? ACCENT_LIGHT : WHITE, type: ShadingType.CLEAR },
          width: { size: W_TEXT, type: WidthType.DXA },
          margins: { top: 120, bottom: 120, left: 200, right: 140 },
          children: [
            new Paragraph({
              children: [R(t, { size: 22, color: MID })],
              spacing: { before: 0, after: 0 },
            }),
          ],
        }),
      ],
    })
  );

  return [
    sectionHeading("Key Takeaways"),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [W_NUM, W_TEXT],
      rows,
    }),
    empty(280, 0),
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// TIMESTAMPS TABLE
// ──────────────────────────────────────────────────────────────────────────
function buildTimestamps() {
  const ts = (data.timestamps || []).slice(0, 8);
  if (ts.length === 0) return [];

  const W_TIME  = 1200;
  const W_LABEL = CONTENT_W - W_TIME;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        borders: { ...borderNone(), bottom: { style: BorderStyle.SINGLE, size: 6, color: WHITE } },
        shading: { fill: ACCENT, type: ShadingType.CLEAR },
        width: { size: W_TIME, type: WidthType.DXA },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        children: [new Paragraph({ children: [R("Time", { size: 20, bold: true, color: WHITE })] })],
      }),
      new TableCell({
        borders: { ...borderNone(), bottom: { style: BorderStyle.SINGLE, size: 6, color: WHITE } },
        shading: { fill: ACCENT, type: ShadingType.CLEAR },
        width: { size: W_LABEL, type: WidthType.DXA },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        children: [new Paragraph({ children: [R("Transcript excerpt", { size: 20, bold: true, color: WHITE })] })],
      }),
    ],
  });

  const dataRows = ts.map((t, i) =>
    new TableRow({
      children: [
        new TableCell({
          borders: borderBottom(DIVIDER),
          shading: { fill: i % 2 === 0 ? WHITE : HIGHLIGHT, type: ShadingType.CLEAR },
          width: { size: W_TIME, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [new Paragraph({
            children: [R(t.display, { size: 20, bold: true, color: ACCENT })],
          })],
        }),
        new TableCell({
          borders: borderBottom(DIVIDER),
          shading: { fill: i % 2 === 0 ? WHITE : HIGHLIGHT, type: ShadingType.CLEAR },
          width: { size: W_LABEL, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [new Paragraph({
            children: [R(t.label || "", { size: 20, color: MID })],
          })],
        }),
      ],
    })
  );

  return [
    sectionHeading("Key Timestamps"),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [W_TIME, W_LABEL],
      rows: [headerRow, ...dataRows],
    }),
    empty(280, 0),
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// FOOTER
// ──────────────────────────────────────────────────────────────────────────
function buildFooter() {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          R("YouTube Insight Assistant", { size: 16, color: MUTED }),
          R("   ·   ", { size: 16, color: MUTED }),
          R(data.channel_name, { size: 16, color: MUTED }),
          R("     ", { size: 16 }),
          R("Page ", { size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: MUTED }),
          R(" of ", { size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: MUTED }),
        ],
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: DIVIDER, space: 1 } },
        spacing: { before: 120 },
      }),
    ],
  });
}

// ──────────────────────────────────────────────────────────────────────────
// ASSEMBLE & WRITE
// ──────────────────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "•",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 240 } } },
      }],
    }],
  },
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22, color: MID } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    footers: { default: buildFooter() },
    children: [
      ...buildCover(),
      ...buildSummary(),
      ...buildNotes(),
      ...buildTakeaways(),
      ...buildTimestamps(),
    ],
  }],
});

Packer.toBuffer(doc)
  .then(buf => {
    // Ensure output directory exists
    const dir = path.dirname(outPath);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, buf);
    console.log(`OK: ${outPath}`);
  })
  .catch(err => {
    console.error("DOCX generation error:", err);
    process.exit(1);
  });