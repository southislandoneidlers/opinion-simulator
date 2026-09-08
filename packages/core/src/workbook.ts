import * as zlib from "node:zlib";
import { isId } from "./ids";
import { FORBIDDEN_IPC_KEY } from "./ipc";

export interface Issue {
  code: string;
  path: string;
  message: string;
}

export interface ValidatedWorkbook {
  formatId: "v0.3-five-sheet-1";
  sources: Array<{
    title: string;
    text: string;
    enabled: boolean;
    sourceId: string;
  }>;
  questionSets: Array<{
    items: Array<{
      text: string;
      order: number;
    }>;
    questionSetId: string;
  }>;
  personas: Array<{
    label: string;
    rawInput: string;
    enabled: boolean;
    personaId: string;
  }>;
  batches: Array<{
    sourceId: string;
    questionSetId: string;
    sampleCount: number;
    batchId: string;
    rows: Array<{
      enabled: boolean;
      note?: string;
      personaId: string;
    }>;
  }>;
}

export type ValidateWorkbookResult =
  | { ok: true; workbook: ValidatedWorkbook; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] };

export interface ValidateWorkbookInput {
  bytes: Uint8Array;
  fileName?: string;
}

// Resource Caps (from docs/formats/workbook-input.md)
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MiB
const MAX_MEMBER_BYTES = 8 * 1024 * 1024; // 8 MiB
const MAX_TOTAL_UNCOMPRESSED_BYTES = 32 * 1024 * 1024; // 32 MiB
const MAX_ZIP_MEMBERS = 64;

const CAP_TITLE_LABEL = 200;
const CAP_PERSONA_RAW = 20000;
export const CAP_QUESTION_TEXT = 4000;
const CAP_SOURCE_TEXT = 100000;
const CAP_NOTE = 1000;
const CAP_TEXT_BUDGET = 400000;

const CAP_OCCUPIED_PERSONAS = 30;
const CAP_OCCUPIED_SOURCES = 100;
const CAP_OCCUPIED_QUESTIONS = 100;
const CAP_OCCUPIED_BATCH_ROWS = 100;
const CAP_TABLE_DATA_ROWS = 100;
export const CAP_QUESTIONS_PER_SET = 50;
const CAP_DISTINCT_BATCHES = 20;

const REQUIRED_SHEETS = ["使用說明", "Persona", "問題集", "材料", "執行清單"] as const;

const EXPECTED_TABLE_SHEET_MAP: Record<string, string> = {
  PersonaInputTable: "Persona",
  QuestionInputTable: "問題集",
  SourceInputTable: "材料",
  BatchInputTable: "執行清單"
};

const REQUIRED_TABLE_COLUMNS: Record<string, string[]> = {
  PersonaInputTable: ["personaId", "名稱", "背景描述", "啟用", "格式檢查"],
  QuestionInputTable: ["questionSetId", "順序", "問題內容", "格式檢查"],
  SourceInputTable: ["sourceId", "標題", "材料全文", "啟用", "格式檢查"],
  BatchInputTable: ["batchId", "personaId", "sourceId", "questionSetId", "樣本數", "啟用", "格式檢查", "管理備註"]
};

// Allowed zip members patterns
const ALLOWED_ZIP_MEMBER_PATTERNS = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/\.rels$/,
  /^xl\/workbook\.xml$/,
  /^xl\/_rels\/workbook\.xml\.rels$/,
  /^xl\/worksheets\/sheet\d+\.xml$/,
  /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/,
  /^xl\/tables\/table\d+\.xml$/,
  /^xl\/sharedStrings\.xml$/,
  /^xl\/styles\.xml$/,
  /^xl\/theme\/theme\d+\.xml$/,
  /^xl\/calcChain\.xml$/,
  /^docProps\/core\.xml$/,
  /^docProps\/app\.xml$/,
  /^docProps\/custom\.xml$/
];

function countCodePoints(str: string): number {
  return Array.from(str).length;
}

function normalizeNewlines(str: string): string {
  return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function decodeXmlCodePoint(value: number): string {
  if (value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return "\uFFFD";
  }
  return String.fromCodePoint(value);
}

function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, dec) => decodeXmlCodePoint(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => decodeXmlCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, "&");
}

function colLetterToIndex(colStr: string): number {
  let num = 0;
  for (let i = 0; i < colStr.length; i++) {
    num = num * 26 + (colStr.charCodeAt(i) - 64);
  }
  return num - 1;
}

interface CellRef {
  col: number;
  row: number;
  colStr: string;
}

function parseCellRef(ref: string): CellRef | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    col: colLetterToIndex(match[1]),
    row: parseInt(match[2], 10),
    colStr: match[1]
  };
}

interface RefRange {
  start: CellRef;
  end: CellRef;
}

