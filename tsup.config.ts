import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "node22",
  platform: "node",
  // tsup's declaration build injects the `baseUrl` option, which TypeScript 6
  // reports as deprecated. Acknowledging the deprecation keeps the build green
  // without weakening any of the project's own compiler settings.
  dts: {
    compilerOptions: { composite: false, ignoreDeprecations: "6.0" },
  },
  sourcemap: true,
  splitting: false,
  minify: false,
  treeshake: true,
  clean: true,
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
});
