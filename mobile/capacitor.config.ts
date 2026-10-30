import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "fs";
import { join } from "path";

// One source for the app version: mobile/package.json "version" (also MARKETING_VERSION in the
// Xcode project; scripts/add-share-extension.cjs keeps the two equal).
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };

// Web Inspector is OFF in every build that can be submitted. Only the "inspect" CI flavour
// (BUILD-PLAN §10/§11.7, never submitted) sets CN_IOS_INSPECT=1 before `cap sync`.
// The release workflow fails if capacitor.config.json says "webContentsDebuggingEnabled": true.
const inspect = process.env.CN_IOS_INSPECT === "1";

const config: CapacitorConfig = {
  appId: "app.cybernetai",
  appName: "CyberNet AI",
  webDir: "www", // bundled assets only; there is deliberately NO `server.url` (no remote code)
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    backgroundColor: "#060a14", // --cn-bg in ui-src/css/00-tokens.css (dark theme)
    appendUserAgent: `CyberNetAI-iOS/${pkg.version}`,
    allowsLinkPreview: false, // a long-press must not load a remote page in a preview
    webContentsDebuggingEnabled: inspect,
  },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: "#060a14", showSpinner: false },
    Keyboard: { resize: "native", resizeOnFullScreen: true },
    CapacitorHttp: { enabled: false }, // keep WebKit fetch; CORS is handled by the server
    CapacitorCookies: { enabled: false },
  },
};

export default config;