function parseRefRange(rangeStr: string): RefRange | null {
  const parts = rangeStr.split(":");
  if (parts.length !== 2) return null;
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

interface ParsedCell {
  ref: string;
  col: number;
  row: number;
  type?: string;
  hasFormula: boolean;
  formula?: string;
  value?: string;
}

function parseSharedStrings(xmlStr?: string): string[] {
  if (!xmlStr) return [];
  const list: string[] = [];
  const siMatches = xmlStr.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g);
  for (const si of siMatches) {
    const siContent = si[1];
    let fullText = "";
    const tMatches = siContent.matchAll(/<(?:\w+:)?t(?:\s+[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g);
    for (const tm of tMatches) {
      fullText += unescapeXml(tm[1]);
    }
    list.push(fullText);
  }
  return list;
}

function parseWorksheetCells(xmlStr: string, sharedStrings: string[]): Map<string, ParsedCell> {
  const cells = new Map<string, ParsedCell>();
  const rowMatches = xmlStr.matchAll(/<(?:\w+:)?row\s+([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g);
  for (const rm of rowMatches) {
    const rowContent = rm[2];
    const cellMatches = rowContent.matchAll(/<(?:\w+:)?c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g);
    for (const cm of cellMatches) {
      const attrStr = cm[1];
      const inner = cm[2] || "";
      const rMatch = attrStr.match(/r="([A-Z0-9]+)"/);
      if (!rMatch) continue;
      const ref = rMatch[1];
      const tMatch = attrStr.match(/t="([^"]*)"/);
      const type = tMatch ? tMatch[1] : undefined;

      const fMatch = inner.match(/<(?:\w+:)?f(?:\s+[^>]*)?>([\s\S]*?)<\/(?:\w+:)?f>/);
      const formula = fMatch ? unescapeXml(fMatch[1]) : undefined;

      let value: string | undefined = undefined;
      if (type === "s") {
        const vMatch = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
        if (vMatch) {
          const idx = parseInt(vMatch[1], 10);
          value = sharedStrings[idx] ?? "";
        }
      } else if (type === "inlineStr") {
        let text = "";
        const tMatches = inner.matchAll(/<(?:\w+:)?t(?:\s+[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g);
        for (const tm of tMatches) {
          text += unescapeXml(tm[1]);
        }
        value = text;
      } else {
        const vMatch = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
        if (vMatch) {
          value = unescapeXml(vMatch[1]);
        }
      }

      const parsedRef = parseCellRef(ref);
      if (parsedRef) {
        cells.set(`${parsedRef.col},${parsedRef.row}`, {
          ref,
          col: parsedRef.col,
          row: parsedRef.row,
          type,
          hasFormula: Boolean(fMatch),
          formula,
          value
        });
      }
    }
  }
  return cells;
}

interface ParsedSheetInfo {
  name: string;
  rId: string;
  state: string;
}

function parseWorkbookXml(xmlStr: string): ParsedSheetInfo[] {
  const sheets: ParsedSheetInfo[] = [];
  const sheetMatches = xmlStr.matchAll(/<(?:\w+:)?sheet\s+([^>]+)\/?>/g);
  for (const match of sheetMatches) {
    const attrStr = match[1];
    const nameMatch = attrStr.match(/name="([^"]*)"/);
    const idMatch = attrStr.match(/r:id="([^"]*)"/);
    const stateMatch = attrStr.match(/state="([^"]*)"/);
    if (nameMatch && idMatch) {
      sheets.push({
        name: unescapeXml(nameMatch[1]),
        rId: idMatch[1],
        state: stateMatch ? stateMatch[1] : "visible"
      });
    }
  }
  return sheets;
}

interface RelItem {
  target: string;
  type: string;
}

function parseRelsXml(xmlStr: string): Record<string, RelItem> {
  const rels: Record<string, RelItem> = {};
  const matches = xmlStr.matchAll(/<Relationship\s+([^>]+)\/?>/g);
  for (const m of matches) {
    const attrStr = m[1];
    const idMatch = attrStr.match(/Id="([^"]*)"/);
    const targetMatch = attrStr.match(/Target="([^"]*)"/);
    const typeMatch = attrStr.match(/Type="([^"]*)"/);
    if (idMatch && targetMatch) {
      rels[idMatch[1]] = {
        target: targetMatch[1],
        type: typeMatch ? typeMatch[1] : ""
      };
    }
  }
  return rels;
}

interface ParsedTableInfo {
  name: string;
  ref: string;
  columns: string[];
}

function parseTableXml(xmlStr: string): ParsedTableInfo {
  const tableMatch = xmlStr.match(/<(?:\w+:)?table\s+([^>]+)>/);
  const nameMatch = tableMatch ? tableMatch[1].match(/name="([^"]*)"/) : null;
  const refMatch = tableMatch ? tableMatch[1].match(/ref="([^"]*)"/) : null;

  const columns: string[] = [];
  const colMatches = xmlStr.matchAll(/<(?:\w+:)?tableColumn\s+([^>]+)\/?>/g);
  for (const cm of colMatches) {
    const colNameMatch = cm[1].match(/name="([^"]*)"/);
    if (colNameMatch) {
      columns.push(unescapeXml(colNameMatch[1]));
    }
  }
  return {
    name: nameMatch ? unescapeXml(nameMatch[1]) : "",
    ref: refMatch ? refMatch[1] : "",
    columns
  };
}

