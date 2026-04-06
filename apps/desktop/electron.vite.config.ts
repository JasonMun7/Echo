import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Inline at build time so packaged app has correct URLs (set via Doppler prd when running pnpm desktop:dist from root)
// VITE_ECHO_AGENT_URL — base URL for the Python agent service (repo `agent/`, WS `/api/agent/run`). Empty = same host as VITE_API_URL (see `src/main/agent-client/agent-service-url.ts`).
const envDefine = {
  "process.env.VITE_APP_URL": JSON.stringify(process.env.VITE_APP_URL ?? ""),
  "process.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL ?? ""),
  "process.env.VITE_ECHO_AGENT_URL": JSON.stringify(
    process.env.VITE_ECHO_AGENT_URL ?? "",
  ),
  "process.env.VITE_AUTH0_LINK_CONNECTION": JSON.stringify(
    process.env.VITE_AUTH0_LINK_CONNECTION ?? "",
  ),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: envDefine,
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
      },
    },
  },
});
