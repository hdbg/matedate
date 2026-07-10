import type { NextConfig } from "next";

// Note: this project uses Yarn PnP, which Turbopack does not resolve here, so
// the dev/build scripts pass --webpack. Webpack picks up .pnp.cjs correctly.
const nextConfig: NextConfig = {};

export default nextConfig;
