import { promises as fs } from "node:fs";
import { basename } from "node:path";
import { validateWorkbook, type ValidateWorkbookResult } from "@opinion-simulator/core";

/** Same compressed-file cap as `validateWorkbook`; do not load oversized files. */
const MAX_WORKBOOK_FILE_BYTES = 8 * 1024 * 1024;

export type WorkbookValidateIpcResult = {
  path: string;
} & ValidateWorkbookResult;

export async function validateWorkbookAtPath(filePath: string): Promise<WorkbookValidateIpcResult> {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("請選擇 Workbook 檔案");
  }

  const fileName = basename(trimmed);
  let stat;
  try {
    stat = await fs.stat(trimmed);
  } catch {
    throw new Error("找不到或無法讀取 Workbook 檔案");
  }
  if (!stat.isFile()) {
    throw new Error("Workbook 路徑必須是檔案");
  }

  if (stat.size > MAX_WORKBOOK_FILE_BYTES) {
    return {
      path: trimmed,
      ok: false,
      errors: [
        {
          code: "FILE_TOO_LARGE",
          path: "$",
          message: `檔案大小 (${stat.size} bytes) 超過上限 (8 MiB)`
        }
      ],
      warnings: []
    };
  }

  const bytes = new Uint8Array(await fs.readFile(trimmed));
  return { path: trimmed, ...validateWorkbook({ bytes, fileName }) };
}
