// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import RouteError from "./error";
import GlobalError from "./global-error";
import NotFoundPage from "./not-found";

afterEach(cleanup);

it("focuses recovery and retries without rendering or reporting exception details", async () => {
  const retry = vi.fn();
  const error = Object.assign(new Error("PRIVATE_DATABASE_REQUEST_DETAIL"), { digest: "PRIVATE_DIGEST" });
  const { container } = render(<RouteError error={error} retry={retry} />);
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Something went wrong" }));
  expect(container.textContent).not.toMatch(/PRIVATE_DATABASE_REQUEST_DETAIL|PRIVATE_DIGEST/);
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Try again" }));
  await user.keyboard("{Enter}");
  expect(retry).toHaveBeenCalledOnce();
});

it("provides a standalone root recovery document and a public-safe missing page", () => {
  const root = renderToStaticMarkup(<GlobalError error={new Error("PRIVATE_TOKEN")} retry={() => {}} />);
  expect(root).toContain('<html lang="en">');
  expect(root).toContain("<main");
  expect(root).not.toContain("PRIVATE_TOKEN");
  const missing = renderToStaticMarkup(<NotFoundPage />);
  expect(missing).toContain("Page not found");
  expect(missing).toContain('href="/"');
});
