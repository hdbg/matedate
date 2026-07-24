import type { ReactNode } from "react";
import { cn } from "@/app/lib/utils";

interface AppShellProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Full-bleed app container: fills the viewport on every breakpoint. Each screen
 * owns its own responsive layout inside (stacked on mobile, wider desktop
 * layouts at `lg`). `relative` scopes absolutely-positioned overlays (bottom
 * sheet, toast, verdict flash) to the app.
 */
export function AppShell({ children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        "relative flex h-[100dvh] w-full flex-col overflow-hidden bg-paper",
        className,
      )}
    >
      {children}
    </div>
  );
}