function unpackZip(bytes: Uint8Array): { ok: true; files: Record<string, Buffer> } | { ok: false; error: Issue } {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  if (buf.length < 22) {
    return { ok: false, error: { code: "FILE_NOT_ZIP", path: "$zip", message: "檔案不是有效的 ZIP 封裝檔" } };
  }

  // Check for OLE compound document magic: D0 CF 11 E0 A1 B1 1A E1
  if (
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0 &&
    buf[4] === 0xa1 &&
    buf[5] === 0xb1 &&
    buf[6] === 0x1a &&
    buf[7] === 0xe1
  ) {
    return {
      ok: false,
      error: { code: "FILE_ENCRYPTED", path: "$zip", message: "不支援舊版二進位或複合檔案格式" }
    };
  }

  // Find End of Central Directory (EOCD) signature (0x06054b50)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return { ok: false, error: { code: "FILE_NOT_ZIP", path: "$zip", message: "檔案不是有效的 ZIP 封裝檔" } };
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  if (totalEntries > MAX_ZIP_MEMBERS) {
    return {
      ok: false,
      error: { code: "ZIP_TOO_MANY_ENTRIES", path: "$zip", message: `ZIP 成員數量 (${totalEntries}) 超過上限 (${MAX_ZIP_MEMBERS})` }
    };
  }

  if (cdOffset + cdSize > buf.length) {
    return { ok: false, error: { code: "ZIP_MALFORMED", path: "$zip", message: "ZIP 核心目錄結構損壞" } };
  }

  let offset = cdOffset;
  let totalUncompressedBytes = 0;
  const files: Record<string, Buffer> = {};

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      return { ok: false, error: { code: "ZIP_MALFORMED", path: "$zip", message: "ZIP 核心目錄標頭無效" } };
    }

    const flags = buf.readUInt16LE(offset + 8);
    // Bit 0 of general purpose bit flag is encryption
    if (flags & 0x0001) {
      return { ok: false, error: { code: "FILE_ENCRYPTED", path: "$zip", message: "不支援加密或受密碼保護的活頁簿" } };
    }

    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);

    if (offset + 46 + nameLen > buf.length) {
      return { ok: false, error: { code: "ZIP_MALFORMED", path: "$zip", message: "ZIP 檔名長度超出範圍" } };
    }

    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);

    if (uncompressedSize > MAX_MEMBER_BYTES) {
      return {
        ok: false,
        error: { code: "ZIP_MEMBER_TOO_LARGE", path: name, message: `ZIP 成員 ${name} 解壓後大小超過上限 (8 MiB)` }
      };
    }

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      return {
        ok: false,
        error: { code: "ZIP_BOMB", path: "$zip", message: `ZIP 解壓總量超過上限 (32 MiB)` }
      };
    }

    // Read local header
    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      return { ok: false, error: { code: "ZIP_MALFORMED", path: name, message: `ZIP 區域檔案標頭無效: ${name}` } };
    }

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

    if (dataStart + compressedSize > buf.length) {
      return { ok: false, error: { code: "ZIP_MALFORMED", path: name, message: `ZIP 資料偏移損壞: ${name}` } };
    }

    const compData = buf.subarray(dataStart, dataStart + compressedSize);
    let decompressed: Buffer;

    try {
      if (method === 8) {
        decompressed = zlib.inflateRawSync(compData, { maxOutputLength: MAX_MEMBER_BYTES });
      } else if (method === 0) {
        decompressed = Buffer.from(compData);
      } else {
        return {
          ok: false,
          error: { code: "ZIP_MALFORMED", path: name, message: `不支援的壓縮方法 (${method}): ${name}` }
        };
      }
    } catch {
      return { ok: false, error: { code: "ZIP_MALFORMED", path: name, message: `ZIP 解壓縮失敗: ${name}` } };
    }

    if (decompressed.length !== uncompressedSize) {
      return { ok: false, error: { code: "ZIP_MALFORMED", path: name, message: `ZIP 解壓大小不符: ${name}` } };
    }

    files[name] = decompressed;
    offset += 46 + nameLen + extraLen + commentLen;
  }

  return { ok: true, files };
}

