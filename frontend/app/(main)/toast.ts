"use client";

import { createContext, useContext } from "react";

/**
 * Toast pub/sub for the main tab chrome. Lives in its own module (not the layout file) because a
 * Next route module — `layout.tsx` — may only export the default + recognized route config; a named
 * `useToast` export there fails route-type validation. `MainLayout` provides the value.
 */
export const ToastContext = createContext<(msg: string) => void>(() => {});

export function useToast(): (msg: string) => void {
  return useContext(ToastContext);
}
