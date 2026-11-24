import { expect, type Page } from "@playwright/test";

/** Inspect visible labels across candidate/admin/public views; editable values and serialized framework data are deliberately excluded. */
export async function expectSyntheticBadges(page: Page) {
  const missing = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode; const parent = node.parentElement;
      if (!parent || !node.textContent?.includes("DEMO - SYNTHETIC") || parent.closest("script,style,noscript,textarea,input,option,title,[data-synthetic-badge]")) continue;
      if (parent.getClientRects().length) found.push(`${parent.tagName}: ${node.textContent.slice(0, 120)}`);
    }
    return found;
  });
  expect(missing).toEqual([]);
  const badges = page.locator('[data-synthetic-badge="true"]');
  expect(await badges.count()).toBeGreaterThan(0);
  expect(await badges.evaluateAll((elements) => elements.flatMap((element) => {
    const style = getComputedStyle(element);
    // A badge that is itself a navigation flex item is blockified to computed display:flex by the browser.
    const valid = ["inline-flex", "flex"].includes(style.display) && style.borderTopStyle === "solid" && style.borderTopWidth === "2px"
      && style.backgroundColor === "rgb(255, 240, 194)" && style.color === "rgb(99, 55, 4)";
    return valid ? [] : [{ label: element.textContent, display: style.display, border: style.borderTopWidth, background: style.backgroundColor, color: style.color }];
  }))).toEqual([]);
}

/** Each learning surface must own a visible header/body and border; task/evidence/rubric cards retain breathing room in DOM order. */
export async function expectWorkspaceCards(page: Page) {
  const cards = page.locator("[data-workspace-section]");
  expect(await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-workspace-section")))).toEqual(["task", "evidence", "rubric", "response-a", "response-b"]);
  expect(await cards.evaluateAll((elements) => elements.every((element) => {
    const header = element.querySelector(":scope > .workspace-card-header");
    return getComputedStyle(element).borderTopWidth === "2px" && header !== null
      && getComputedStyle(header).borderBottomStyle === "solid" && element.querySelector(":scope > .workspace-card-content") !== null;
  }))).toBe(true);
  for (let index = 1; index < 3; index++) {
    const before = await cards.nth(index - 1).boundingBox(); const after = await cards.nth(index).boundingBox();
    expect(after!.y - before!.y - before!.height).toBeGreaterThanOrEqual(24);
  }
}
