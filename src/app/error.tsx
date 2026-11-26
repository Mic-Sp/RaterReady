"use client";

import { PageErrorRecovery } from "./components/page-error-recovery";

/** Segment errors can contain provider, database or request context. Do not read, render, or log the error object. */
export default function RouteError({ retry }: { error: Error; retry: () => void }) {
  return <PageErrorRecovery retry={retry} />;
}
