import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const popupHeaders = { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" };

export default defineConfig({
  envDir: "..",
  plugins: [react()],
  server: { port: 5173, strictPort: true, headers: popupHeaders },
  preview: { headers: popupHeaders },
});

