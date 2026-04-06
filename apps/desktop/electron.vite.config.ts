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
  "process.env.NEXT_PUBLIC_FIREBASE_API_KEY": JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""),
  "process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? ""),
  "process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID": JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ""),
  "process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET": JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? ""),
  "process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ""),
  "process.env.NEXT_PUBLIC_FIREBASE_APP_ID": JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? ""),
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
    define: envDefine,
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
