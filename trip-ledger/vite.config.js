import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// "base: './'" makes the build use relative asset paths, so it works
// whether it's served at the root of a domain or at
// https://<username>.github.io/<repo-name>/ (GitHub Pages project sites).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
