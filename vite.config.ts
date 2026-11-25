// Eigen Vite-config (los van Lovable), geschikt voor Vercel via Nitro.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: { port: 8080 },
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // src/server.ts vangt SSR-fouten af met een nette foutpagina
    tanstackStart({ server: { entry: "server" } }),
    nitro(),
    viteReact(),
  ],
});
