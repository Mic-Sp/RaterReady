export const missingPage = {
  title: "Page not found",
  message: "This page is unavailable. Check the link or return to RaterReady to continue.",
  action: "Return to RaterReady",
};

/**
 * Text-only browser 404 for default-private paths denied by the proxy. The response
 * uses public constants and a fixed home link. Nothing from the requested URL is rendered.
 */
export function missingPageResponse(method: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow"><title>${missingPage.title} | RaterReady</title>
  <style>
    body{margin:0;background:#f6f8fc;color:#172239;font:1rem/1.6 system-ui,sans-serif;overflow-wrap:anywhere}
    main{box-sizing:border-box;width:min(44rem,calc(100% - 2rem));margin:2rem auto;padding:clamp(1rem,4vw,2rem);background:white;border-radius:1rem;border:1px solid #d9e1ed}
    h1{font-size:1.8rem;line-height:1.2}a{display:inline-block;padding:.6rem 0;color:#283988;text-underline-offset:.15rem}
    :focus-visible{outline:3px solid #283988;outline-offset:4px}
  </style></head><body><main><p>RaterReady · 404</p><h1>${missingPage.title}</h1>
  <p>${missingPage.message}</p><a href="/">${missingPage.action}</a></main></body></html>`;
  return new Response(method === "HEAD" ? null : html, { status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
