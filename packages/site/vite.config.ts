import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A user site (<user>.github.io) is served from the domain root, so the default base "/" is right.
export default defineConfig({
  plugins: [react()],
});
