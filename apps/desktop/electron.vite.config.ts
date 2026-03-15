import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Inline at build time so packaged app has correct URLs (set via Doppler prd when running pnpm desktop:dist from root)
const envDefine = {
  "process.env.VITE_APP_URL": JSON.stringify(process.env.VITE_APP_URL ?? ""),
  "process.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL ?? ""),
  "process.env.VITE_ECHO_AGENT_URL": JSON.stringify(
    process.env.VITE_ECHO_AGENT_URL ?? "",
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
