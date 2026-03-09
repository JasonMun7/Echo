import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  turbopack: {
    root: path.resolve(__dirname, "..", ".."),
  },
};

export default nextConfig;
