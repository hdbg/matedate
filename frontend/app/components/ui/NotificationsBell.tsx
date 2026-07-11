"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/app/lib/utils";
import { useAnalysisNotifications } from "@/app/lib/notifications/useAnalysisNotifications";

/**
 * Notifications bell for the main screen. Listens (via useAnalysisNotifications) for deep-review
 * jobs finishing in the background and shows the result — a ready review links to its page; a
 * failure is informational. Opening the panel clears the unread badge.
 */
export function NotificationsBell({ className }: { className?: string }) {
  const router = useRouter();
  const { notifications, unread, markAllRead } = useAnalysisNotifications();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen) markAllRead();
      return !wasOpen;
    });
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="relative grid h-[38px] w-[38px] place-items-center rounded-full bg-ink/[0.06] text-[17px] text-ink transition-colors hover:bg-ink/[0.12]"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-rosy px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-ink/[0.08] bg-paper shadow-[var(--sh-3)]">
            <div className="border-b border-ink/[0.06] px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute">
              Notifications
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-ink-mute">
                No notifications yet. Request a deep review after a game and it&apos;ll land here.
              </p>
            ) : (
              <ul className="max-h-[340px] overflow-y-auto">
                {notifications.map((n) => {
                  const ready = n.status === "completed" && n.analysisId;
                  return (
                    <li key={n.jobId} className="border-b border-ink/[0.05] last:border-b-0">
                      <button
                        type="button"
                        disabled={!ready}
                        onClick={() => {
                          if (!ready) return;
                          setOpen(false);
                          router.push(`/analysis/${n.analysisId}`);
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                          ready ? "cursor-pointer hover:bg-ink/[0.04]" : "cursor-default",
                        )}
                      >
                        <span className="mt-0.5 text-[16px]" aria-hidden>
                          {n.status === "completed" ? "🔍" : "⚠️"}
                        </span>
                        <span className="flex flex-col">
                          <span className="text-[14px] font-semibold text-ink">
                            {n.status === "completed"
                              ? "Your game review is ready"
                              : "Analysis couldn’t be completed"}
                          </span>
                          <span className="text-[12px] text-ink-mute">
                            {n.status === "completed"
                              ? "Tap to replay every move"
                              : "Something went wrong — try requesting it again"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
