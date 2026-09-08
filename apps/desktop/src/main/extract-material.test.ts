import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractMaterialFromFile,
  extractTextFromDocxXml,
  extractTextFromPdfBuffer
} from "./extract-material";

describe("material file extraction (txt, md, docx, pdf)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `test-extract-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("extracts plain text from .txt files", async () => {
    const file = join(tempDir, "sample.txt");
    writeFileSync(file, "第一行內容\r\n第二行內容\n", "utf8");

    const result = await extractMaterialFromFile(file);
    expect(result.format).toBe("txt");
    expect(result.fileName).toBe("sample.txt");
    expect(result.text).toBe("第一行內容\n第二行內容");
    expect(result.characterCount).toBe(result.text.length);
  });

  it("extracts markdown content from .md files", async () => {
    const file = join(tempDir, "doc.md");
    writeFileSync(file, "# 政策草案\n\n- 項目 A\n- 項目 B", "utf8");

    const result = await extractMaterialFromFile(file);
    expect(result.format).toBe("md");
    expect(result.text).toContain("# 政策草案");
    expect(result.text).toContain("項目 A");
  });

  it("extracts paragraphs and runs from WordprocessingML XML", () => {
    const xml = `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r><w:t>第一段標題</w:t></w:r>
          </w:p>
          <w:p>
            <w:r><w:t>第二段有 </w:t></w:r>
            <w:r><w:t>多個文字區塊 &amp; 符號</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>
    `;
    const text = extractTextFromDocxXml(xml);
    expect(text).toBe("第一段標題\n\n第二段有 多個文字區塊 & 符號");
  });

  it("extracts text from uncompressed PDF text operators", () => {
    const pdf = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Length 50 >>\nstream\nBT\n/F1 12 Tf\n(Hello World) Tj\nET\nendstream\nendobj\nxref\ntrailer\n<< /Root 1 0 R >>\n%%EOF`,
      "binary"
    );
    const text = extractTextFromPdfBuffer(pdf);
    expect(text).toContain("Hello World");
  });

  it("extracts text from FlateDecode compressed PDF text operators", () => {
    const rawContent = Buffer.from("BT /F1 12 Tf (Compressed PDF Text) Tj ET", "binary");
    const compressed = zlib.deflateSync(rawContent);
    const pdf = Buffer.concat([
      Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`, "binary"),
      compressed,
      Buffer.from("\nendstream\nendobj\nxref\ntrailer\n<< /Root 1 0 R >>\n%%EOF", "binary")
    ]);
    const text = extractTextFromPdfBuffer(pdf);
    expect(text).toContain("Compressed PDF Text");
  });

  it("rejects unsupported extensions", async () => {
    const file = join(tempDir, "sample.exe");
    writeFileSync(file, "binary", "utf8");

    await expect(extractMaterialFromFile(file)).rejects.toThrow("不支援的材料檔案格式");
  });
});
