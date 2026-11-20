// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./sign-in-form";
import { submitSignIn } from "./actions";
import { SIGN_IN_FAILURE } from "./form-state";

vi.mock("./actions", () => ({ submitSignIn: vi.fn() }));

beforeEach(() => { vi.mocked(submitSignIn).mockReset(); });
afterEach(cleanup);

describe("accessible sign-in form", () => {
  it("provides labels, autocomplete, a persistent polite live region, and no registration or role controls", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText("Account identifier").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("button", { name: "Sign in" }).getAttribute("type")).toBe("submit");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("link", { name: /sign up|register|create account/i })).toBeNull();
  });

  it("toggles password visibility with the keyboard without submitting or changing the value", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    await user.type(input, "DEMO - SYNTHETIC password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(input.type).toBe("text");
    expect(input.value).toBe("DEMO - SYNTHETIC password");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(input.id);
    await user.keyboard(" ");
    expect(input.type).toBe("password");
    expect(submitSignIn).not.toHaveBeenCalled();
  });

  it("associates server validation with each field and focuses the first invalid input", async () => {
    vi.mocked(submitSignIn).mockResolvedValue({ attempt: 1, accountCode: "", error: "Check the fields below and try again.",
      fieldErrors: { accountCode: "Enter your account identifier.", password: "Use 8 to 128 characters." } });
    render(<SignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Enter your account identifier.");
    const account = screen.getByLabelText("Account identifier");
    const password = screen.getByLabelText("Password");
    expect(account.getAttribute("aria-invalid")).toBe("true");
    expect(account.getAttribute("aria-describedby")).toContain("account-error");
    expect(password.getAttribute("aria-describedby")).toContain("password-error");
    expect(document.activeElement).toBe(account);
  });

  it("submits by keyboard, announces a generic failure, and allows a repeat attempt", async () => {
    vi.mocked(submitSignIn).mockImplementation(async (previous) => ({ attempt: previous.attempt + 1, accountCode: "demo-marcus", error: SIGN_IN_FAILURE }));
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText("Account identifier"), "demo-marcus");
    await user.type(screen.getByLabelText("Password"), "incorrect demo password");
    screen.getByRole("button", { name: "Sign in" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByText(SIGN_IN_FAILURE);
    expect(document.activeElement).toBe(screen.getByRole("status"));
    expect((screen.getByLabelText("Account identifier") as HTMLInputElement).value).toBe("demo-marcus");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(submitSignIn).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status").textContent).toBe(SIGN_IN_FAILURE);
  });

  it("keeps pending submission disabled and announces progress", async () => {
    let finish!: (value: { attempt: number; accountCode: string; error: string }) => void;
    vi.mocked(submitSignIn).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<SignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const submit = await screen.findByRole("button", { name: "Signing in…" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("form").getAttribute("aria-busy")).toBe("true");
    finish({ attempt: 1, accountCode: "", error: SIGN_IN_FAILURE });
    await screen.findByRole("button", { name: "Sign in" });
  });
});
