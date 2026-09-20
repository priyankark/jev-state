import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";

test("cloud workspace persists across browser contexts, runs conversations and enforces three free projects", async ({
  browser,
}) => {
  test.skip(
    !process.env.RUN_CLOUD_BROWSER_TESTS,
    "Opt-in: requires a dedicated Supabase project and a deployed cloud API.",
  );
  test.setTimeout(90000);
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const email = `jev-browser-${randomUUID()}@example.com`,
    password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const contexts = [];
  try {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const login = async (p: typeof page) => {
      await p.goto(
        process.env.CLOUD_TEST_URL || "https://jev-state.vercel.app",
      );
      await p
        .getByRole("button", { name: "Already have an account? Sign in" })
        .click();
      await p.getByLabel("Email", { exact: true }).fill(email);
      await p.getByLabel("Password", { exact: true }).fill(password);
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        p.getByRole("heading", { name: "Your projects" }),
      ).toBeVisible();
    };
    await login(page);
    await page
      .getByRole("button", { name: "Use this example" })
      .first()
      .click();
    await page.getByLabel("Project name").fill("Cloud support");
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await page.getByRole("button", { name: "Converse", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Conversation message" })
      .fill("I was charged twice");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".p-current-state")).toContainText(
      "Billing help",
    );
    await page
      .getByRole("textbox", { name: "Conversation message" })
      .fill("It is fixed now");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByText("Conversation complete", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Evaluate", exact: true }).click();
    await page.getByRole("button", { name: "Run 3 cases" }).click();
    await expect(
      page.getByRole("button", { name: "Passed", exact: true }),
    ).toHaveCount(3);
    await expect(page.locator(".p-device")).toContainText("Saved to cloud");
    const second = await browser.newContext();
    contexts.push(second);
    const other = await second.newPage();
    await login(other);
    await other
      .getByRole("button", { name: /Cloud support/ })
      .first()
      .click();
    await other
      .locator(".p-session-history button")
      .filter({ hasText: "I was charged twice" })
      .click();
    await expect(
      other.getByText("Conversation complete", { exact: true }),
    ).toBeVisible();
    await other.close();
    for (let i = 2; i <= 4; i++) {
      await page
        .getByRole("button", { name: /^Projects/ })
        .first()
        .click();
      await page
        .getByRole("button", { name: "New project", exact: true })
        .click();
      await page.getByLabel("Project name").fill(`Cloud ${i}`);
      await page
        .getByRole("button", { name: "Create project", exact: true })
        .click();
      if (i < 4)
        await expect(page.locator(".p-device")).toContainText("Saved to cloud");
    }
    await expect(page.getByRole("alert")).toContainText(
      "Your plan includes 3 projects",
    );
    await page
      .getByRole("button", { name: "Plan & account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Plan & account" }),
    ).toBeVisible();
    await expect(page.getByText("3 projects · Current plan")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: ".local/cloud-mobile.png", fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
    await admin.auth.admin.deleteUser(created.data.user.id);
  }
});
