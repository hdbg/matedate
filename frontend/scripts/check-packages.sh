#!/usr/bin/env sh
# Guardrail: packages/* must stay Remotion-renderable — pure, presentational, and free of any
# app/framework coupling. This dependency-free grep runs in CI and stands in for an ESLint
# no-restricted-imports rule (packages ship raw source and have no lint toolchain of their own).
#
# Rejected in packages/*/src:
#   - imports of next/*, remotion, framer-motion, or the @/ path alias
#   - a "use client" directive
#   - raw CSS animations/transitions (@keyframes, `animation:`, `transition:`) — all motion must be
#     driven by the `progress` prop. NOTE: Tailwind utility classes like `transition-[width]` or
#     `animate-foo` are fine (the consuming app supplies the @keyframes); only raw CSS is rejected.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

status=0
report() { echo "✖ $1"; status=1; }

if grep -rnE "from ['\"](next(/|['\"])|remotion|@remotion/|framer-motion|@/)" \
    packages/*/src --include='*.ts' --include='*.tsx'; then
  report "forbidden import in packages/ (next/*, remotion, framer-motion, or the @/ alias)"
fi

if grep -rnE "^\s*['\"]use client['\"]" packages/*/src --include='*.ts' --include='*.tsx'; then
  report "'use client' directive in packages/ (components must be pure/server-safe)"
fi

if grep -rnE "@keyframes|animation:|transition:" \
    packages/*/src --include='*.ts' --include='*.tsx' --include='*.css'; then
  report "raw CSS animation/transition in packages/ (motion must be progress-driven)"
fi

if [ "$status" -eq 0 ]; then
  echo "✓ packages/ guardrails pass"
fi
exit "$status"
