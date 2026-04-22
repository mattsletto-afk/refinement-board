import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@neondatabase/serverless', '@prisma/adapter-neon'],
};

export default nextConfig;
