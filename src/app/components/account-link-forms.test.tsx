// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESET_REQUEST_RECEIVED } from "../../lib/account-lifecycle";
import { CompleteAccountLinkForm, ForgotPasswordForm, VerificationRequestForm } from "./account-link-forms";
import { requestPasswordReset, resetPasswordLink, sendVerificationLink, verifyEmailLink } from "../account-actions";
vi.mock("../account-actions", () => ({ requestPasswordReset: vi.fn(), resetPasswordLink: vi.fn(), sendVerificationLink: vi.fn(), verifyEmailLink: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState(null, "", "/"); });
afterEach(cleanup);

describe("accessible domain-free auth link forms", () => {
  it("renders an authorized preview clearly and never prefetches or adds it to a GET query", async () => {
    vi.mocked(sendVerificationLink).mockResolvedValue({ sequence: 1, status: "received", message: "Link requested.", preview: {
      url: "http://localhost/verify-email#token=" + "x".repeat(43), expiresAt: "2026-11-26T00:00:00Z", purpose: "EMAIL_VERIFICATION" } });
    render(<VerificationRequestForm />);
    await userEvent.click(screen.getByRole("button", { name: "Send / resend verification link" }));
    const preview = await screen.findByRole("region", { name: "Closed-Alpha Verification Link Preview" });
    expect(preview.textContent).toContain("No email was sent");
    expect(preview.textContent).toContain("does not prove access to an email inbox");
    expect(screen.getByRole("link").getAttribute("rel")).toBe("noreferrer");
    expect(screen.getByRole("link").getAttribute("href")).toContain("#token=");
  });

  it("shows a generic public reset confirmation without a preview link", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ sequence: 1, status: "received", message: RESET_REQUEST_RECEIVED });
    render(<ForgotPasswordForm />);
    await userEvent.click(screen.getByRole("button", { name: "Request password reset link" }));
    await screen.findByText(RESET_REQUEST_RECEIVED);
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });

  it("reads and clears token fragments without consuming on GET or fragment changes", async () => {
    window.history.replaceState(null, "", "/verify-email#token=" + "x".repeat(43));
    render(<StrictMode><CompleteAccountLinkForm purpose="EMAIL_VERIFICATION" /></StrictMode>);
    await waitFor(() => expect((screen.getByLabelText("One-time code") as HTMLInputElement).value).toBe("x".repeat(43)));
    expect(window.location.hash).toBe("");
    expect(verifyEmailLink).not.toHaveBeenCalled();
    window.location.hash = "token=" + "y".repeat(43);
    await waitFor(() => expect((screen.getByLabelText("One-time code") as HTMLInputElement).value).toBe("y".repeat(43)));
  });

  it("uses the shared password guidance and associated, focused reset validation", async () => {
    vi.mocked(resetPasswordLink).mockResolvedValue({ sequence: 1, status: "invalid", message: "Check the new password.", fieldError: "Include at least one uppercase letter." });
    render(<CompleteAccountLinkForm purpose="PASSWORD_RESET" />);
    expect(screen.getByLabelText("New password").getAttribute("minlength")).toBe("8");
    expect(screen.getByLabelText("New password").getAttribute("maxlength")).toBe("128");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    await screen.findByText("Include at least one uppercase letter.");
    expect(document.activeElement).toBe(screen.getByLabelText("New password"));
    expect(screen.getByLabelText("New password").getAttribute("aria-describedby")).toContain("password-error");
  });
});
