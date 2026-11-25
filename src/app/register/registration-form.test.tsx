// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_GUIDANCE, REGISTRATION_RECEIVED } from "../../lib/registration";
import { RegistrationForm } from "./registration-form";
import { submitRegistration } from "./actions";
vi.mock("./actions", () => ({ submitRegistration: vi.fn() }));
beforeEach(() => vi.mocked(submitRegistration).mockReset());
afterEach(cleanup);

describe("accessible candidate registration", () => {
  it("labels fields, hides the trap from AT/keyboard, and requires explicit unchecked consent", () => {
    const { container } = render(<RegistrationForm />);
    expect(screen.getByLabelText("Email address").getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Password").getAttribute("minlength")).toBe("8");
    expect(screen.getByLabelText("Password").getAttribute("maxlength")).toBe("128");
    expect(screen.getByText(PASSWORD_GUIDANCE).id).toBe("registration-password-hint");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("checkbox").getAttribute("required")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Website" })).toBeNull();
    expect(container.querySelector<HTMLInputElement>('[name="website"]')!.tabIndex).toBe(-1);
    expect(container.querySelector('[name="website"]')!.closest("[hidden]")).not.toBeNull();
    expect(screen.getByRole("group").textContent).toContain("government IDs");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("focuses and associates the first server validation error while preserving local input", async () => {
    vi.mocked(submitRegistration).mockResolvedValue({ status: "invalid", attempt: 1, message: "Check the fields below.", fieldErrors: { email: "Enter a valid email address." } });
    render(<RegistrationForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email address"), "invalid-email");
    await user.click(screen.getByRole("button", { name: "Create candidate account" }));
    await screen.findByText("Enter a valid email address.");
    expect(document.activeElement).toBe(screen.getByLabelText("Email address"));
    expect(screen.getByLabelText("Email address").getAttribute("aria-describedby")).toContain("registration-email-error");
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("invalid-email");
  });

  it("focuses missing consent, exposes a keyboard password toggle and does not submit from the toggle", async () => {
    vi.mocked(submitRegistration).mockResolvedValue({ status: "invalid", attempt: 1, message: "Read the terms.", fieldErrors: { consent: "Accept the terms." } });
    render(<RegistrationForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Password"), "River9!x");
    screen.getByRole("button", { name: "Show password" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    expect(submitRegistration).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create candidate account" }));
    await screen.findByText("Accept the terms.");
    expect(document.activeElement).toBe(screen.getByRole("checkbox"));
  });

  it.each(["Use at least 8 characters.", "Include at least one uppercase letter.", "Include at least one lowercase letter.", "Include at least one number.", "Include at least one symbol (such as ! or @)."])("associates and focuses password feedback: %s", async (message) => {
    vi.mocked(submitRegistration).mockResolvedValue({ status: "invalid", attempt: 1, message: "Check the fields below.", fieldErrors: { password: message } });
    render(<RegistrationForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create candidate account" }));
    await screen.findByText(message);
    const password = screen.getByLabelText("Password");
    expect(document.activeElement).toBe(password);
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-describedby")).toBe("registration-password-hint registration-password-error");
  });

  it("announces the shared acknowledgment, removes password inputs and links to sign-in", async () => {
    vi.mocked(submitRegistration).mockResolvedValue({ status: "received", attempt: 1, message: REGISTRATION_RECEIVED });
    render(<RegistrationForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create candidate account" }));
    await screen.findByText(REGISTRATION_RECEIVED);
    expect(document.activeElement).toBe(screen.getByRole("status"));
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue to sign in" }).getAttribute("href")).toBe("/login");
  });
});
