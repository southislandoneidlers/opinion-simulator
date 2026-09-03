import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_IPC_KEY,
  assertSafeIpcValue,
  dispatchIpc,
  isIpcChannel
} from "./ipc";

describe("IPC allow-list and secret-shaped keys", () => {
  it("accepts published channels and rejects unknown ones", () => {
    expect(isIpcChannel("desktop.ping")).toBe(true);
    expect(isIpcChannel("queue.enqueue")).toBe(true);
    expect(isIpcChannel("desktop.chooseWorkbook")).toBe(true);
    expect(isIpcChannel("workbook.validate")).toBe(true);
    expect(isIpcChannel("credential.load")).toBe(false);
    expect(isIpcChannel("run.live")).toBe(false);
  });

  it("rejects credential-shaped object keys but not string contents", () => {
    expect(() => assertSafeIpcValue({ apiKey: "x" })).toThrow(/apiKey/);
    expect(() => assertSafeIpcValue({ GEMINI_API_KEY: "x" })).toThrow(/GEMINI_API_KEY/);
    expect(() => assertSafeIpcValue({ nested: { password: "x" } })).toThrow(/password/);
    expect(() => assertSafeIpcValue({ value: "sk-not-a-key-name" })).not.toThrow();
    expect(() => assertSafeIpcValue({ sourceText: "the docs mention an apiKey field" })).not.toThrow();
    expect(FORBIDDEN_IPC_KEY.test("authorization")).toBe(true);
  });

  it("dispatchIpc fails closed on unknown channels, array payloads, and leaking responses", async () => {
    const handlers = {
      "desktop.ping": () => ({ ok: true }),
      "credential.status": () => ({ apiKey: "should-never-cross" })
    };
    await expect(dispatchIpc(handlers, "not-a-channel", {})).rejects.toThrow(/Unknown IPC channel/);
    await expect(dispatchIpc(handlers, "desktop.ping", [])).rejects.toThrow(/must be an object/);
    await expect(dispatchIpc(handlers, "desktop.ping", { token: "abc" })).rejects.toThrow(/token/);
    await expect(dispatchIpc(handlers, "desktop.ping", {})).resolves.toEqual({ ok: true });
    await expect(dispatchIpc(handlers, "credential.status", {})).rejects.toThrow(/apiKey/);
  });

  it("allows the published Preflight token-count estimate in responses", async () => {
    const preflight = {
      estimate: {
        approximateInputTokensPerRequest: 128
      }
    };

    await expect(
      dispatchIpc({ "preflight.render": () => preflight }, "preflight.render", {})
    ).resolves.toEqual(preflight);
  });
});
