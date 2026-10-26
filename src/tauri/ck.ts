// Phase 0 shell (update_plan.md): the page's window.ck, backed by the Tauri
// window. Nothing here is a measurement. The version, platform and home come
// from the shell command; everything else is empty until a later phase reads it.
import type { Appearance, AppState, CorridorKeyApi, EngineFileKind, HintFileKind, JobOptions } from "../shared/types";
import { DEFAULT_APPEARANCE, DEFAULT_OPTIONS } from "../shared/types";
import { DEFAULT_TRT_SIZES, type TrtSize } from "../shared/trt";

export interface ShellInfo {
  version: string;
  platform: string;
  home: string;
}

const names = (platform: string) =>
  platform === "win32"
    ? { engineBin: "corridorkey-engine.exe", ortLib: "onnxruntime.dll" }
    : platform === "darwin"
      ? { engineBin: "corridorkey-engine", ortLib: "libonnxruntime.dylib" }
      : { engineBin: "corridorkey-engine", ortLib: "libonnxruntime.so" };

function emptyState(info: ShellInfo): AppState {
  const file = names(info.platform);
  return {
    version: info.version,
    jobs: [],
    queueRunning: false,
    engine: { status: "stopped", pong: null, error: null },
    gpu: null,
    gpuError: null,
    settings: {
      corridorKeyRoot: null,
      lastOptions: DEFAULT_OPTIONS,
      appearance: DEFAULT_APPEARANCE,
      outputRoot: null,
      engineBinary: null,
      modelsDir: null,
      ortLibrary: null,
      tensorrt: false,
      vramLimitGb: null,
      // loop: NOT-WORTH — two default sizes, once when the shell starts
      trtSizes: DEFAULT_TRT_SIZES.map((s) => ({ ...s })),
      cacheRoot: null,
    },
    checkout: { ok: false, problems: ["The engine isn't connected in this shell yet."] },
    rustEngine: { ok: false, problems: ["The engine isn't connected in this shell yet."] },
    engineKind: null,
    engineFiles: { binary: [], models: [], ort: [] },
    ffmpeg: {
      checked: false,
      ok: false,
      problem: null,
      command: "",
      canInstall: false,
      runHint: "",
      note: null,
      installing: false,
      installError: null,
    },
    install: {
      dir: "",
      needRuntime: false,
      needModels: false,
      bytes: 0,
      runtimeBytes: 0,
      modelsBytes: 0,
      gpuOk: false,
      gpuProblem: null,
      runtimeWhat: "",
      status: "idle",
      step: null,
      done: 0,
      total: 0,
      error: null,
    },
    tensorrt: {
      supported: info.platform === "linux",
      on: false,
      ready: false,
      needLibs: false,
      needProvider: false,
      needModels: false,
      bytes: 0,
      fullBytes: 0,
      status: "idle",
      step: null,
      done: 0,
      total: 0,
      error: null,
      built: [],
      prebuild: { status: "idle", ranges: [], fraction: 0, startedAt: null, note: null },
      onDisk: [],
    },
    storage: null,
    cache: null,
    cacheMissing: null,
    card: null,
    enginePaths: { binary: null, models: null, ort: null },
    desktopPalette: null,
    system: { engineBin: file.engineBin, ortLib: file.ortLib, platform: info.platform, home: info.home },
  };
}

/** The page API for the Tauri shell. `info` is the shell command's reply. */
export function createStubCk(info: ShellInfo): CorridorKeyApi {
  let state = emptyState(info);
  const listeners = new Set<(next: AppState) => void>();
  const emit = () => {
    // loop: NOT-WORTH — the page's state listeners, one push
    for (const listener of listeners) listener(state);
  };
  const patch = (next: AppState) => {
    state = next;
    emit();
  };
  return {
    getState: () => Promise.resolve(state),
    onState: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addPaths: () => Promise.resolve(),
    pickClips: () => Promise.resolve(),
    pickFile: (_kind: HintFileKind) => Promise.resolve(null),
    pickCheckout: () => Promise.resolve(),
    pickRustEngine: (_what: EngineFileKind) => Promise.resolve(),
    setRustEngine: () => Promise.resolve(),
    installFfmpeg: () => Promise.resolve(),
    startInstall: () => Promise.resolve(),
    stopInstall: () => Promise.resolve(),
    setTensorrt: (on) => {
      patch({ ...state, settings: { ...state.settings, tensorrt: on }, tensorrt: { ...state.tensorrt, on } });
      return Promise.resolve();
    },
    trtPrebuild: () => Promise.resolve(),
    trtSize: (_action: "add" | "remove", _size: TrtSize) => Promise.resolve(),
    measureStorage: () => Promise.resolve(),
    removeStorage: () => Promise.resolve(),
    openStorageFolder: () => Promise.resolve(),
    pickCacheFolder: () => Promise.resolve(),
    setVramLimitDefault: (gb) => {
      patch({ ...state, settings: { ...state.settings, vramLimitGb: gb } });
      return Promise.resolve();
    },
    pathForFile: () => "",
    setJobOptions: (_id: string, _options: JobOptions) => Promise.resolve(),
    estimateMemory: () => Promise.resolve({ ok: false, reason: "The engine isn't connected in this shell yet." }),
    removeJob: () => Promise.resolve(),
    retryJob: () => Promise.resolve(),
    startQueue: () => Promise.resolve(),
    stopQueue: () => Promise.resolve(),
    showInFolder: () => Promise.resolve(),
    copyText: () => Promise.resolve(false),
    copyJobLog: () => Promise.resolve(false),
    setAppearance: (appearance: Appearance) => {
      patch({ ...state, settings: { ...state.settings, appearance } });
      return Promise.resolve();
    },
    pickOutputRoot: () => Promise.resolve(),
    clearOutputRoot: () => {
      patch({ ...state, settings: { ...state.settings, outputRoot: null } });
      return Promise.resolve();
    },
    setVisible: () => undefined,
  };
}
