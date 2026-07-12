"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { ReviewLoader } from "../components/ReviewLoader";
import { loadReview } from "../review";

/** Game Review by analysis id — where the notifications bell and deep links land. */
export default function AnalysisPage() {
  const id = String(useParams().id);
  const load = useCallback(() => loadReview(id), [id]);
  return <ReviewLoader load={load} storageKey={`matedate.reviewStep.${id}`} />;
}
