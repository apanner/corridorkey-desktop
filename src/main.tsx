import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/shell.css";
import { App } from "./ui/App";
import { createStubCk, type ShellInfo } from "./tauri/ck";

// Electron's preload sets window.ck before this file runs. The Tauri shell
// has no preload: the page asks the shell who it is, then shows that state.
async function start(): Promise<void> {
  if (!window.ck) {
    let info: ShellInfo = { version: "", platform: "", home: "" };
    try {
      info = await invoke<ShellInfo>("shell_info");
    } catch {
      // error: NOT-WORTH — not inside the Tauri window (a bare browser): the page still opens, with no version
    }
    window.ck = createStubCk(info);
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
