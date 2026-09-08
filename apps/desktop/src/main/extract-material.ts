import { promises as fs } from "node:fs";
import { basename, extname } from "node:path";
import * as zlib from "node:zlib";

/**
 * v0.3 increment 3: File extraction and preview (PDF, DOCX, TXT, Markdown).
 *
 * Safely extracts plain text from supported document formats without external
 * native binaries. Caps file size at 8 MiB and extracted text at 100,000
 * characters (matching CAP_SOURCE_TEXT).
 */

export const MAX_MATERIAL_FILE_BYTES = 8 * 1024 * 1024; // 8 MiB
export const MAX_MATERIAL_TEXT_CHARS = 100_000;

export type MaterialFormat = "txt" | "md" | "docx" | "pdf";

export interface ExtractedMaterial {
  format: MaterialFormat;
  fileName: string;
  text: string;
  characterCount: number;
}

function normalizeNewlines(str: string): string {
  return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&amp;/g, "&");
}

/**
 * Safe ZIP unpacker looking for specific members in a DOCX archive.
 */
function extractDocxDocumentXml(buffer: Buffer): string {
  // Find End of Central Directory (EOCD)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("無法解析 DOCX 壓縮結構（找不到 EOCD）");
  }

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLen);
    if (name === "word/document.xml") {
      if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("DOCX 內容區域標頭損壞");
      }
      const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compData = buffer.subarray(dataStart, dataStart + compressedSize);

      let decompressed: Buffer;
      if (method === 8) {
        decompressed = zlib.inflateRawSync(compData, { maxOutputLength: MAX_MATERIAL_FILE_BYTES });
      } else if (method === 0) {
        decompressed = Buffer.from(compData);
      } else {
        throw new Error(`不支援的壓縮格式 (${method})`);
      }
      return decompressed.toString("utf8");
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("DOCX 檔案缺少 word/document.xml");
}

export function extractTextFromDocxXml(xml: string): string {
  const paragraphs: string[] = [];
  // Match each <w:p> paragraph block
  const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[1];
    // Inside paragraph, match all <w:t> tags
    const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    let pText = "";
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      pText += tMatch[1];
    }
    if (pText.trim()) {
      paragraphs.push(unescapeXml(pText));
    }
  }
  return paragraphs.join("\n\n");
}

function decodePdfString(raw: string): string {
  // Decode octal escapes \ddd and standard escapes
  let decoded = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next >= "0" && next <= "7") {
        let octal = next;
        let j = i + 2;
        while (j < raw.length && j <= i + 3 && raw[j] >= "0" && raw[j] <= "7") {
          octal += raw[j];
          j++;
        }
        decoded += String.fromCharCode(parseInt(octal, 8));
        i = j - 1;
      } else if (next === "n") {
        decoded += "\n";
        i++;
      } else if (next === "r") {
        decoded += "\r";
        i++;
      } else if (next === "t") {
        decoded += "\t";
        i++;
      } else if (next === "b") {
        decoded += "\b";
        i++;
      } else if (next === "f") {
        decoded += "\f";
        i++;
      } else if (next === "(" || next === ")" || next === "\\") {
        decoded += next;
        i++;
      } else {
        decoded += next;
        i++;
      }
    } else {
      decoded += raw[i];
    }
  }

  // Check UTF-16BE BOM (\xFE\xFF)
  if (decoded.length >= 2 && decoded.charCodeAt(0) === 0xfe && decoded.charCodeAt(1) === 0xff) {
    let utf16 = "";
    for (let i = 2; i + 1 < decoded.length; i += 2) {
      const code = (decoded.charCodeAt(i) << 8) | decoded.charCodeAt(i + 1);
      utf16 += String.fromCharCode(code);
    }
    return utf16;
  }
  return decoded;
}

