import { test, expect } from "@playwright/test";
test("examples are separate, editable copies support conversations and multi-turn evaluations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your projects" }),
  ).toBeVisible();
  await expect(
    page.getByText("These are sample workflows—not your projects."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page.getByLabel("Project name").fill("My conversation agent");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My conversation agent" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Conversation message" })
    .fill("I was charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await page
    .getByRole("textbox", { name: "Conversation message" })
    .fill("It is fixed now");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Conversation complete", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /My conversation agent/ })
    .first()
    .click();
  await page
    .locator(".p-session-history button")
    .filter({ hasText: "I was charged twice" })
    .click();
  await expect(
    page.getByText("Conversation complete", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Passed", exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Add case", exact: true }).click();
  await page.getByLabel("Case name").fill("Explicit failure");
  await page.getByLabel("User message 1").fill("I was charged twice");
  await page.getByLabel("Expected final state").selectOption("technical");
  await page.getByRole("button", { name: "Save test case" }).click();
  await page.getByRole("button", { name: "Run 4 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Failed", exact: false }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Failed", exact: false }).click();
  await expect(page.locator(".p-detail-modal")).toContainText(
    "reached billing",
  );
  await page.getByRole("button", { name: "Close result" }).click();
  await page.getByRole("button", { name: "Define", exact: true }).click();
  await page
    .getByRole("button", { name: "Workflow settings", exact: true })
    .click();
  await page.getByLabel("Project name", { exact: true }).fill("Renamed agent");
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed agent" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: ".local/product-builder.png", fullPage: true });
});
test("new workspace home is responsive and connections explain setup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your projects" }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/product-home.png", fullPage: true });
  await page.getByRole("button", { name: "Connections", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set up" }).last().click();
  await expect(page.getByText("OPENAI_API_KEY", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close connection setup" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Projects", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your projects" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/product-mobile.png", fullPage: true });
});
