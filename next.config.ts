import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Keep the PDF/OCR stack out of the bundler: @napi-rs/canvas ships a
     native binary, tesseract.js loads a worker + WASM at runtime, and
     pdf2md is CommonJS. All three must be required from node_modules. */
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js", "@opendocsg/pdf2md"],
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
