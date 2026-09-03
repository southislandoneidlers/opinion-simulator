import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { validateWorkbook } from "./workbook";

const GOLDEN_TEMPLATE_PATH = path.resolve(
  __dirname,
  "../fixtures/workbook/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx"
);

function unpackZipForTest(buf: Buffer): Record<string, Buffer> {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  let offset = cdOffset;
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < totalEntries; i++) {
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compData = buf.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (method === 8) {
      data = zlib.inflateRawSync(compData);
    } else {
      data = Buffer.from(compData);
    }
    files[name] = data;
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function packZipForTest(files: Record<string, Buffer | string>): Buffer {
  const fileEntries: Array<{
    nameBuf: Buffer;
    compressedSize: number;
    uncompressedSize: number;
    offset: number;
  }> = [];
  let localOffset = 0;
  const localBuffers: Buffer[] = [];

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const rawData = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const compData = zlib.deflateRawSync(rawData);
    const uncompressedSize = rawData.length;
    const compressedSize = compData.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localBuffers.push(localHeader, nameBuf, compData);

    fileEntries.push({
      nameBuf,
      compressedSize,
      uncompressedSize,
      offset: localOffset
    });

    localOffset += 30 + nameBuf.length + compressedSize;
  }

  const cdStart = localOffset;
  const cdBuffers: Buffer[] = [];
  for (const entry of fileEntries) {
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0, 8);
    cdHeader.writeUInt16LE(8, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0, 14);
    cdHeader.writeUInt32LE(0, 16);
    cdHeader.writeUInt32LE(entry.compressedSize, 20);
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24);
    cdHeader.writeUInt16LE(entry.nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(entry.offset, 42);

    cdBuffers.push(cdHeader, entry.nameBuf);
    localOffset += 46 + entry.nameBuf.length;
  }

  const cdSize = localOffset - cdStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileEntries.length, 8);
  eocd.writeUInt16LE(fileEntries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localBuffers, ...cdBuffers, eocd]);
}

function snapshotDirectory(root: string): Array<{ path: string; sha256?: string; mtimeMs: number; type: string }> {
  const entries: Array<{ path: string; sha256?: string; mtimeMs: number; type: string }> = [];

  function visit(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") continue;
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath);
      const stat = fs.statSync(absolutePath);
      if (entry.isDirectory()) {
        entries.push({ path: relativePath, mtimeMs: stat.mtimeMs, type: "directory" });
        visit(absolutePath);
      } else if (entry.isFile()) {
        entries.push({
          path: relativePath,
          sha256: createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex"),
          mtimeMs: stat.mtimeMs,
          type: "file"
        });
      }
    }
  }

  visit(root);
  return entries;
}

