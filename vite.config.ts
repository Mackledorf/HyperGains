import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";

function getGitInfo() {
  try {
    const hash = execSync("git rev-parse --short HEAD").toString().trim();
    const date = execSync("git log -1 --format=%ci").toString().trim();
    return { hash, date };
  } catch {
    return { hash: "unknown", date: "unknown" };
  }
}

const git = getGitInfo();

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_HASH__: JSON.stringify(git.hash),
    __GIT_DATE__: JSON.stringify(git.date),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
