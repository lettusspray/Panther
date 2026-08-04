import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on real worker bindings
}

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  vite: {
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  },
});
