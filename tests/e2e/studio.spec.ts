import { test, expect } from "@playwright/test";

test("routing, inspection, replay, cancellation and trace import", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requests = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/runs")) requests++;
  });
  await page.goto("/legacy");
  await expect(
    page.getByRole("heading", { name: "Support routing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run event" }).click();
  await expect(page.locator(".policy-result")).toContainText(
    "Billing selected",
  );
  await expect(page.locator(".machine-node.active")).toContainText("Billing");
  await page.getByRole("button", { name: "Context", exact: true }).click();
  await expect(page.locator(".inspector-body")).toContainText("charged twice");
  await page.getByRole("button", { name: "Questions", exact: true }).click();
  await expect(page.locator(".inspector-body")).toContainText(
    "Which team should handle",
  );
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export trace" }).click();
  const download = await exported;
  const path = (await download.path())!;
  const count = requests;
  await page.getByRole("button", { name: /Replay this run/ }).click();
  await expect(page.locator(".state-pill")).toContainText("REPLAY");
  await expect(page.locator(".machine-node.active")).toContainText("Ready");
  await page.getByRole("button", { name: "Next trace step" }).click();
  await expect(page.locator(".machine-node.active")).toContainText(
    "Evaluate ticket",
  );
  await page.getByRole("button", { name: "Next trace step" }).click();
  await expect(page.locator(".machine-node.active")).toContainText("Billing");
  assertNoNewCalls();
  await page.getByRole("button", { name: "Exit replay" }).click();
  await page.getByLabel("Mock scenario").selectOption("uncertain");
  await page.getByRole("button", { name: "Run event" }).click();
  await expect(page.locator(".policy-result")).toContainText(
    "Human review selected",
  );
  await page.getByLabel("Mock scenario").selectOption("error");
  await page.getByRole("button", { name: "Run event" }).click();
  await expect(page.locator(".policy-result")).toContainText(
    "could not complete",
  );
  await page.getByLabel("Mock scenario").selectOption("auto");
  await page.getByRole("button", { name: "Run event" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".state-pill")).toContainText("Cancelled");
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(page.locator(".state-pill")).toContainText("REPLAY");
  await page.getByRole("button", { name: "Next trace step" }).click();
  await page.getByRole("button", { name: "Next trace step" }).click();
  await expect(page.locator(".policy-result")).toContainText(
    "Billing selected",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".machine-node.active")).toBeInViewport();
  await page.screenshot({ path: ".local/studio-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
  function assertNoNewCalls() {
    expect(requests).toBe(count);
  }
});
test("mobile layout and malformed import", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/legacy");
  await expect(
    page.getByRole("heading", { name: "Support routing" }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schemaVersion":999}'),
    });
  await expect(page.getByRole("alert")).toContainText("not a valid");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/studio-mobile.png", fullPage: true });
});
