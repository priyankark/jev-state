import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import {
  executeTurn,
  evaluateCase,
} from "../../packages/core/src/conversation.js";

const key = "test-personal-jev-key-never-persist";
async function enablePersonalConnections(page: Page) {
  await page.route("**/api/studio/connections", (route) =>
    route.fulfill({
      json: {
        jev: false,
        openai: false,
        byok: true,
        liveEnabled: true,
        sources: { jev: null, openai: null },
        model: "test-model",
      },
    }),
  );
  await page.route("**/api/studio/connections/key", (route) => {
    expect(route.request().headers()["x-jev-request"]).toBe("1");
    expect(route.request().postDataJSON()).toEqual({
      provider: "jev",
      key,
      consent: true,
    });
    return route.fulfill({ json: { ok: true } });
  });
}
async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect Jev", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Connection setup" });
  await modal.getByLabel("API key", { exact: true }).fill(key);
  await expect(
    modal.getByRole("button", { name: "Connect Jev", exact: true }),
  ).toBeDisabled();
  await modal.getByRole("checkbox").check();
  await modal.getByRole("button", { name: "Connect Jev", exact: true }).click();
  await expect(modal).toHaveCount(0);
}
async function createProject(page: Page) {
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("button", { name: "Try", exact: true }).click();
}

test("live Jev is the default from home through conversation and evaluation", async ({
  page,
}) => {
  await enablePersonalConnections(page);
  let providerRequests = 0;
  await page.route("**/api/studio/turn", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.mode).toBe("live");
    expect(route.request().headers()["x-jev-jev-key"]).toBe(key);
    providerRequests++;
    // Controlled decisions exercise the live UI without spending provider credits.
    const result = await executeTurn(
      { ...body, mode: "mock" },
      {},
      AbortSignal.timeout(1000),
    );
    await route.fulfill({
      json: { ...result, mode: "live", model: "test-jev" },
    });
  });
  await page.route("**/api/studio/eval-case", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.mode).toBe("live");
    expect(route.request().headers()["x-jev-jev-key"]).toBe(key);
    providerRequests++;
    const result = await evaluateCase(
      body.project,
      body.test,
      "mock",
      {},
      AbortSignal.timeout(1000),
    );
    await route.fulfill({
      json: {
        ...result,
        turns: result.turns.map((turn) => ({
          ...turn,
          mode: "live",
          model: "test-jev",
        })),
      },
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("Get started with live Jev")).toBeVisible();
  await page.screenshot({ path: ".local/live-home.png", fullPage: true });
  await connect(page);
  expect(providerRequests).toBe(0);
  await createProject(page);
  await expect(
    page.getByRole("button", { name: "Live Jev", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("textbox", { name: "Conversation message" })
    .fill("charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  expect(providerRequests).toBe(1);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Live Jev", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Passed", exact: true }),
  ).toHaveCount(3);
  await expect(page.getByLabel("Current workflow checks")).toContainText(
    "3/3 live checks passed",
  );
  expect(providerRequests).toBe(4);
});

test("optional simulation works without connecting and live evaluations wait for a key", async ({
  page,
}) => {
  await enablePersonalConnections(page);
  await page.goto("/");
  await createProject(page);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run 3 cases" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Connect Jev", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/live-connect-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Simulation", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Conversation message" })
    .fill("charged twice");
  const sent = page.waitForRequest("**/api/studio/turn");
  await page.getByRole("button", { name: "Send message" }).click();
  const request = await sent;
  expect(request.postDataJSON().mode).toBe("mock");
  expect(request.headers()["x-jev-jev-key"]).toBeUndefined();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
});

