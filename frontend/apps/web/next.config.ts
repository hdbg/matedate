import type { NextConfig } from "next";

// Rybbit analytics is served first-party through our own origin (see the <Script> in
// app/layout.tsx pointing at /analytics/script.js). Requests to /analytics/* are rewritten
// server-side to the Rybbit host, so the tracker and its beacons ride matedate.gg and are not
// blocked by adblockers or third-party-cookie rules. The script derives the analytics host from
// its own (same-origin) src, so every /api/* endpoint it hits must be proxied too.
// Fixed public endpoint; overridable via RYBBIT_HOST for self-hosted instances.
const RYBBIT_HOST = process.env.RYBBIT_HOST ?? "https://app.rybbit.io";

// Note: this project uses Yarn PnP, which Turbopack does not resolve here, so
// the dev/build scripts pass --webpack. Webpack picks up .pnp.cjs correctly.
const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript/JSX source (no build step), so Next must transpile them.
  transpilePackages: ["@matedate/icons", "@matedate/visuals"],
  async rewrites() {
    return [
      { source: "/analytics/script.js", destination: `${RYBBIT_HOST}/api/script.js` },
      { source: "/analytics/replay.js", destination: `${RYBBIT_HOST}/api/replay.js` },
      { source: "/analytics/metrics.js", destination: `${RYBBIT_HOST}/api/metrics.js` },
      { source: "/analytics/track", destination: `${RYBBIT_HOST}/api/track` },
      { source: "/analytics/identify", destination: `${RYBBIT_HOST}/api/identify` },
      {
        source: "/analytics/session-replay/record/:siteId",
        destination: `${RYBBIT_HOST}/api/session-replay/record/:siteId`,
      },
      {
        source: "/analytics/site/tracking-config/:siteId",
        destination: `${RYBBIT_HOST}/api/site/tracking-config/:siteId`,
      },
    ];
  },
};

export default nextConfig;
