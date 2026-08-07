import type { NextConfig } from "next";

const contentSecurityPolicy=[
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders=[
  {key:"Content-Security-Policy",value:contentSecurityPolicy},
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"X-Frame-Options",value:"DENY"},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"},
  {key:"X-DNS-Prefetch-Control",value:"off"},
  {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
  {key:"X-Permitted-Cross-Domain-Policies",value:"none"},
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers(){
    return [
      {source:"/(.*)",headers:securityHeaders},
      {source:"/api/:path*",headers:[{key:"Cache-Control",value:"no-store, max-age=0"}]},
    ];
  },
};

export default nextConfig;