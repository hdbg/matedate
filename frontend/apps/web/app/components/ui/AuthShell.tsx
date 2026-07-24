import type { ReactNode } from "react";
import { AppShell } from "./AppShell";

/** Centered single-column shell for the standalone auth screens (login / reset). */
export function AuthShell({ children }: { children?: ReactNode }) {
  return (
    <AppShell>
      <div className="flex h-full w-full flex-col lg:mx-auto lg:max-w-[520px]">{children}</div>
    </AppShell>
  );
}