describe("validateWorkbook", () => {
  const goldenBytes = fs.readFileSync(GOLDEN_TEMPLATE_PATH);

  it("validates golden template into 2-Persona ValidatedWorkbook with sampleCount 1 and no warnings", () => {
    const result = validateWorkbook({
      bytes: goldenBytes,
      fileName: "Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings).toEqual([]);
    expect(result.workbook.formatId).toBe("v0.3-five-sheet-1");

    expect(result.workbook.sources).toEqual([
      {
        title: "示範：校務政策草案",
        text: "請在此貼上要讓多位 Persona 閱讀並回應的完整材料。此示範文字可直接刪除。",
        enabled: true,
        sourceId: "source-001"
      }
    ]);

    expect(result.workbook.questionSets).toEqual([
      {
        items: [
          { text: "這項計畫可能帶來哪些直接影響？", order: 1 },
          { text: "執行前最需要補充哪一項資訊？", order: 2 }
        ],
        questionSetId: "questions-001"
      }
    ]);

    expect(result.workbook.personas).toEqual([
      {
        label: "示範校長",
        rawInput: "公立中學校長；重視學生安全、行政可行性與家長溝通。",
        enabled: true,
        personaId: "persona-001"
      },
      {
        label: "示範教師",
        rawInput: "中學教師；重視教學負擔、學生參與及數位工具的實際可用性。",
        enabled: true,
        personaId: "persona-002"
      }
    ]);

    expect(result.workbook.batches).toEqual([
      {
        sourceId: "source-001",
        questionSetId: "questions-001",
        sampleCount: 1,
        batchId: "batch-001",
        rows: [
          {
            enabled: true,
            personaId: "persona-001",
            note: "同批次中的第一位 Persona。"
          },
          {
            enabled: true,
            personaId: "persona-002",
            note: "同批次中的第二位 Persona。"
          }
        ]
      }
    ]);
  });

  it("validates a batch of one enabled Persona", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    // Disable persona-002 in batch
    let batchSheet = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    batchSheet = batchSheet.replace(
      /(<x:c r="A6"[^>]*><x:v>batch-001<\/x:v><\/x:c><x:c r="B6"[^>]*><x:v>persona-002<\/x:v><\/x:c><x:c r="C6"[^>]*><x:v>source-001<\/x:v><\/x:c><x:c r="D6"[^>]*><x:v>questions-001<\/x:v><\/x:c><x:c r="E6"[^>]*><x:v>1<\/x:v><\/x:c><x:c r="F6"[^>]*><x:v>)是(<\/x:v><\/x:c>)/,
      "$1否$2"
    );
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(batchSheet, "utf8");
    const testBytes = packZipForTest(rawFiles);

    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.workbook.batches[0].rows).toEqual([
      { enabled: true, personaId: "persona-001", note: "同批次中的第一位 Persona。" },
      { enabled: false, personaId: "persona-002", note: "同批次中的第二位 Persona。" }
    ]);
  });

  it("accepts exactly 30 occupied Personas in a batch, but rejects 31 with TOO_MANY_PERSONAS", () => {
    const rawFiles = unpackZipForTest(goldenBytes);

    // Build 30 personas in sheet2 and sheet5
    let sheet2Rows = "";
    let sheet5Rows = "";
    for (let i = 1; i <= 30; i++) {
      const pId = `persona-${String(i).padStart(3, "0")}`;
      const r = i + 4;
      sheet2Rows += `<x:row r="${r}" ht="34" customHeight="1"><x:c r="A${r}" s="35" t="str"><x:v>${pId}</x:v></x:c><x:c r="B${r}" s="35" t="str"><x:v>角色${i}</x:v></x:c><x:c r="C${r}" s="35" t="str"><x:v>描述${i}</x:v></x:c><x:c r="D${r}" s="35" t="str"><x:v>是</x:v></x:c><x:c r="E${r}" s="39" t="str"><x:v>可匯入</x:v></x:c></x:row>`;
      sheet5Rows += `<x:row r="${r}" ht="34" customHeight="1"><x:c r="A${r}" s="35" t="str"><x:v>batch-001</x:v></x:c><x:c r="B${r}" s="35" t="str"><x:v>${pId}</x:v></x:c><x:c r="C${r}" s="35" t="str"><x:v>source-001</x:v></x:c><x:c r="D${r}" s="35" t="str"><x:v>questions-001</x:v></x:c><x:c r="E${r}" s="40" t="n"><x:v>1</x:v></x:c><x:c r="F${r}" s="35" t="str"><x:v>是</x:v></x:c><x:c r="G${r}" s="39" t="str"><x:v>可匯入</x:v></x:c><x:c r="H${r}" s="35" t="str"><x:v>備註${i}</x:v></x:c></x:row>`;
    }

    const baseSheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    const prefix2 = baseSheet2.slice(0, baseSheet2.indexOf('<x:row r="5"'));
    const suffix2 = baseSheet2.slice(baseSheet2.indexOf("</x:sheetData>"));
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(prefix2 + sheet2Rows + suffix2, "utf8");

    const baseSheet5 = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    const prefix5 = baseSheet5.slice(0, baseSheet5.indexOf('<x:row r="5"'));
    const suffix5 = baseSheet5.slice(baseSheet5.indexOf("</x:sheetData>"));
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(prefix5 + sheet5Rows + suffix5, "utf8");

    const bytes30 = packZipForTest(rawFiles);
    const result30 = validateWorkbook({ bytes: bytes30 });
    expect(result30.ok).toBe(true);
    if (result30.ok) {
      expect(result30.workbook.personas.length).toBe(30);
      expect(result30.workbook.batches[0].rows.length).toBe(30);
    }

    // Now add 31st persona
    const r35 = 35;
    const extraRow2 = `<x:row r="${r35}" ht="34" customHeight="1"><x:c r="A${r35}" s="35" t="str"><x:v>persona-031</x:v></x:c><x:c r="B${r35}" s="35" t="str"><x:v>角色31</x:v></x:c><x:c r="C${r35}" s="35" t="str"><x:v>描述31</x:v></x:c><x:c r="D${r35}" s="35" t="str"><x:v>是</x:v></x:c><x:c r="E${r35}" s="39" t="str"><x:v>可匯入</x:v></x:c></x:row>`;
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(prefix2 + sheet2Rows + extraRow2 + suffix2, "utf8");
    const bytes31 = packZipForTest(rawFiles);
    const result31 = validateWorkbook({ bytes: bytes31 });
    expect(result31.ok).toBe(false);
    if (!result31.ok) {
      expect(result31.errors.some((e) => e.code === "TOO_MANY_PERSONAS")).toBe(true);
    }
  });

  it("skips completely empty user-input rows even if formula column is populated", () => {
    const result = validateWorkbook({ bytes: goldenBytes });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workbook.personas.length).toBe(2);
      expect(result.workbook.sources.length).toBe(1);
      expect(result.workbook.questionSets[0].items.length).toBe(2);
      expect(result.workbook.batches[0].rows.length).toBe(2);
    }
  });

  it("rejects empty file with FILE_EMPTY", () => {
    const result = validateWorkbook({ bytes: new Uint8Array(0) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("FILE_EMPTY");
    }
  });

  it("rejects file exceeding size cap with FILE_TOO_LARGE", () => {
    const large = new Uint8Array(8 * 1024 * 1024 + 1);
    const result = validateWorkbook({ bytes: large });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("FILE_TOO_LARGE");
    }
  });

  it("rejects non-xlsx extension with FILE_EXTENSION_INVALID", () => {
    const result = validateWorkbook({ bytes: goldenBytes, fileName: "test.csv" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("FILE_EXTENSION_INVALID");
    }
  });

  it("rejects non-zip file with FILE_NOT_ZIP", () => {
    const notZip = Buffer.from("this is just plain text content");
    const result = validateWorkbook({ bytes: notZip });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("FILE_NOT_ZIP");
    }
  });

  it("rejects OLE compound file with FILE_ENCRYPTED", () => {
    const ole = Buffer.alloc(100);
    ole[0] = 0xd0;
    ole[1] = 0xcf;
    ole[2] = 0x11;
    ole[3] = 0xe0;
    ole[4] = 0xa1;
    ole[5] = 0xb1;
    ole[6] = 0x1a;
    ole[7] = 0xe1;
    const result = validateWorkbook({ bytes: ole });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("FILE_ENCRYPTED");
    }
  });

  it("rejects macro-enabled files with FILE_MACRO_ENABLED", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    rawFiles["xl/vbaProject.bin"] = Buffer.from("dummy vba");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "FILE_MACRO_ENABLED")).toBe(true);
    }
  });

  it("rejects external links with EXTERNAL_LINKS_PRESENT", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    rawFiles["xl/externalLinks/externalLink1.xml"] = Buffer.from("<dummy/>");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "EXTERNAL_LINKS_PRESENT")).toBe(true);
    }
  });

  it("rejects embedded objects with EMBEDDED_OBJECT_PRESENT", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    rawFiles["xl/embeddings/oleObject1.bin"] = Buffer.from("dummy ole");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "EMBEDDED_OBJECT_PRESENT")).toBe(true);
    }
  });

  it("rejects unexpected parts outside allow-list with PACKAGE_UNEXPECTED_PART", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    rawFiles["xl/randomUnknownFile.txt"] = Buffer.from("unknown");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "PACKAGE_UNEXPECTED_PART")).toBe(true);
    }
  });

  it("rejects unlinked extra table parts with TABLE_UNEXPECTED", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    rawFiles["xl/tables/table99.xml"] = Buffer.from(
      '<x:table xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="ExtraTable" ref="A1:A1"><x:tableColumns count="1"><x:tableColumn id="1" name="extra" /></x:tableColumns></x:table>',
      "utf8"
    );
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "TABLE_UNEXPECTED")).toBe(true);
    }
  });

  it("rejects hidden sheets with SHEET_HIDDEN", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let wb = rawFiles["xl/workbook.xml"].toString("utf8");
    wb = wb.replace('name="Persona"', 'name="Persona" state="hidden"');
    rawFiles["xl/workbook.xml"] = Buffer.from(wb, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SHEET_HIDDEN")).toBe(true);
    }
  });

  it("rejects extra sheets with SHEET_UNEXPECTED", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let wb = rawFiles["xl/workbook.xml"].toString("utf8");
    wb = wb.replace(
      '</x:sheets>',
      '<x:sheet name="額外工作表" sheetId="6" r:id="Rextra" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets>'
    );
    rawFiles["xl/workbook.xml"] = Buffer.from(wb, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SHEET_UNEXPECTED")).toBe(true);
    }
  });

  it("rejects a duplicate required sheet with SHEET_UNEXPECTED", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let wb = rawFiles["xl/workbook.xml"].toString("utf8");
    wb = wb.replace(/(<x:sheet name="Persona"[^>]*\/>)/, "$1$1");
    rawFiles["xl/workbook.xml"] = Buffer.from(wb, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SHEET_UNEXPECTED")).toBe(true);
    }
  });

  it("rejects missing required sheets with SHEET_MISSING", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let wb = rawFiles["xl/workbook.xml"].toString("utf8");
    wb = wb.replace(/<x:sheet name="材料"[^>]*\/>/, "");
    rawFiles["xl/workbook.xml"] = Buffer.from(wb, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SHEET_MISSING")).toBe(true);
    }
  });

  it("rejects formulas in user-input columns with CELL_FORMULA_IN_INPUT", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    // Inject a formula in personaId (A5)
    sheet2 = sheet2.replace(
      '<x:c r="A5" s="35" t="str"><x:v>persona-001</x:v></x:c>',
      '<x:c r="A5" s="35" t="str"><x:f>CONCATENATE("persona-","001")</x:f><x:v>persona-001</x:v></x:c>'
    );
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(sheet2, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "CELL_FORMULA_IN_INPUT")).toBe(true);
    }
  });

  it("rejects numeric literals in text-only fields with CELL_TYPE_INVALID", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    sheet2 = sheet2.replace(
      '<x:c r="B5" s="35" t="str"><x:v>示範校長</x:v></x:c>',
      '<x:c r="B5" s="35" t="n"><x:v>123</x:v></x:c>'
    );
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(sheet2, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "CELL_TYPE_INVALID")).toBe(true);
    }
  });

  it("preserves supplementary Unicode character references in string literals", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    sheet2 = sheet2.replace("示範校長", "&#x1F600;");
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(sheet2, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workbook.personas[0].label).toBe("😀");
    }
  });

  it("rejects string literals in numeric-only fields with CELL_TYPE_INVALID", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet5 = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    sheet5 = sheet5.replace(
      '<x:c r="E5" s="40" t="n"><x:v>1</x:v></x:c>',
      '<x:c r="E5" s="40" t="str"><x:v>1</x:v></x:c>'
    );
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "CELL_TYPE_INVALID")).toBe(true);
    }
  });

  it("rejects credential-shaped column names with TABLE_HEADER_FORBIDDEN", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let table1 = rawFiles["xl/tables/table1.xml"].toString("utf8");
    table1 = table1.replace('name="名稱"', 'name="apiKey"');
    rawFiles["xl/tables/table1.xml"] = Buffer.from(table1, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "TABLE_HEADER_FORBIDDEN")).toBe(true);
    }
  });

  it("rejects out-of-range sample counts (0 and 101) with SAMPLE_COUNT_INVALID", () => {
    const rawFiles0 = unpackZipForTest(goldenBytes);
    let sheet5_0 = rawFiles0["xl/worksheets/sheet5.xml"].toString("utf8");
    sheet5_0 = sheet5_0.replace(/<x:c r="E5"[^>]*><x:v>1<\/x:v><\/x:c>/, '<x:c r="E5" s="40" t="n"><x:v>0</x:v></x:c>');
    rawFiles0["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5_0, "utf8");
    const bytes0 = packZipForTest(rawFiles0);
    const result0 = validateWorkbook({ bytes: bytes0 });
    expect(result0.ok).toBe(false);
    if (!result0.ok) {
      expect(result0.errors.some((e) => e.code === "SAMPLE_COUNT_INVALID")).toBe(true);
    }

    const rawFiles101 = unpackZipForTest(goldenBytes);
    let sheet5_101 = rawFiles101["xl/worksheets/sheet5.xml"].toString("utf8");
    sheet5_101 = sheet5_101.replace(/<x:c r="E5"[^>]*><x:v>1<\/x:v><\/x:c>/, '<x:c r="E5" s="40" t="n"><x:v>101</x:v></x:c>');
    rawFiles101["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5_101, "utf8");
    const bytes101 = packZipForTest(rawFiles101);
    const result101 = validateWorkbook({ bytes: bytes101 });
    expect(result101.ok).toBe(false);
    if (!result101.ok) {
      expect(result101.errors.some((e) => e.code === "SAMPLE_COUNT_INVALID")).toBe(true);
    }
  });

  it("rejects enabled batch row pointing at disabled Persona with PERSONA_DISABLED", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    // Disable persona-001 in sheet2 (D5)
    sheet2 = sheet2.replace('<x:c r="D5" s="35" t="str"><x:v>是</x:v></x:c>', '<x:c r="D5" s="35" t="str"><x:v>否</x:v></x:c>');
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(sheet2, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "PERSONA_DISABLED")).toBe(true);
    }
  });

  it("rejects enabled batch row pointing at missing Persona with PERSONA_NOT_FOUND", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet5 = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    sheet5 = sheet5.replace('<x:c r="B5" s="35" t="str"><x:v>persona-001</x:v></x:c>', '<x:c r="B5" s="35" t="str"><x:v>nonexistent</x:v></x:c>');
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "PERSONA_NOT_FOUND")).toBe(true);
    }
  });

  it("rejects inconsistent batch definition with BATCH_INCONSISTENT", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet5 = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    // Change sample count of row 6 to 3 while row 5 has 1
    sheet5 = sheet5.replace(/<x:c r="E6"[^>]*><x:v>1<\/x:v><\/x:c>/, '<x:c r="E6" s="40" t="n"><x:v>3</x:v></x:c>');
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "BATCH_INCONSISTENT")).toBe(true);
    }
  });

  it("rejects duplicate personaId within the same batch with ID_DUPLICATE", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet5 = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    // Change personaId of row 6 to persona-001
    sheet5 = sheet5.replace('<x:c r="B6" s="35" t="str"><x:v>persona-002</x:v></x:c>', '<x:c r="B6" s="35" t="str"><x:v>persona-001</x:v></x:c>');
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "ID_DUPLICATE")).toBe(true);
    }
  });

  it("warns with NO_ENABLED_BATCH when workbook is valid but all batch rows are disabled", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet5 = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    sheet5 = sheet5.replace('<x:c r="F5" s="35" t="str"><x:v>是</x:v></x:c>', '<x:c r="F5" s="35" t="str"><x:v>否</x:v></x:c>');
    sheet5 = sheet5.replace('<x:c r="F6" s="35" t="str"><x:v>是</x:v></x:c>', '<x:c r="F6" s="35" t="str"><x:v>否</x:v></x:c>');
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.some((w) => w.code === "NO_ENABLED_BATCH")).toBe(true);
    }
  });

  it("rejects duplicate sourceId with ID_DUPLICATE", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet4 = rawFiles["xl/worksheets/sheet4.xml"].toString("utf8");
    // Duplicate row 5 into row 6
    const row6 = '<x:row r="6" ht="34" customHeight="1"><x:c r="A6" s="35" t="str"><x:v>source-001</x:v></x:c><x:c r="B6" s="35" t="str"><x:v>標題2</x:v></x:c><x:c r="C6" s="35" t="str"><x:v>內容2</x:v></x:c><x:c r="D6" s="35" t="str"><x:v>是</x:v></x:c><x:c r="E6" s="39" t="str"><x:v>可匯入</x:v></x:c></x:row>';
    sheet4 = sheet4.replace('</x:sheetData>', row6 + '</x:sheetData>');
    rawFiles["xl/worksheets/sheet4.xml"] = Buffer.from(sheet4, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "ID_DUPLICATE")).toBe(true);
    }
  });

  it("rejects duplicate question order with QUESTION_ORDER_DUPLICATE", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet3 = rawFiles["xl/worksheets/sheet3.xml"].toString("utf8");
    // Change order of row 6 from 2 to 1
    sheet3 = sheet3.replace('<x:c r="B6" s="40" t="n"><x:v>2</x:v></x:c>', '<x:c r="B6" s="40" t="n"><x:v>1</x:v></x:c>');
    rawFiles["xl/worksheets/sheet3.xml"] = Buffer.from(sheet3, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "QUESTION_ORDER_DUPLICATE")).toBe(true);
    }
  });

  it("rejects invalid enable value with ENABLE_INVALID", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    sheet2 = sheet2.replace('<x:c r="D5" s="35" t="str"><x:v>是</x:v></x:c>', '<x:c r="D5" s="35" t="str"><x:v>TRUE</x:v></x:c>');
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(sheet2, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "ENABLE_INVALID")).toBe(true);
    }
  });

  it("rejects disabled Source in enabled batch with SOURCE_DISABLED", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet4 = rawFiles["xl/worksheets/sheet4.xml"].toString("utf8");
    sheet4 = sheet4.replace('<x:c r="D5" s="35" t="str"><x:v>是</x:v></x:c>', '<x:c r="D5" s="35" t="str"><x:v>否</x:v></x:c>');
    rawFiles["xl/worksheets/sheet4.xml"] = Buffer.from(sheet4, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "SOURCE_DISABLED")).toBe(true);
    }
  });

  it("rejects missing QuestionSet reference in batch with QUESTION_SET_NOT_FOUND", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet5 = rawFiles["xl/worksheets/sheet5.xml"].toString("utf8");
    sheet5 = sheet5.replace('<x:c r="D5" s="35" t="str"><x:v>questions-001</x:v></x:c>', '<x:c r="D5" s="35" t="str"><x:v>questions-nonexistent</x:v></x:c>');
    rawFiles["xl/worksheets/sheet5.xml"] = Buffer.from(sheet5, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "QUESTION_SET_NOT_FOUND")).toBe(true);
    }
  });

  it("rejects missing table with TABLE_MISSING", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let table1 = rawFiles["xl/tables/table1.xml"].toString("utf8");
    table1 = table1.replace('name="PersonaInputTable"', 'name="WrongTable"');
    rawFiles["xl/tables/table1.xml"] = Buffer.from(table1, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "TABLE_MISSING" || e.code === "TABLE_UNEXPECTED")).toBe(true);
    }
  });

  it("rejects missing table header with TABLE_HEADER_MISSING", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let table1 = rawFiles["xl/tables/table1.xml"].toString("utf8");
    table1 = table1.replace('<x:tableColumn id="2" name="名稱" />', "");
    rawFiles["xl/tables/table1.xml"] = Buffer.from(table1, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "TABLE_HEADER_MISSING")).toBe(true);
    }
  });

  it("rejects partial row with ROW_PARTIAL", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    // Remove name cell in row 5
    sheet2 = sheet2.replace('<x:c r="B5" s="35" t="str"><x:v>示範校長</x:v></x:c>', '');
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(sheet2, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "ROW_PARTIAL")).toBe(true);
    }
  });

  it("rejects overlong Persona label with CELL_TOO_LONG", () => {
    const rawFiles = unpackZipForTest(goldenBytes);
    let sheet2 = rawFiles["xl/worksheets/sheet2.xml"].toString("utf8");
    const longLabel = "校".repeat(201);
    sheet2 = sheet2.replace('<x:c r="B5" s="35" t="str"><x:v>示範校長</x:v></x:c>', `<x:c r="B5" s="35" t="str"><x:v>${longLabel}</x:v></x:c>`);
    rawFiles["xl/worksheets/sheet2.xml"] = Buffer.from(sheet2, "utf8");
    const testBytes = packZipForTest(rawFiles);
    const result = validateWorkbook({ bytes: testBytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "CELL_TOO_LONG")).toBe(true);
    }
  });

  it("does not mutate the working tree or a temporary Project directory", () => {
    const workspaceRoot = path.resolve(__dirname, "../../..");
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opinion-simulator-workbook-"));
    const temporaryProject = path.join(temporaryRoot, "project");
    fs.mkdirSync(temporaryProject);
    fs.writeFileSync(path.join(temporaryProject, "project.json"), '{"schemaVersion":"0.0"}\n');
    fs.writeFileSync(path.join(temporaryProject, "marker.txt"), "must remain unchanged\n");

    const beforeWorkspace = snapshotDirectory(workspaceRoot);
    const beforeProject = snapshotDirectory(temporaryProject);
    try {
      const result = validateWorkbook({ bytes: goldenBytes });
      expect(result.ok).toBe(true);
      expect(snapshotDirectory(workspaceRoot)).toEqual(beforeWorkspace);
      expect(snapshotDirectory(temporaryProject)).toEqual(beforeProject);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
