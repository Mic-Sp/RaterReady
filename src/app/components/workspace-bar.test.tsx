// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceBar } from "./workspace-bar";
import { StatusBadge } from "./status-badge";

afterEach(cleanup);
describe("sticky workspace landmark", () => {
  it("provides native reference controls, restores focus on Escape and adds no duplicate live announcements", () => {
    const { container } = render(<WorkspaceBar title="Synthetic scenario" metadata={<StatusBadge>G1 · Untimed</StatusBadge>}
      status={<StatusBadge tone="success">Draft saved to server</StatusBadge>} reference={<p>Use the pinned rubric.</p>} />);
    expect(screen.getByRole("region", { name: "Evaluation workspace status" })).toBeDefined();
    const summary = screen.getByText("Quick reference");
    const details = summary.closest("details")!;
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    fireEvent.keyDown(summary, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
  it("closes references when keyboard focus leaves and removes its measured offset when unmounted", () => {
    const { unmount } = render(<><WorkspaceBar title="Exam" metadata="Slot 2 · G2" status="Saved" reference={<button>Reference action</button>} /><button>Next control</button></>);
    const summary = screen.getByText("Quick reference");
    fireEvent.click(summary);
    fireEvent.blur(summary, { relatedTarget: screen.getByRole("button", { name: "Next control" }) });
    expect(summary.closest("details")!.open).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--workspace-sticky-height")).not.toBe("");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--workspace-sticky-height")).toBe("");
  });
});
