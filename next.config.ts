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

  experimental: {
    // 禁用代理超时（默认30s不够SSE tick用：LLM决策多轮tool call可能 > 30s）
    // https://github.com/vercel/next.js/blob/HEAD/packages/next/src/server/lib/router-utils/proxy-request.ts
    proxyTimeout: 600_000, // 10 分钟
  },
};

export default nextConfig;
