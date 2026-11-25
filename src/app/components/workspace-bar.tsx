"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SyntheticText } from "./demo-badge";

/** Sticky named status landmark with a native quick-reference disclosure. Full titles remain in the page H1; the compact mirror never creates a second live announcement. */
export function WorkspaceBar({ title, metadata, status, reference }: { title: string; metadata: ReactNode; status: ReactNode; reference: ReactNode }) {
  const bar = useRef<HTMLElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = bar.current!;
    const measure = () => document.documentElement.style.setProperty("--workspace-sticky-height", `${Math.ceil(element.getBoundingClientRect().height) + 16}px`);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element); window.addEventListener("resize", measure);
    // A wrapping toolbar must not obscure keyboard focus (including at 200% text).
    // Only later page controls are adjusted; backward navigation to the site header stays native.
    const revealFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || element.contains(target)) return;
      if (disclosure.current) disclosure.current.open = false;
      const bounds = element.getBoundingClientRect();
      if (bounds.height > 0 && bounds.top <= parseFloat(getComputedStyle(element).top) + 1 && element.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) {
        const focused = target.getBoundingClientRect();
        if (focused.top < bounds.bottom + 12) window.scrollBy({ top: focused.top - bounds.bottom - 12, behavior: "instant" });
      }
    };
    document.addEventListener("focusin", revealFocus);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("focusin", revealFocus); document.documentElement.style.removeProperty("--workspace-sticky-height"); };
  }, []);
  return <section ref={bar} className="workspace-status-bar" aria-label="Evaluation workspace status">
    <div className="workspace-bar-context"><p className="workspace-bar-title" title={title}><SyntheticText rebrand>{title}</SyntheticText></p><div className="workspace-bar-meta">{metadata}</div></div>
    <div className="workspace-bar-status">{status}</div>
    <details className="workspace-quick-reference" ref={disclosure} onKeyDown={(event) => {
      if (event.key === "Escape" && disclosure.current?.open) { event.preventDefault(); disclosure.current.open = false; toggle.current?.focus(); }
    }} onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
      <summary ref={toggle}>Quick reference</summary>
      <div className="workspace-reference-content">{reference}<button type="button" className="text-button" onClick={() => { disclosure.current!.open = false; toggle.current?.focus(); }}>Close quick reference</button></div>
    </details>
  </section>;
}