test("personal keys are opt-in, never persisted or exported, isolated between tabs, and cleared on reload", async ({
  page,
  context,
}) => {
  await enablePersonalConnections(page);
  await page.goto("/");
  await createProject(page);
  await expect(
    page.getByRole("button", { name: "Live Jev", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("textbox", { name: "Conversation message" })
    .fill("hello");
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeDisabled();
  await connect(page);
  await expect(
    page.getByRole("button", { name: "Live Jev", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Live Jev", exact: true }),
  ).toHaveClass("active");
  await page.getByRole("button", { name: "Simulation", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Conversation message" });
  await input.fill("charged twice");
  const sent = page.waitForRequest("**/api/studio/turn");
  await page.getByRole("button", { name: "Send message" }).click();
  const simulation = await sent;
  expect(simulation.headers()["x-jev-jev-key"]).toBeUndefined();
  expect(simulation.postDataJSON().mode).toBe("mock");
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("button", { name: "Live Jev", exact: true }).click();
  // Route live calls to a controlled failure: exercise key transport without paid inference.
  await page.route("**/api/studio/turn", (route) => {
    expect(route.request().headers()["x-jev-jev-key"]).toBe(key);
    expect(route.request().headers()["x-jev-openai-key"]).toBeUndefined();
    expect(route.request().postDataJSON().mode).toBe("live");
    expect(route.request().postData()).not.toContain(key);
    return route.fulfill({
      status: 502,
      json: { error: "Controlled provider failure" },
    });
  });
  await input.fill("charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Controlled provider failure",
  );
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(storage).not.toContain(key);
  expect(JSON.stringify(await context.cookies())).not.toContain(key);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up workspace" }).click();
  expect(
    await readFile((await (await download).path())!, "utf8"),
  ).not.toContain(key);
  await page
    .getByRole("button", { name: "Get code", exact: true })
    .first()
    .click();
  const codeDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download runnable project" }).click();
  const archive = unzipSync(
    await readFile((await (await codeDownload).path())!),
  );
  for (const content of Object.values(archive))
    expect(strFromU8(content)).not.toContain(key);
  const other = await context.newPage();
  await enablePersonalConnections(other);
  await other.goto("/");
  await other.getByRole("button", { name: /Connections/ }).click();
  await expect(other.getByText("Not connected", { exact: true })).toHaveCount(
    2,
  );
  await other.close();
  await page.reload();
  await page.getByRole("button", { name: /Connections/ }).click();
  await expect(page.getByText("Not connected", { exact: true })).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Disconnect and forget keys" }),
  ).toHaveCount(0);
});

test("Disconnect clears personal headers and mobile connection forms remain usable", async ({
  page,
}) => {
  await enablePersonalConnections(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Connections/ }).click();
  await connect(page);
  await expect(
    page.getByText("Connected · this tab", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disconnect and forget keys" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/byok-mobile.png", fullPage: true });
  await page.route("**/api/studio/connections/test", (route) => {
    expect(route.request().headers()["x-jev-jev-key"]).toBe(key);
    return route.fulfill({ json: { ok: true, models: ["test-jev"] } });
  });
  await page.getByRole("button", { name: "Test connection" }).first().click();
  await expect(page.getByText("Jev connection verified.")).toBeVisible();
  await page
    .getByRole("button", { name: "Disconnect and forget keys" })
    .click();
  await expect(page.getByText("Not connected", { exact: true })).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Test connection" }).first(),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: /Projects/ })
    .first()
    .click();
  await createProject(page);
  await expect(
    page.getByRole("button", { name: "Live Jev", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Connect Jev", exact: true }),
  ).toBeVisible();
});

test("failed verification clears the input and does not save a connection", async ({
  page,
}) => {
  await enablePersonalConnections(page);
  await page.route("**/api/studio/connections/key", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "Could not verify this key." },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Connections/ }).click();
  await page.getByRole("button", { name: "Connect Jev", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Connection setup" });
  await modal.getByLabel("API key", { exact: true }).fill(key);
  await modal.getByRole("checkbox").check();
  await modal.getByRole("button", { name: "Connect Jev", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("Could not verify");
  await expect(modal.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.screenshot({ path: ".local/byok-error.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(page.getByText("Not connected", { exact: true })).toHaveCount(2);
});
