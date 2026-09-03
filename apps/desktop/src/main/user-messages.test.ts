import { describe, expect, it } from "vitest";
import { toUserFacingMessage, wrapProviderCallError } from "./user-messages";

const FAKE_KEY = "FAKE-KEY-FOR-TESTS-do-not-use-real-keys";

describe("user-facing error messages", () => {
  it("redacts a provider error that echoes the API key", () => {
    const error = wrapProviderCallError("gemini", new Error(`native failure: ${FAKE_KEY}`), FAKE_KEY);
    expect(error.message).not.toContain(FAKE_KEY);
    expect(error.message).toMatch(/^【Google Gemini】/);
    expect(error.message).toMatch(/對外呼叫/);
  });

  it("maps missing-draft and missing-persona errors to a stage and next action", () => {
    expect(toUserFacingMessage("Project draft is not open")).toMatch(/【專案】/);
    expect(toUserFacingMessage("尚未確認 Persona Version")).toMatch(/【Persona】/);
    expect(toUserFacingMessage("尚未確認 Persona Version")).toMatch(/確認 Persona Version/);
  });
});
