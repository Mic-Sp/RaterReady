import type { ReactNode } from "react";
import "./globals.css";

/** Provides the App Router document shell; Step 1 intentionally has no UI pages. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
