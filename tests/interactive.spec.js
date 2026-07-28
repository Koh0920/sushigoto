import { expect, test } from "@playwright/test";

test("opens an active sushi task and permits timer interaction", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-phase", "action");
  await expect(page.locator("#focusTitle")).toHaveText(
    "Capsule の公開手順を確認",
  );
  await expect(page.locator(".belt-item")).toHaveCount(4);

  const timer = page.locator("#timer");
  const before = await timer.textContent();
  await page.waitForTimeout(1200);
  await expect(timer).not.toHaveText(before);
  await page.locator("#startTimer").click();
  const paused = await timer.textContent();
  await page.waitForTimeout(1200);
  await expect(timer).toHaveText(paused);
  await page.locator("#startTimer").click();
  await page.waitForTimeout(1200);
  await expect(timer).not.toHaveText(paused);
});