export function extractTextFromPdfBuffer(buffer: Buffer): string {
  const textChunks: string[] = [];
  const str = buffer.toString("binary");

  // Find all streams: stream ... endstream
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch: RegExpExecArray | null;

  while ((streamMatch = streamRegex.exec(str)) !== null) {
    const streamStart = streamMatch.index;
    // Check preceding dictionary to see if FlateDecode is used
    const dictHeader = str.slice(Math.max(0, streamStart - 400), streamStart);
    const rawData = Buffer.from(streamMatch[1], "binary");
    let contentStr = "";

    if (dictHeader.includes("/FlateDecode")) {
      try {
        contentStr = zlib
          .inflateSync(rawData, { maxOutputLength: MAX_MATERIAL_FILE_BYTES })
          .toString("binary");
      } catch (inflateError) {
        try {
          contentStr = zlib
            .inflateRawSync(rawData, { maxOutputLength: MAX_MATERIAL_FILE_BYTES })
            .toString("binary");
        } catch (rawError) {
          const message = `${inflateError instanceof Error ? inflateError.message : ""} ${
            rawError instanceof Error ? rawError.message : ""
          }`;
          if (/maxOutputLength|larger than|too large|buffer/i.test(message)) {
            throw new Error("PDF 解壓縮內容超過上限（8 MiB）");
          }
          continue;
        }
      }
    } else {
      contentStr = streamMatch[1];
    }

    // Extract text between BT and ET
    const btRegex = /BT([\s\S]*?)ET/g;
    let btMatch: RegExpExecArray | null;
    while ((btMatch = btRegex.exec(contentStr)) !== null) {
      const block = btMatch[1];
      // Match Tj: (string) Tj
      const tjRegex = /\((.*?)(?<!\\)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        const decoded = decodePdfString(tjMatch[1]);
        if (decoded.trim()) {
          textChunks.push(decoded);
        }
      }

      // Match TJ: [ ... ] TJ
      const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
      let arrayMatch: RegExpExecArray | null;
      while ((arrayMatch = tjArrayRegex.exec(block)) !== null) {
        const inner = arrayMatch[1];
        const strRegex = /\((.*?)(?<!\\)\)/g;
        let sMatch: RegExpExecArray | null;
        let combined = "";
        while ((sMatch = strRegex.exec(inner)) !== null) {
          combined += decodePdfString(sMatch[1]);
        }
        if (combined.trim()) {
          textChunks.push(combined);
        }
      }
    }
  }

  // If stream extraction produced text, return it
  if (textChunks.length > 0) {
    return textChunks.join("\n");
  }

  // Fallback: search for top-level (text) Tj in plain text PDF
  const fallbackRegex = /\((.*?)(?<!\\)\)\s*Tj/g;
  let fbMatch: RegExpExecArray | null;
  while ((fbMatch = fallbackRegex.exec(str)) !== null) {
    const decoded = decodePdfString(fbMatch[1]);
    if (decoded.trim()) {
      textChunks.push(decoded);
    }
  }
  return textChunks.join("\n");
}

export async function extractMaterialFromFile(filePath: string): Promise<ExtractedMaterial> {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("請選擇材料檔案");
  }

  let stat;
  try {
    stat = await fs.stat(trimmed);
  } catch {
    throw new Error(`找不到或無法讀取檔案：${trimmed}`);
  }
  if (!stat.isFile()) {
    throw new Error("選擇的路徑必須是檔案");
  }
  if (stat.size > MAX_MATERIAL_FILE_BYTES) {
    throw new Error(`檔案大小 (${stat.size} bytes) 超過上限 (8 MiB)`);
  }

  const ext = extname(trimmed).toLowerCase();
  const fileName = basename(trimmed);
  let text = "";
  let format: MaterialFormat;

  if (ext === ".txt") {
    format = "txt";
    text = await fs.readFile(trimmed, "utf8");
  } else if (ext === ".md" || ext === ".markdown") {
    format = "md";
    text = await fs.readFile(trimmed, "utf8");
  } else if (ext === ".docx") {
    format = "docx";
    const buf = await fs.readFile(trimmed);
    const xml = extractDocxDocumentXml(buf);
    text = extractTextFromDocxXml(xml);
  } else if (ext === ".pdf") {
    format = "pdf";
    const buf = await fs.readFile(trimmed);
    text = extractTextFromPdfBuffer(buf);
  } else {
    throw new Error(`不支援的材料檔案格式 (${ext})；僅支援 .txt, .md, .docx, .pdf`);
  }

  text = normalizeNewlines(text).trim();
  if (text.length > MAX_MATERIAL_TEXT_CHARS) {
    text = text.slice(0, MAX_MATERIAL_TEXT_CHARS);
  }

  return {
    format,
    fileName,
    text,
    characterCount: text.length
  };
}
