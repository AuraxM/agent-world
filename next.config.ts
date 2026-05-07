import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // Next.js 16 默认拒绝来自非 localhost origin 的 _next/* 静态资源/HMR 请求。
  // 局域网内其他人通过 LAN IP 访问 dev server 时需要白名单（仅 dev 模式生效）。
  // 生产 build (next build / next start) 不受此影响。
  allowedDevOrigins: ["192.168.1.3"],

  // Proxy /api/* to the Fastify server
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
