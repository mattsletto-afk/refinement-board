import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@neondatabase/serverless', '@prisma/adapter-neon'],
  allowedDevOrigins: ['10.0.0.175'],
};

export default nextConfig;
