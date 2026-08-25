import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { compactJson, hashJson } from "./hash";

describe("hashJson", () => {
  it("matches the Python compact SHA-256 for the same object", () => {
    const value = { b: 2, a: [true, null, "中文"] };
    const python = execFileSync(
      "python3",
      [
        "-c",
        "import hashlib,json,sys; v=json.loads(sys.argv[1]); print(hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',', ':')).encode()).hexdigest())",
        compactJson(value)
      ],
      { encoding: "utf8" }
    ).trim();
    expect(hashJson(value)).toBe(python);
  });
});
