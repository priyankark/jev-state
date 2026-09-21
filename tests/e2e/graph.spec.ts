import { test, expect, type Page } from "@playwright/test";

async function createSupport(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Use this example" }).first().click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Graph interaction test");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.locator('.react-flow__node[data-id="welcome"]'),
  ).toBeVisible();
}
const node = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const edge = (page: Page, from: string, to: string) =>
  page.locator(`.react-flow__edge[data-id="${from}->${to}"]`);
async function connect(page: Page, from: string, to: string) {
  const source = await node(page, from)
    .locator(".react-flow__handle.source")
    .boundingBox();
  const target = await node(page, to)
    .locator(".react-flow__handle.target")
    .boundingBox();
  if (!source || !target) throw new Error("Missing connection handle");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
}

test("canvas drag, connections, undo, state editing and layout persist through save and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createSupport(page);
  await expect(
    page.getByRole("button", { name: "Save workflow" }),
  ).toBeInViewport();
  const viewport = page.locator(".react-flow__viewport");
  // A drag must move the state, not pan the entire graph.
  const originalViewport = await viewport.getAttribute("style");
  const originalPosition = await node(page, "welcome").getAttribute("style");
  const box = (await node(page, "welcome").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 35,
    box.y + box.height / 2 + 60,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(node(page, "welcome")).not.toHaveAttribute(
    "style",
    originalPosition!,
  );
  await expect(viewport).toHaveAttribute("style", originalViewport!);
  const draggedPosition = await node(page, "welcome").getAttribute("style");
  await page.getByRole("button", { name: "Undo workflow change" }).click();
  await expect(node(page, "welcome")).toHaveAttribute(
    "style",
    originalPosition!,
  );
  await page.getByRole("button", { name: "Redo workflow change" }).click();
  await expect(node(page, "welcome")).toHaveAttribute(
    "style",
    draggedPosition!,
  );
  // Connect two handles and exercise the same transition in both editors.
  await connect(page, "billing", "technical");
  await expect(edge(page, "billing", "technical")).toHaveCount(1);
  await node(page, "billing").click();
  await expect(
    page.getByRole("checkbox", { name: "Technical help", exact: true }),
  ).toBeChecked();
  const linePoint = await edge(page, "billing", "technical")
    .locator(".react-flow__edge-path")
    .evaluate((el) => {
      const path = el as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() * 0.6);
      const transformed = new DOMPoint(point.x, point.y).matrixTransform(
        path.getScreenCTM()!,
      );
      return { x: transformed.x, y: transformed.y };
    });
  await page.mouse.click(linePoint.x, linePoint.y);
  await expect(page.locator(".p-edge-editor")).toContainText(
    "Billing help → Technical help",
  );
  await page
    .getByRole("button", { name: "Remove transition", exact: true })
    .click();
  await expect(edge(page, "billing", "technical")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo workflow change" }).click();
  await expect(edge(page, "billing", "technical")).toHaveCount(1);
  await page.getByRole("button", { name: "Add state", exact: true }).click();
  await page.getByLabel("State name", { exact: true }).fill("Follow-up");
  await page
    .getByLabel("When should we enter this state?")
    .fill("The customer asks for a follow-up.");
  await expect(edge(page, "billing", "state_6")).toHaveCount(1);
  await page
    .getByRole("checkbox", { name: "End the conversation here" })
    .check();
  await expect(node(page, "state_6").locator(".source")).toHaveCount(0);
  await page.getByText("Simulation hints", { exact: true }).click();
  const keywords = page.getByLabel("Match these words (comma separated)");
  await keywords.pressSequentially("follow, later", { delay: 30 });
  await keywords.press("Tab");
  await expect(keywords).toHaveValue("follow, later");
  await page
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: /Graph interaction test/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Define", exact: true }).click();
  await expect(node(page, "welcome")).toHaveAttribute(
    "style",
    draggedPosition!,
  );
  await expect(edge(page, "billing", "technical")).toHaveCount(1);
  await node(page, "state_6").click();
  await expect(page.getByLabel("State name", { exact: true })).toHaveValue(
    "Follow-up",
  );
  await page.getByText("Simulation hints", { exact: true }).click();
  await expect(keywords).toHaveValue("follow, later");
  await page.getByRole("button", { name: "Remove state", exact: true }).click();
  await expect(node(page, "state_6")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo workflow change" }).click();
  await expect(node(page, "state_6")).toHaveCount(1);
  await page.getByRole("button", { name: "Auto layout", exact: true }).click();
  await expect(node(page, "welcome")).not.toHaveAttribute(
    "style",
    draggedPosition!,
  );
  await page.getByRole("button", { name: "Expand graph" }).click();
  await expect(page.locator(".p-graph-expanded")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".p-graph-expanded")).toHaveCount(0);
  await page.screenshot({ path: ".local/ux/graph-tested.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("saved changes flow into conversations, inspection and multi-turn evaluations", async ({
  page,
}) => {
  await createSupport(page);
  await page
    .getByRole("button", { name: "Workflow settings", exact: true })
    .click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("My support workflow");
  // Switching to testing saves valid edits instead of blocking behind an error.
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My support workflow" }),
  ).toBeVisible();
  await node(page, "billing").click();
  await expect(page.locator(".p-state-peek")).toContainText("Billing help");
  await expect(page.locator(".p-current-state")).toContainText("Welcome");
  await page.getByRole("button", { name: "Close state inspection" }).click();
  await page.getByLabel("Conversation message").fill("I was charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await expect(edge(page, "welcome", "billing")).toHaveClass(/animated/);
  await expect(edge(page, "technical", "resolved")).not.toHaveClass(/animated/);
  // Rearranging the graph must not reset an in-progress conversation.
  await page.getByRole("button", { name: "Define", exact: true }).click();
  await page.getByRole("button", { name: "Auto layout", exact: true }).click();
  await page
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await page.getByLabel("Conversation message").fill("It is fixed now");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Conversation complete", { exact: true }),
  ).toBeVisible();
  await page.locator(".p-turn-pill").first().click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await expect(edge(page, "welcome", "billing")).toHaveClass(/animated/);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Run 3 cases" }).click();
  await expect(
    page.getByRole("button", { name: "Passed", exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Define", exact: true }).click();
  await page
    .getByRole("button", { name: "Workflow settings", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Initial state", exact: true })
    .selectOption("billing");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.locator(".p-report-stale")).toBeVisible();
  await page.screenshot({
    path: ".local/ux/evaluation-tested.png",
    fullPage: true,
  });
});

test("mobile graph and state controls remain reachable without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createSupport(page);
  await page
    .locator(".p-state-list")
    .getByRole("button", { name: "Billing help", exact: true })
    .click();
  await expect(page.getByLabel("State name", { exact: true })).toHaveValue(
    "Billing help",
  );
  await page.getByLabel("State name", { exact: true }).fill("Billing support");
  await page
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand graph" }).click();
  await expect(
    page.getByRole("button", { name: "Collapse graph" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Collapse graph" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/ux/mobile-builder-tested.png",
    fullPage: true,
  });
});

test("evaluation errors appear inside the dialog and keyboard focus stays in it", async ({
  page,
}) => {
  await createSupport(page);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Add case", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit test case" });
  await page.getByLabel("User message 1").fill(" ");
  await page.getByRole("button", { name: "Save test case" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Add 1–5 non-empty user messages.",
  );
  await page.getByRole("button", { name: "Save test case" }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close case editor" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add case", exact: true }),
  ).toBeFocused();
});

test("a fresh template keeps its active conversation after its first layout save", async ({
  page,
}) => {
  await createSupport(page);
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await page.getByLabel("Conversation message").fill("I was charged twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
  await page.getByRole("button", { name: "Define", exact: true }).click();
  await page.getByRole("button", { name: "Auto layout", exact: true }).click();
  await page
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await expect(page.locator(".p-version")).toHaveText("v1");
  await page.getByRole("button", { name: "Try", exact: true }).click();
  await expect(page.locator(".p-current-state")).toContainText("Billing help");
});
