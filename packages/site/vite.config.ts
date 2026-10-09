import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// A user site (<user>.github.io) is served from the domain root, so the default base "/" is right.
// On GitHub Pages, the project sites are on the same origin as this site. In development, the proxy gives the same result,
// so the pool can read the documents in its frames.
const projects = ["vex", "AsyncBrowserContext", "lag", "render", "client", "systems"];
const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  projects.map((name) => [`/${name}/`, { target: "https://mark1russell7.github.io", changeOrigin: true, secure: true }]),
);

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
