import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // tunnels for sharing a dev instance (any subdomain; a leading dot matches subdomains)
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.app", ".trycloudflare.com"],
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: false },
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
});
