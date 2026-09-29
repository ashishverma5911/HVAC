import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.20.10.5', 'localhost:3000', '172.20.10.5:3000'],
};

export default nextConfig;
