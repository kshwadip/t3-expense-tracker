import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: ["@prisma/client", "prisma"],
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