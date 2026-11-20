import { handlers } from "../../../../lib/auth";

/** Public Auth.js protocol endpoints; Credentials POSTs use Auth.js CSRF validation, not registration. */
export const { GET, POST } = handlers;
export const runtime = "nodejs";
