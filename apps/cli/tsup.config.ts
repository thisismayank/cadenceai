import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  external: ["react", "ink", "ink-text-input"],
  noExternal: ["@cadenceai/agents", "@cadenceai/sandboxes", "@cadenceai/schemas"],
});
