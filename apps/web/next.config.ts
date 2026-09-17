import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: [
    "@cadenceai/agents",
    "@cadenceai/db",
    "@cadenceai/sandboxes",
    "@cadenceai/schemas",
    "@cadenceai/shared",
    "@cadenceai/workflows",
  ],
  typedRoutes: false,
};

export default config;
