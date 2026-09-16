import type { NextConfig } from "next";

const config: NextConfig = {
  // Permit development assets and hot reload from loopback and private LAN hosts.
  allowedDevOrigins: [
    "127.0.0.1", "192.168.*.*", "10.*.*.*",
    ...Array.from({ length: 16 }, (_, index) => `172.${16 + index}.*.*`),
  ],
};
export default config;
