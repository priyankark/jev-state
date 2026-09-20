import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("workspace backup restores conversations and evaluations, and rejects malformed history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("button", { name: "Converse", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Conversation message" })
    .fill("charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await page.getByRole("button", { name: "Evaluate", exact: true }).click();
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Passed", exact: true }),
  ).toHaveCount(3);
  await expect(page.getByLabel("Evaluation coverage")).toContainText(
    "transitions taken",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up workspace" }).click();
  const download = await pending;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.workspace.conversations).toHaveLength(1);
  expect(backup.workspace.reports).toHaveLength(1);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Restore workspace file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator(".p-project-card")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Back up workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore workspace", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".p-project-card")).toHaveCount(1);
  backup.workspace.conversations[0].turns = null;
  await page.getByLabel("Restore workspace file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("alert")).toContainText(
    "invalid projects or conversation history",
  );
  await expect(page.locator(".p-project-card")).toHaveCount(1);
});

test("a failed provider request preserves the message and state for a successful retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("button", { name: "Converse", exact: true }).click();
  await page.route("**/api/studio/turn", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Provider unavailable. Try again." }),
    }),
  );
  const input = page.getByRole("textbox", { name: "Conversation message" });
  await input.fill("I was charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert")).toContainText("Provider unavailable");
  await expect(input).toHaveValue("I was charged twice");
  await expect(page.locator(".p-current-state")).toContainText("Welcome");
  await page.unroute("**/api/studio/turn");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await expect(input).toHaveValue("");
});

test("corrupt browser data is preserved and two tabs cannot silently overwrite each other", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("jev-state-workspace-v2", "{broken"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Saved data could not be read",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("jev-state-workspace-v2")),
  ).toBe("{broken");
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Reset workspace", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Use this example" }).first().click();
  await other
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("changed in another tab");
  await expect(
    page.getByText("Changes are not saved", { exact: true }),
  ).toBeVisible();
  await other.close();
});

test("storage quota failure offers backup and never claims changes were saved", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "jev-state-workspace-v2")
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Device storage is full");
  await expect(
    page.getByText("Changes are not saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back up workspace" }),
  ).toBeVisible();
});
