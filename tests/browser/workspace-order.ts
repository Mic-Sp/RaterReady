import { expect, type Page } from "@playwright/test";

/** Check DOM and visible heading geometry at the current viewport; source-first order must not be a desktop-only CSS illusion. */
export async function expectSourceFirst(page: Page, evidence: string, rubric: string) {
  const titles = ["Task prompt", evidence, rubric, "Response A", "Response B"];
  const headings = await page.locator("main h2").allTextContents();
  const indexes = titles.map((title) => headings.indexOf(title));
  expect(indexes.every((position, index) => position >= 0 && (index === 0 || position > indexes[index - 1]))).toBe(true);
  const source = await page.getByRole("heading", { name: evidence, exact: true }).boundingBox();
  const pinned = await page.getByRole("heading", { name: rubric, exact: true }).boundingBox();
  const a = await page.getByRole("heading", { name: "Response A", exact: true }).boundingBox();
  expect(source!.y).toBeLessThan(pinned!.y);
  expect(pinned!.y).toBeLessThan(a!.y);
}
