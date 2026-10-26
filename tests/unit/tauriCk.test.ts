import { describe, expect, it } from "vitest";
import { createStubCk } from "../../src/tauri/ck";

describe("Tauri shell stub", () => {
  it("shows the shell's own version and does not claim ffmpeg or the GPU were checked", async () => {
    const ck = createStubCk({ version: "1.0.0-dev.1", platform: "win32", home: "C:\\Users\\m" });
    const state = await ck.getState();
    expect(state.version).toBe("1.0.0-dev.1");
    expect(state.system).toMatchObject({ platform: "win32", engineBin: "corridorkey-engine.exe", ortLib: "onnxruntime.dll", home: "C:\\Users\\m" });
    expect(state.ffmpeg.checked).toBe(false);
    expect(state.install.needRuntime).toBe(false);
    expect(state.gpu).toBeNull();
    expect(state.engineKind).toBeNull();
  });
});
