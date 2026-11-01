import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// The tests decide claims, so they get their own backend, dashboard and database.
const database = join(tmpdir(), `undercover-e2e-${String(Date.now())}.db`);

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  reporter: "list",
  use: { baseURL: "http://localhost:5174" },
  webServer: [
    {
      command: "uv run -m uvicorn backend.main:app --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      env: { UNDERCOVER_DB: database },
      reuseExistingServer: false,
    },
    {
      command: "npx vite dashboard --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { BACKEND_URL: "http://127.0.0.1:8001" },
      reuseExistingServer: false,
    },
  ],
});
