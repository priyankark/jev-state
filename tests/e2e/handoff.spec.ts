import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

test("a conversation becomes a regression, a failure leads to criteria, and code carries current behavior", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByText(/Leave with runnable TypeScript/)).toBeVisible();
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("My tested support flow");
  await page
    .getByLabel("What should your agent do?")
    .fill(
      "Route billing questions to billing help. Only close when the user confirms resolution.",
    );
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByLabel("Next step")).toContainText("1 · DEFINE");
  await page
    .getByRole("button", { name: "Try a conversation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Conversation message" })
    .fill("charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await page.getByRole("button", { name: "Save as regression test" }).click();
  await expect(page.getByLabel("User message 1")).toHaveValue("charged twice");
  await page
    .getByLabel("Case name", { exact: true })
    .fill("Billing should reach technical — deliberate failure");
  await page.getByLabel("Expected final state").selectOption("technical");
  await page.getByRole("button", { name: "Save test case" }).click();
  await expect(page.getByLabel("Next step")).toContainText("3 · CHECK");
  await page.getByRole("button", { name: "Run 4 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Failed", exact: false }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Failed", exact: false }).click();
  await page.getByRole("button", { name: "Review state criteria" }).click();
  await expect(page.getByLabel("State name", { exact: true })).toHaveValue(
    "Technical help",
  );
  // Saving changed criteria must invalidate existing evidence before export.
  await page
    .getByLabel("When should we enter this state?")
    .fill(
      "The user reports a technical problem, such as an application error.",
    );
  await page
    .getByRole("button", { name: "Get code", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Validation status")).toContainText(
    "Workflow changed — rerun tests",
  );
  await expect(page.getByLabel("Validation status")).toContainText(
    "Live behavior not tested",
  );
  await page.getByRole("button", { name: "Copy file", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'from "./workflow.js"',
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download runnable project" }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe("jev-workflow.zip");
  const files = unzipSync(await readFile((await downloaded.path())!));
  const workflow = JSON.parse(strFromU8(files["workflow.json"]!));
  expect(workflow.name).toBe("My tested support flow");
  expect(workflow.cases).toHaveLength(4);
  expect(
    workflow.states.find((s: { id: string }) => s.id === "technical")
      .description,
  ).toContain("application error");
  expect(
    JSON.parse(strFromU8(files["validation.json"]!)).simulation.status,
  ).toBe("stale");
  expect(strFromU8(files[".env.example"]!)).toContain("TYPESAFE_API_KEY=\n");
  expect(files["lib/conversation.ts"]).toBeDefined();
  await page.screenshot({ path: ".local/handoff-desktop.png", fullPage: true });
});

test("code handoff is reachable on mobile and distinguishes passing simulation from live validation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Passed", exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Use in your app" }).click();
  await expect(page.getByLabel("Validation status")).toContainText(
    "3/3 simulation checks passed",
  );
  await expect(page.getByLabel("Validation status")).toContainText(
    "Live behavior not tested",
  );
  await page.getByLabel("Preview exported file").selectOption("workflow.json");
  await expect(page.getByLabel("Source of workflow.json")).toContainText(
    '"expectedState"',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/handoff-mobile.png", fullPage: true });
});
