import { test, expect, type Page } from "@playwright/test";

const isWebGPUProject = (name: string) => name.includes("webgpu");

async function openApp(page: Page, projectName: string) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/${isWebGPUProject(projectName) ? "?" : "?renderer=webgl2"}`);
  await page.waitForFunction(() => !!window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90_000 });
  // fixed quality so the drawing-buffer scale cannot change during the test
  await page.evaluate(() => window.__pecvdTwin!.store.getState().setQualityPreset("high"));
  await page.waitForTimeout(500);
  return errors;
}

/** Tree width and visibility, and the 3D canvas width in CSS and drawing-buffer pixels. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const tree = document.querySelector<HTMLElement>('[data-testid="component-tree"]')!;
    const canvas = document.getElementById("pecvd-canvas") as HTMLCanvasElement;
    return { tree: tree.getBoundingClientRect().width, shown: tree.offsetParent !== null, css: canvas.clientWidth, buffer: canvas.width };
  });

/** Drags the tree edge (or the folded rail) from its middle to the given x. */
async function dragEdge(page: Page, toX: number) {
  const b = (await page.getByTestId("tree-resizer").boundingBox())!;
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + b.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test.describe("Component tree dock", () => {
  test("the edge drags to resize, folds the tree into the left rail and opens it again; the canvas follows", async ({ page }, info) => {
    const errors = await openApp(page, info.project.name);
    const edge = page.getByTestId("tree-resizer");
    const tree = page.getByTestId("component-tree");
    const start = await layout(page);
    expect(start.tree).toBe(234);
    const scale = start.buffer / start.css;

    // narrower: the canvas takes the space and its drawing buffer follows (no stretched image)
    const b = (await edge.boundingBox())!;
    await dragEdge(page, b.x + b.width / 2 - 60);
    let l = await layout(page);
    expect(Math.abs(l.tree - 174)).toBeLessThanOrEqual(1);
    expect(l.css).toBe(start.css + start.tree - l.tree);
    expect(Math.abs(l.buffer / l.css - scale)).toBeLessThan(0.01);

    // past the minimum the width holds at 160; further left the tree folds into the 16 px rail
    await dragEdge(page, 130);
    expect((await layout(page)).tree).toBe(160);
    await dragEdge(page, 20);
    l = await layout(page);
    expect(l.shown).toBe(false);
    expect(l.css).toBe(start.css + start.tree - 16);
    await expect(edge).toHaveAttribute("aria-valuenow", "0");
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().panels.tree)).toBe(false);

    // a click on the rail opens it at the width it had before the fold
    const rail = (await edge.boundingBox())!;
    await page.mouse.click(rail.x + rail.width / 2, rail.y + 200);
    await page.waitForTimeout(250);
    expect((await layout(page)).tree).toBe(160);

    // the header button and the top-bar toggle fold and open the same rail; the search text survives
    await page.getByTestId("tree-search").fill("lid");
    await page.getByTestId("fold-tree").click();
    await expect(tree).toBeHidden();
    await page.getByTestId("toggle-tree").click();
    await expect(tree).toBeVisible();
    await expect(page.getByTestId("tree-search")).toHaveValue("lid");

    // dragging the rail out sets the width directly; double-click brings back the default
    await page.getByTestId("toggle-tree").click();
    const railMid = (await edge.boundingBox())!;
    await dragEdge(page, 400);
    expect(Math.abs((await layout(page)).tree - (400 - (railMid.x + railMid.width / 2)))).toBeLessThanOrEqual(1);
    const e = (await edge.boundingBox())!;
    await page.mouse.dblclick(e.x + e.width / 2, e.y + 300);
    await page.waitForTimeout(250);
    expect((await layout(page)).tree).toBe(234);

    // keyboard: arrows change the width, Enter folds and opens
    await edge.focus();
    await page.keyboard.press("ArrowLeft");
    expect((await layout(page)).tree).toBe(218);
    await page.keyboard.press("Enter");
    await expect(tree).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(tree).toBeVisible();
    expect((await layout(page)).tree).toBe(218);

    // the tree still selects at a narrow width
    await dragEdge(page, 170);
    await page.getByTestId("tree-search").fill("");
    await page.getByTestId("tree-item-lid").locator("button").first().click();
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().selectedAssetId)).toBe("lid");
    expect(errors.filter((x) => !x.includes("Outdated Optimize Dep"))).toEqual([]);
  });
});