export function validateWorkbook(input: ValidateWorkbookInput): ValidateWorkbookResult {
  const { bytes, fileName } = input;
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  // Check file empty
  if (!bytes || bytes.length === 0) {
    return {
      ok: false,
      errors: [{ code: "FILE_EMPTY", path: "$", message: "檔案內容為空" }],
      warnings
    };
  }

  // Check file size cap
  if (bytes.length > MAX_FILE_BYTES) {
    return {
      ok: false,
      errors: [{ code: "FILE_TOO_LARGE", path: "$", message: `檔案大小 (${bytes.length} bytes) 超過上限 (8 MiB)` }],
      warnings
    };
  }

  // Check file extension if fileName is provided
  if (fileName !== undefined) {
    if (!fileName.toLowerCase().endsWith(".xlsx")) {
      return {
        ok: false,
        errors: [{ code: "FILE_EXTENSION_INVALID", path: "$", message: "副檔名必須為 .xlsx" }],
        warnings
      };
    }
  }

  // Unpack ZIP
  const unzipResult = unpackZip(bytes);
  if (!unzipResult.ok) {
    return {
      ok: false,
      errors: [unzipResult.error],
      warnings
    };
  }

  const files = unzipResult.files;
  const memberNames = Object.keys(files);

  // Check member allow-list and disallowed parts
  for (const name of memberNames) {
    if (name.startsWith("xl/externalLinks/")) {
      errors.push({ code: "EXTERNAL_LINKS_PRESENT", path: name, message: "活頁簿不得包含外部連結" });
      continue;
    }
    if (/vbaProject|macrosheet|\.xlsm/i.test(name)) {
      errors.push({ code: "FILE_MACRO_ENABLED", path: name, message: "活頁簿不得包含巨集或 VBA 專案" });
      continue;
    }
    if (/embeddings|activeX|drawings|oleObject/i.test(name)) {
      errors.push({ code: "EMBEDDED_OBJECT_PRESENT", path: name, message: "活頁簿不得包含嵌入式物件或繪圖" });
      continue;
    }

    const isAllowed = ALLOWED_ZIP_MEMBER_PATTERNS.some((pat) => pat.test(name));
    if (!isAllowed) {
      errors.push({ code: "PACKAGE_UNEXPECTED_PART", path: name, message: `ZIP 包含未允許的成員: ${name}` });
    }
  }

  // Check [Content_Types].xml for macro types
  const contentTypesBuf = files["[Content_Types].xml"];
  if (contentTypesBuf) {
    const ctStr = contentTypesBuf.toString("utf8");
    if (/macroEnabled|vba/i.test(ctStr)) {
      errors.push({ code: "FILE_MACRO_ENABLED", path: "[Content_Types].xml", message: "內容類型宣告包含巨集" });
    }
  }

  // Check xl/workbook.xml exists
  const workbookBuf = files["xl/workbook.xml"];
  if (!workbookBuf) {
    errors.push({ code: "PACKAGE_MISSING_WORKBOOK", path: "xl/workbook.xml", message: "找不到 xl/workbook.xml" });
    return { ok: false, errors, warnings };
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  // Parse workbook.xml & rels
  const sheets = parseWorkbookXml(workbookBuf.toString("utf8"));
  const wbRelsBuf = files["xl/_rels/workbook.xml.rels"];
  const wbRels = wbRelsBuf ? parseRelsXml(wbRelsBuf.toString("utf8")) : {};

  // Check sheets
  const sheetNames = sheets.map((s) => s.name);
  const sheetNameCounts = new Map<string, number>();
  for (const name of sheetNames) {
    sheetNameCounts.set(name, (sheetNameCounts.get(name) ?? 0) + 1);
  }
  for (const reqSheet of REQUIRED_SHEETS) {
    if (!sheetNames.includes(reqSheet)) {
      errors.push({ code: "SHEET_MISSING", path: `workbook.sheets`, message: `缺少必要工作表: ${reqSheet}` });
    }
  }
  for (const [name, count] of sheetNameCounts) {
    if (count > 1) {
      errors.push({
        code: "SHEET_UNEXPECTED",
        path: `workbook.sheets[${name}]`,
        message: `工作表名稱重複: ${name}`
      });
    }
  }
  for (const s of sheets) {
    if (!REQUIRED_SHEETS.includes(s.name as (typeof REQUIRED_SHEETS)[number])) {
      errors.push({ code: "SHEET_UNEXPECTED", path: `workbook.sheets[${s.name}]`, message: `包含非預期的工作表: ${s.name}` });
    }
    if (s.state === "hidden" || s.state === "veryHidden") {
      errors.push({ code: "SHEET_HIDDEN", path: `workbook.sheets[${s.name}]`, message: `工作表不可為隱藏狀態: ${s.name}` });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"]?.toString("utf8"));

  const tablePartNameCounts = new Map<string, number>();
  for (const memberPath of memberNames) {
    if (!/^xl\/tables\/table\d+\.xml$/.test(memberPath)) continue;
    const tableName = parseTableXml(files[memberPath].toString("utf8")).name;
    tablePartNameCounts.set(tableName, (tablePartNameCounts.get(tableName) ?? 0) + 1);
  }
  for (const [tableName, count] of tablePartNameCounts) {
    if (!EXPECTED_TABLE_SHEET_MAP[tableName] || count > 1) {
      errors.push({
        code: "TABLE_UNEXPECTED",
        path: tableName || "xl/tables",
        message: !EXPECTED_TABLE_SHEET_MAP[tableName]
          ? `發現非預期的表格: ${tableName || "(未命名)"}`
          : `表格名稱重複: ${tableName}`
      });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  // Resolve sheet targets and find tables
  const sheetTableMap: Record<
    string,
    {
      sheetPath: string;
      table: ParsedTableInfo;
      cells: Map<string, ParsedCell>;
    }
  > = {};

  const discoveredTables = new Set<string>();

  for (const s of sheets) {
    const rel = wbRels[s.rId];
    if (!rel) continue;
    let targetPath = rel.target;
    if (targetPath.startsWith("/")) targetPath = targetPath.slice(1);
    if (!targetPath.startsWith("xl/")) targetPath = "xl/" + targetPath;

    const sheetXmlBuf = files[targetPath];
    if (!sheetXmlBuf) continue;

    const sheetRelsPath = targetPath.replace("xl/worksheets/", "xl/worksheets/_rels/") + ".rels";
    const sheetRelsBuf = files[sheetRelsPath];
    if (sheetRelsBuf) {
      const sheetRels = parseRelsXml(sheetRelsBuf.toString("utf8"));
      for (const rId in sheetRels) {
        let tTarget = sheetRels[rId].target;
        if (tTarget.startsWith("../")) tTarget = "xl/" + tTarget.slice(3);
        if (tTarget.startsWith("/")) tTarget = tTarget.slice(1);
        if (!tTarget.startsWith("xl/")) tTarget = "xl/" + tTarget;
        const tableBuf = files[tTarget];
        if (tableBuf) {
          const table = parseTableXml(tableBuf.toString("utf8"));
          discoveredTables.add(table.name);
          sheetTableMap[s.name] = {
            sheetPath: targetPath,
            table,
            cells: parseWorksheetCells(sheetXmlBuf.toString("utf8"), sharedStrings)
          };
        }
      }
    }
  }

  // Validate expected tables
  for (const [tableName, expectedSheet] of Object.entries(EXPECTED_TABLE_SHEET_MAP)) {
    const sheetData = sheetTableMap[expectedSheet];
    if (!sheetData || sheetData.table.name !== tableName) {
      errors.push({
        code: "TABLE_MISSING",
        path: expectedSheet,
        message: `在工作表 ${expectedSheet} 上找不到預期的表格 ${tableName}`
      });
    }
  }

  for (const tableName of discoveredTables) {
    if (!EXPECTED_TABLE_SHEET_MAP[tableName]) {
      errors.push({
        code: "TABLE_UNEXPECTED",
        path: tableName,
        message: `發現非預期的表格: ${tableName}`
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  // Validate table headers & columns
  for (const [tableName, expectedSheet] of Object.entries(EXPECTED_TABLE_SHEET_MAP)) {
    const table = sheetTableMap[expectedSheet].table;
    const requiredCols = REQUIRED_TABLE_COLUMNS[tableName];

    for (const reqCol of requiredCols) {
      if (!table.columns.includes(reqCol)) {
        errors.push({
          code: "TABLE_HEADER_MISSING",
          path: `${tableName}.${reqCol}`,
          message: `表格 ${tableName} 缺少必要欄位: ${reqCol}`
        });
      }
    }

    for (const col of table.columns) {
      if (!requiredCols.includes(col)) {
        errors.push({
          code: "TABLE_HEADER_UNEXPECTED",
          path: `${tableName}.${col}`,
          message: `表格 ${tableName} 包含非預期欄位: ${col}`
        });
      }
      if (FORBIDDEN_IPC_KEY.test(col)) {
        errors.push({
          code: "TABLE_HEADER_FORBIDDEN",
          path: `${tableName}.${col}`,
          message: `表格 ${tableName} 的欄位名稱 ${col} 包含禁止的憑證特徵`
        });
      }
    }

    // Check table range data rows
    const range = parseRefRange(table.ref);
    if (!range) {
      errors.push({ code: "TABLE_TOO_MANY_ROWS", path: tableName, message: `表格 ${tableName} 的範圍無效: ${table.ref}` });
    } else {
      const dataRowCount = range.end.row - range.start.row;
      if (dataRowCount > CAP_TABLE_DATA_ROWS) {
        errors.push({
          code: "TABLE_TOO_MANY_ROWS",
          path: tableName,
          message: `表格 ${tableName} 的資料列數 (${dataRowCount}) 超過上限 (${CAP_TABLE_DATA_ROWS})`
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  // Parse and extract table rows
  interface ExtractedRow {
    rowNumber: number;
    values: Record<string, string | undefined>;
    cells: Record<string, ParsedCell | undefined>;
  }

  function extractRows(sheetName: string, tableName: string): ExtractedRow[] {
    const sheetData = sheetTableMap[sheetName];
    const table = sheetData.table;
    const range = parseRefRange(table.ref)!;
    const colIndexMap: Record<string, number> = {};
    table.columns.forEach((colName, idx) => {
      colIndexMap[colName] = range.start.col + idx;
    });

    const rows: ExtractedRow[] = [];
    for (let r = range.start.row + 1; r <= range.end.row; r++) {
      let occupied = false;
      const values: Record<string, string | undefined> = {};
      const cells: Record<string, ParsedCell | undefined> = {};

      for (const colName of table.columns) {
        const cIdx = colIndexMap[colName];
        const cell = sheetData.cells.get(`${cIdx},${r}`);
        cells[colName] = cell;
        values[colName] = cell?.value;

        if (colName !== "格式檢查") {
          // Check for formula in user input column
          if (cell?.hasFormula) {
            errors.push({
              code: "CELL_FORMULA_IN_INPUT",
              path: `${tableName}[${r - range.start.row - 1}].${colName}`,
              message: `使用者輸入欄位 ${colName} 不得包含公式`
            });
          }
          const expectsNumber = colName === "順序" || colName === "樣本數";
          const hasExpectedLiteralType = expectsNumber
            ? cell?.type === undefined || cell?.type === "n"
            : cell?.type === "s" || cell?.type === "inlineStr" || cell?.type === "str";
          if (cell?.value !== undefined && !hasExpectedLiteralType) {
            errors.push({
              code: "CELL_TYPE_INVALID",
              path: `${tableName}[${r - range.start.row - 1}].${colName}`,
              message: expectsNumber
                ? `欄位 ${colName} 必須為數字型別 (${cell.type ?? "default"})`
                : `欄位 ${colName} 必須為文字型別 (${cell.type ?? "default"})`
            });
          }

          if (values[colName] !== undefined && String(values[colName]).trim().length > 0) {
            occupied = true;
          }
        }
      }

      if (occupied) {
        rows.push({ rowNumber: r, values, cells });
      }
    }
    return rows;
  }

  const personaRows = extractRows("Persona", "PersonaInputTable");
  const questionRows = extractRows("問題集", "QuestionInputTable");
  const sourceRows = extractRows("材料", "SourceInputTable");
  const batchRows = extractRows("執行清單", "BatchInputTable");

  // Check occupancy row limits
  if (personaRows.length > CAP_OCCUPIED_PERSONAS) {
    errors.push({
      code: "TOO_MANY_PERSONAS",
      path: "PersonaInputTable",
      message: `佔用的 Persona 列數 (${personaRows.length}) 超過上限 (${CAP_OCCUPIED_PERSONAS})`
    });
  }
  if (sourceRows.length > CAP_OCCUPIED_SOURCES) {
    errors.push({
      code: "TOO_MANY_OCCUPIED_ROWS",
      path: "SourceInputTable",
      message: `佔用的材料列數 (${sourceRows.length}) 超過上限 (${CAP_OCCUPIED_SOURCES})`
    });
  }
  if (questionRows.length > CAP_OCCUPIED_QUESTIONS) {
    errors.push({
      code: "TOO_MANY_OCCUPIED_ROWS",
      path: "QuestionInputTable",
      message: `佔用的問題列數 (${questionRows.length}) 超過上限 (${CAP_OCCUPIED_QUESTIONS})`
    });
  }
  if (batchRows.length > CAP_OCCUPIED_BATCH_ROWS) {
    errors.push({
      code: "TOO_MANY_OCCUPIED_ROWS",
      path: "BatchInputTable",
      message: `佔用的執行清單列數 (${batchRows.length}) 超過上限 (${CAP_OCCUPIED_BATCH_ROWS})`
    });
  }

  // 1. Validate Persona rows
  const parsedPersonas: Array<{
    label: string;
    rawInput: string;
    enabled: boolean;
    personaId: string;
  }> = [];
  const personaIdSet = new Set<string>();
  const personaMap = new Map<string, { enabled: boolean; label: string; rawInput: string }>();

  personaRows.forEach((r, idx) => {
    const rawId = r.values["personaId"];
    const rawName = r.values["名稱"];
    const rawDesc = r.values["背景描述"];
    const rawEnable = r.values["啟用"];

    // Check partially occupied
    if (
      rawId === undefined ||
      rawName === undefined ||
      rawDesc === undefined ||
      rawEnable === undefined ||
      rawId.trim().length === 0 ||
      rawName.trim().length === 0 ||
      rawDesc.trim().length === 0 ||
      rawEnable.trim().length === 0
    ) {
      errors.push({
        code: "ROW_PARTIAL",
        path: `PersonaInputTable[${idx}]`,
        message: `Persona 列第 ${r.rowNumber} 行缺少必要欄位`
      });
      return;
    }

    const personaId = rawId.trim();
    const label = rawName.trim();
    const rawInput = normalizeNewlines(rawDesc);
    const enableStr = rawEnable.trim();

    if (!isId(personaId)) {
      errors.push({
        code: "ID_INVALID",
        path: `PersonaInputTable[${idx}].personaId`,
        message: `personaId 格式無效: "${personaId}"`
      });
    } else if (personaIdSet.has(personaId)) {
      errors.push({
        code: "ID_DUPLICATE",
        path: `PersonaInputTable[${idx}].personaId`,
        message: `重複的 personaId: "${personaId}"`
      });
    } else {
      personaIdSet.add(personaId);
    }

    if (enableStr !== "是" && enableStr !== "否") {
      errors.push({
        code: "ENABLE_INVALID",
        path: `PersonaInputTable[${idx}].啟用`,
        message: `啟用欄位必須為「是」或「否」`
      });
    }

    if (countCodePoints(label) > CAP_TITLE_LABEL) {
      errors.push({
        code: "CELL_TOO_LONG",
        path: `PersonaInputTable[${idx}].名稱`,
        message: `名稱長度超過上限 (${CAP_TITLE_LABEL} 字元)`
      });
    }

    if (countCodePoints(rawInput) > CAP_PERSONA_RAW) {
      errors.push({
        code: "CELL_TOO_LONG",
        path: `PersonaInputTable[${idx}].背景描述`,
        message: `背景描述長度超過上限 (${CAP_PERSONA_RAW} 字元)`
      });
    }

    const enabled = enableStr === "是";
    parsedPersonas.push({ label, rawInput, enabled, personaId });
    personaMap.set(personaId, { enabled, label, rawInput });
  });

  // 2. Validate Question rows
  const questionSetMap = new Map<string, Array<{ text: string; order: number }>>();
  const questionSetOrderSet = new Map<string, Set<number>>();

  questionRows.forEach((r, idx) => {
    const rawSetId = r.values["questionSetId"];
    const rawOrder = r.values["順序"];
    const rawText = r.values["問題內容"];

    if (
      rawSetId === undefined ||
      rawOrder === undefined ||
      rawText === undefined ||
      rawSetId.trim().length === 0 ||
      rawOrder.trim().length === 0 ||
      rawText.trim().length === 0
    ) {
      errors.push({
        code: "ROW_PARTIAL",
        path: `QuestionInputTable[${idx}]`,
        message: `問題集列第 ${r.rowNumber} 行缺少必要欄位`
      });
      return;
    }

    const questionSetId = rawSetId.trim();
    const text = normalizeNewlines(rawText);
    const orderNum = Number(rawOrder.trim());

    if (!isId(questionSetId)) {
      errors.push({
        code: "ID_INVALID",
        path: `QuestionInputTable[${idx}].questionSetId`,
        message: `questionSetId 格式無效: "${questionSetId}"`
      });
    }

    if (!Number.isInteger(orderNum) || orderNum < 1 || orderNum > 1000) {
      errors.push({
        code: "QUESTION_ORDER_INVALID",
        path: `QuestionInputTable[${idx}].順序`,
        message: `順序必須為 1 到 1000 之整數`
      });
    } else {
      let orderSet = questionSetOrderSet.get(questionSetId);
      if (!orderSet) {
        orderSet = new Set<number>();
        questionSetOrderSet.set(questionSetId, orderSet);
      }
      if (orderSet.has(orderNum)) {
        errors.push({
          code: "QUESTION_ORDER_DUPLICATE",
          path: `QuestionInputTable[${idx}].順序`,
          message: `同一問題集 (${questionSetId}) 中有重複的順序: ${orderNum}`
        });
      } else {
        orderSet.add(orderNum);
      }
    }

    if (countCodePoints(text) > CAP_QUESTION_TEXT) {
      errors.push({
        code: "CELL_TOO_LONG",
        path: `QuestionInputTable[${idx}].問題內容`,
        message: `問題內容長度超過上限 (${CAP_QUESTION_TEXT} 字元)`
      });
    }

    let items = questionSetMap.get(questionSetId);
    if (!items) {
      items = [];
      questionSetMap.set(questionSetId, items);
    }
    items.push({ text, order: orderNum });
  });

  // Check question set items cap (max 50 per set)
  const parsedQuestionSets: Array<{
    items: Array<{ text: string; order: number }>;
    questionSetId: string;
  }> = [];

  for (const [questionSetId, items] of questionSetMap.entries()) {
    if (items.length > CAP_QUESTIONS_PER_SET) {
      errors.push({
        code: "TOO_MANY_QUESTIONS_IN_SET",
        path: `QuestionInputTable.${questionSetId}`,
        message: `問題集 ${questionSetId} 的問題數量 (${items.length}) 超過上限 (${CAP_QUESTIONS_PER_SET})`
      });
    }
    // Sort items by order ascending
    items.sort((a, b) => a.order - b.order);
    parsedQuestionSets.push({ items, questionSetId });
  }

  // 3. Validate Source rows
  const parsedSources: Array<{
    title: string;
    text: string;
    enabled: boolean;
    sourceId: string;
  }> = [];
  const sourceIdSet = new Set<string>();
  const sourceMap = new Map<string, { enabled: boolean; title: string; text: string }>();

  sourceRows.forEach((r, idx) => {
    const rawId = r.values["sourceId"];
    const rawTitle = r.values["標題"];
    const rawText = r.values["材料全文"];
    const rawEnable = r.values["啟用"];

    if (
      rawId === undefined ||
      rawTitle === undefined ||
      rawText === undefined ||
      rawEnable === undefined ||
      rawId.trim().length === 0 ||
      rawTitle.trim().length === 0 ||
      rawText.trim().length === 0 ||
      rawEnable.trim().length === 0
    ) {
      errors.push({
        code: "ROW_PARTIAL",
        path: `SourceInputTable[${idx}]`,
        message: `材料列第 ${r.rowNumber} 行缺少必要欄位`
      });
      return;
    }

    const sourceId = rawId.trim();
    const title = rawTitle.trim();
    const text = normalizeNewlines(rawText);
    const enableStr = rawEnable.trim();

    if (!isId(sourceId)) {
      errors.push({
        code: "ID_INVALID",
        path: `SourceInputTable[${idx}].sourceId`,
        message: `sourceId 格式無效: "${sourceId}"`
      });
    } else if (sourceIdSet.has(sourceId)) {
      errors.push({
        code: "ID_DUPLICATE",
        path: `SourceInputTable[${idx}].sourceId`,
        message: `重複的 sourceId: "${sourceId}"`
      });
    } else {
      sourceIdSet.add(sourceId);
    }

    if (enableStr !== "是" && enableStr !== "否") {
      errors.push({
        code: "ENABLE_INVALID",
        path: `SourceInputTable[${idx}].啟用`,
        message: `啟用欄位必須為「是」或「否」`
      });
    }

    if (countCodePoints(title) > CAP_TITLE_LABEL) {
      errors.push({
        code: "CELL_TOO_LONG",
        path: `SourceInputTable[${idx}].標題`,
        message: `標題長度超過上限 (${CAP_TITLE_LABEL} 字元)`
      });
    }

    if (countCodePoints(text) > CAP_SOURCE_TEXT) {
      errors.push({
        code: "CELL_TOO_LONG",
        path: `SourceInputTable[${idx}].材料全文`,
        message: `材料全文長度超過上限 (${CAP_SOURCE_TEXT} 字元)`
      });
    }

    const enabled = enableStr === "是";
    parsedSources.push({ title, text, enabled, sourceId });
    sourceMap.set(sourceId, { enabled, title, text });
  });

  // 4. Validate Batch rows
  const batchMap = new Map<
    string,
    {
      sourceId: string;
      questionSetId: string;
      sampleCount: number;
      batchId: string;
      rows: Array<{ enabled: boolean; note?: string; personaId: string }>;
      seenPersonas: Set<string>;
    }
  >();

  batchRows.forEach((r, idx) => {
    const rawBatchId = r.values["batchId"];
    const rawPersonaId = r.values["personaId"];
    const rawSourceId = r.values["sourceId"];
    const rawQSetId = r.values["questionSetId"];
    const rawSampleCount = r.values["樣本數"];
    const rawEnable = r.values["啟用"];
    const rawNote = r.values["管理備註"];

    if (
      rawBatchId === undefined ||
      rawPersonaId === undefined ||
      rawSourceId === undefined ||
      rawQSetId === undefined ||
      rawSampleCount === undefined ||
      rawEnable === undefined ||
      rawBatchId.trim().length === 0 ||
      rawPersonaId.trim().length === 0 ||
      rawSourceId.trim().length === 0 ||
      rawQSetId.trim().length === 0 ||
      rawSampleCount.trim().length === 0 ||
      rawEnable.trim().length === 0
    ) {
      errors.push({
        code: "ROW_PARTIAL",
        path: `BatchInputTable[${idx}]`,
        message: `執行清單列第 ${r.rowNumber} 行缺少必要欄位`
      });
      return;
    }

    const batchId = rawBatchId.trim();
    const personaId = rawPersonaId.trim();
    const sourceId = rawSourceId.trim();
    const questionSetId = rawQSetId.trim();
    const sampleCountNum = Number(rawSampleCount.trim());
    const enableStr = rawEnable.trim();
    const note = rawNote !== undefined && rawNote.trim().length > 0 ? rawNote.trim() : undefined;

    if (!isId(batchId)) {
      errors.push({
        code: "ID_INVALID",
        path: `BatchInputTable[${idx}].batchId`,
        message: `batchId 格式無效: "${batchId}"`
      });
    }

    if (!isId(personaId)) {
      errors.push({
        code: "ID_INVALID",
        path: `BatchInputTable[${idx}].personaId`,
        message: `personaId 格式無效: "${personaId}"`
      });
    }

    if (!isId(sourceId)) {
      errors.push({
        code: "ID_INVALID",
        path: `BatchInputTable[${idx}].sourceId`,
        message: `sourceId 格式無效: "${sourceId}"`
      });
    }

    if (!isId(questionSetId)) {
      errors.push({
        code: "ID_INVALID",
        path: `BatchInputTable[${idx}].questionSetId`,
        message: `questionSetId 格式無效: "${questionSetId}"`
      });
    }

    if (!Number.isInteger(sampleCountNum) || sampleCountNum < 1 || sampleCountNum > 100) {
      errors.push({
        code: "SAMPLE_COUNT_INVALID",
        path: `BatchInputTable[${idx}].樣本數`,
        message: `樣本數必須為 1 到 100 之整數`
      });
    }

    if (enableStr !== "是" && enableStr !== "否") {
      errors.push({
        code: "ENABLE_INVALID",
        path: `BatchInputTable[${idx}].啟用`,
        message: `啟用欄位必須為「是」或「否」`
      });
    }

    if (note && countCodePoints(note) > CAP_NOTE) {
      errors.push({
        code: "CELL_TOO_LONG",
        path: `BatchInputTable[${idx}].管理備註`,
        message: `管理備註長度超過上限 (${CAP_NOTE} 字元)`
      });
    }

    const enabled = enableStr === "是";

    // Check references
    const personaMeta = personaMap.get(personaId);
    if (!personaMeta) {
      errors.push({
        code: "PERSONA_NOT_FOUND",
        path: `BatchInputTable[${idx}].personaId`,
        message: `找不到參照的 Persona: "${personaId}"`
      });
    } else if (enabled && !personaMeta.enabled) {
      errors.push({
        code: "PERSONA_DISABLED",
        path: `BatchInputTable[${idx}].personaId`,
        message: `啟用的批次列參照了停用的 Persona: "${personaId}"`
      });
    }

    const sourceMeta = sourceMap.get(sourceId);
    if (!sourceMeta) {
      errors.push({
        code: "SOURCE_NOT_FOUND",
        path: `BatchInputTable[${idx}].sourceId`,
        message: `找不到參照的材料: "${sourceId}"`
      });
    } else if (enabled && !sourceMeta.enabled) {
      errors.push({
        code: "SOURCE_DISABLED",
        path: `BatchInputTable[${idx}].sourceId`,
        message: `啟用的批次列參照了停用的材料: "${sourceId}"`
      });
    }

    if (!questionSetMap.has(questionSetId)) {
      errors.push({
        code: "QUESTION_SET_NOT_FOUND",
        path: `BatchInputTable[${idx}].questionSetId`,
        message: `找不到參照的問題集: "${questionSetId}"`
      });
    }

    // Group into batch
    let batch = batchMap.get(batchId);
    if (!batch) {
      batch = {
        sourceId,
        questionSetId,
        sampleCount: sampleCountNum,
        batchId,
        rows: [],
        seenPersonas: new Set<string>()
      };
      batchMap.set(batchId, batch);
    } else {
      // Check consistency
      if (
        batch.sourceId !== sourceId ||
        batch.questionSetId !== questionSetId ||
        batch.sampleCount !== sampleCountNum
      ) {
        errors.push({
          code: "BATCH_INCONSISTENT",
          path: `BatchInputTable[${idx}].batchId`,
          message: `批次 ${batchId} 的材料、問題集或樣本數不一致`
        });
      }
    }

    if (batch.seenPersonas.has(personaId)) {
      errors.push({
        code: "ID_DUPLICATE",
        path: `BatchInputTable[${idx}].personaId`,
        message: `批次 ${batchId} 內包含重複的 personaId: "${personaId}"`
      });
    } else {
      batch.seenPersonas.add(personaId);
    }

    const rowObj: { enabled: boolean; note?: string; personaId: string } = {
      enabled,
      personaId
    };
    if (note !== undefined) {
      rowObj.note = note;
    }
    batch.rows.push(rowObj);
  });

  // Check distinct batch count limit (max 20)
  if (batchMap.size > CAP_DISTINCT_BATCHES) {
    errors.push({
      code: "TOO_MANY_BATCHES",
      path: "BatchInputTable",
      message: `不重複的批次數量 (${batchMap.size}) 超過上限 (${CAP_DISTINCT_BATCHES})`
    });
  }

  // Check enabled personas per enabled batch (1..30)
  const parsedBatches: Array<{
    sourceId: string;
    questionSetId: string;
    sampleCount: number;
    batchId: string;
    rows: Array<{ enabled: boolean; note?: string; personaId: string }>;
  }> = [];

  let totalEnabledBatchRows = 0;

  for (const [bId, batch] of batchMap.entries()) {
    const enabledRowCount = batch.rows.filter((r) => r.enabled).length;
    const hasAnyEnabled = enabledRowCount > 0;
    if (hasAnyEnabled) {
      totalEnabledBatchRows += enabledRowCount;
      if (enabledRowCount < 1 || enabledRowCount > 30) {
        errors.push({
          code: "BATCH_PERSONA_COUNT_INVALID",
          path: `BatchInputTable.${bId}`,
          message: `啟用的批次 ${bId} 必須包含 1 到 30 位啟用的 Persona（目前為 ${enabledRowCount}）`
        });
      }
    }
    parsedBatches.push({
      sourceId: batch.sourceId,
      questionSetId: batch.questionSetId,
      sampleCount: batch.sampleCount,
      batchId: batch.batchId,
      rows: batch.rows
    });
  }

  // Calculate sum of imported text budget
  let totalTextLength = 0;
  for (const p of parsedPersonas) {
    totalTextLength += countCodePoints(p.label) + countCodePoints(p.rawInput);
  }
  for (const s of parsedSources) {
    totalTextLength += countCodePoints(s.title) + countCodePoints(s.text);
  }
  for (const q of parsedQuestionSets) {
    for (const item of q.items) {
      totalTextLength += countCodePoints(item.text);
    }
  }
  for (const b of parsedBatches) {
    for (const r of b.rows) {
      if (r.note) {
        totalTextLength += countCodePoints(r.note);
      }
    }
  }

  if (totalTextLength > CAP_TEXT_BUDGET) {
    errors.push({
      code: "TEXT_BUDGET_EXCEEDED",
      path: "$",
      message: `匯入文字總字數 (${totalTextLength}) 超過上限 (${CAP_TEXT_BUDGET} 字元)`
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  // Check if no enabled batch row across workbook
  if (totalEnabledBatchRows === 0) {
    warnings.push({
      code: "NO_ENABLED_BATCH",
      path: "$",
      message: "活頁簿中沒有任何啟用的執行批次列"
    });
  }

  const workbook: ValidatedWorkbook = {
    formatId: "v0.3-five-sheet-1",
    sources: parsedSources,
    questionSets: parsedQuestionSets,
    personas: parsedPersonas,
    batches: parsedBatches
  };

  return {
    ok: true,
    workbook,
    warnings
  };
}
