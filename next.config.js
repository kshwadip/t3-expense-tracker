import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Prevent Next.js from bundling native-heavy packages — let Node require them
  serverExternalPackages: ["ioredis", "bullmq"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };
    }
    return config;
  },
};

export default config;