import { test, expect, type Page } from "@playwright/test";

async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("button", { name: "Test", exact: true }).click();
}
async function setBillingFixture(page: Page, words: string) {
  await page.getByRole("button", { name: "Define", exact: true }).click();
  await page.locator('.react-flow__node[data-id="billing"]').click();
  const details = page
    .locator("details")
    .filter({ has: page.getByText("Simulation hints", { exact: true }) });
  if (!(await details.getAttribute("open"))) {
    // Empty string is a present boolean attribute, so check via DOM property.
    if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
      await details.locator("summary").click();
  }
  const input = page.getByLabel("Match these words (comma separated)");
  await input.fill(words);
  await input.press("Tab");
  await page.getByRole("button", { name: "Test", exact: true }).click();
}

test("intermediate expectations expose the wrong step and persist through reload", async ({
  page,
}) => {
  await create(page);
  await page
    .getByRole("button", { name: "Billing → resolved", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Check intermediate states" })
    .check();
  await page
    .getByLabel("Expected state after turn 1")
    .selectOption("technical");
  await page.getByRole("button", { name: "Save test case" }).click();
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Failed", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Evaluation result" });
  await expect(dialog).toContainText("Expected resolved · reached resolved");
  await expect(dialog).toContainText(
    "Turn 1: expected technical; reached billing",
  );
  const turn = page.getByLabel("Decision at turn 1");
  await expect(turn).toContainText("I was charged twice for my subscription.");
  await expect(turn).toContainText("Path mismatch");
  await turn.locator("summary").click();
  await expect(turn).toContainText("The conversation is about charges");
  await page.screenshot({ path: ".local/decision-trace.png", fullPage: true });
  await page.getByRole("button", { name: "Review state criteria" }).click();
  await expect(page.getByLabel("State name", { exact: true })).toHaveValue(
    "Technical help",
  );
  await page.getByRole("button", { name: "Remove state", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("regression cases");
  await expect(
    page.locator('.react-flow__node[data-id="technical"]'),
  ).toBeVisible();
  await page.reload();
  await page.locator(".p-project-card").first().click();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await expect(page.getByLabel("Decision at turn 1")).toContainText(
    "Path mismatch",
  );
  await page
    .getByRole("button", { name: "Edit expectation", exact: true })
    .click();
  await expect(page.getByLabel("Expected state after turn 1")).toHaveValue(
    "technical",
  );
  await page
    .getByLabel("User message 1")
    .fill("different first message\nIt is fixed now");
  await expect(
    page.getByRole("checkbox", { name: "Check intermediate states" }),
  ).not.toBeChecked();
  const secondMessage = await page.getByLabel("User message 2").inputValue();
  await page
    .getByRole("button", { name: "Add user turn", exact: true })
    .click();
  await page.getByLabel("User message 3").fill("One more question");
  await page
    .getByRole("button", { name: "Remove user turn 3", exact: true })
    .click();
  await page.getByRole("button", { name: "Save test case" }).click();
  await page
    .getByRole("button", { name: "Billing → resolved", exact: true })
    .click();
  await expect(page.getByLabel("User message 1")).toHaveValue(
    "different first message\nIt is fixed now",
  );
  await expect(page.getByLabel("User message 2")).toHaveValue(secondMessage);
  await expect(page.getByLabel("User message 3")).toHaveCount(0);
});

test("editing behavior shows regressions, restoring it shows fixes, and comparisons are visible on mobile", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Passed", exact: true }),
  ).toHaveCount(3);
  await setBillingFixture(page, "unmatched-special-phrase");
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(page.getByLabel("Changes since previous run")).toContainText(
    "1 regressed · 0 fixed",
  );
  await expect(page.locator(".p-case-change.regressed")).toHaveCount(1);
  await setBillingFixture(page, "charged, invoice, refund");
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(page.getByLabel("Changes since previous run")).toContainText(
    "0 regressed · 1 fixed",
  );
  await expect(page.locator(".p-case-change.fixed")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const mobileResult = page
    .getByRole("button", { name: "Passed", exact: true })
    .first();
  await mobileResult.scrollIntoViewIfNeeded();
  const resultBox = await mobileResult.boundingBox();
  expect(resultBox!.x).toBeGreaterThanOrEqual(0);
  expect(resultBox!.x + resultBox!.width).toBeLessThanOrEqual(390);
  await mobileResult.click();
  await expect(page.getByLabel("Decision at turn 1")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: ".local/regression-comparison-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View previous run", exact: true })
    .click();
  await expect(page.getByLabel("Changes since previous run")).toContainText(
    "1 regressed · 0 fixed",
  );
});
