import { expect, test, type Page } from '@playwright/test';

let png: Buffer;

test.beforeAll(async ({ browser }) => {
  // A colourful test picture, so pieces are easy to tell apart in screenshots.
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(`<body style="margin:0;width:800px;height:600px;background:
    linear-gradient(45deg, #e63946, #f4a261, #2a9d8f, #264653, #e9c46a)"><div style="font:bold 120px sans-serif;
    color:white;padding:150px 80px">Jigsaw</div></body>`);
  png = await page.screenshot();
  await page.close();
});

let batch = 0;

async function mockSources(page: Page) {
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://commons.wikimedia.org/**', (route) => {
    batch += 1;
    const pages = [1, 2, 3, 4].map((i) => ({
      pageid: batch * 10 + i,
      title: `File:Garden ${batch}-${i}.jpg`,
      imageinfo: [
        {
          url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/G${batch}${i}.jpg`,
          thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/G${batch}${i}.jpg/1920px-G${batch}${i}.jpg`,
          width: 800,
          height: 600,
          mime: 'image/jpeg',
          extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Test Photographer' } },
        },
      ],
    }));
    return route.fulfill({ json: { query: { pages } }, headers: cors });
  });
  await page.route('https://api.artic.edu/**', (route) =>
    route.fulfill({
      headers: cors,
      json: {
        config: { iiif_url: 'https://www.artic.edu/iiif/2' },
        data: [1, 2, 3].map((i) => ({ id: batch * 100 + i, title: `Painting ${batch}-${i}`, image_id: `p${batch}${i}`, is_public_domain: true })),
      },
    }),
  );
  await page.route('https://collectionapi.metmuseum.org/**', (route) => route.abort());
  for (const host of ['https://upload.wikimedia.org/**', 'https://www.artic.edu/**']) {
    await page.route(host, (route) => route.fulfill({ body: png, contentType: 'image/png', headers: cors }));
  }
}

async function chooseAndStart(page: Page, pieces: string) {
  await page.locator('.suggestion:not(.placeholder)').first().click();
  await expect(page.getByRole('heading', { name: 'How many pieces?' })).toBeVisible();
  await page.getByRole('button', { name: pieces }).click();
  await page.getByRole('button', { name: 'Start the puzzle' }).click();
  await expect(page.locator('.tray-cell').first()).toBeVisible();
}

type Points = { now: { x: number; y: number }; target: { x: number; y: number }; inTray: boolean };
const points = (page: Page, id: number) =>
  page.evaluate((i) => (window as unknown as { jigsaw: { testPoints(id: number): Points } }).jigsaw.testPoints(i), id);

/** Drag the first piece showing in the tray to its right place. */
async function placeNextFromTray(page: Page) {
  const cell = page.locator('.tray-cell').first();
  const id = Number(await cell.getAttribute('data-id'));
  const box = (await cell.boundingBox())!;
  const { target } = await points(page, id);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 6, target.y - 5, { steps: 6 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await mockSources(page);
});

test('shows three suggestions and can refresh them', async ({ page }) => {
  await page.goto('./');
  const cards = page.locator('.suggestion:not(.placeholder)');
  await expect(cards).toHaveCount(3);
  const before = await cards.allTextContents();
  await page.getByRole('button', { name: 'Show me different pictures' }).click();
  await expect(cards).toHaveCount(3);
  await expect.poll(() => cards.allTextContents()).not.toEqual(before);
  const after = await cards.allTextContents();
  expect(after.filter((t) => before.includes(t))).toEqual([]);
});

test('a whole puzzle can be solved and the progress survives a reload', async ({ page }) => {
  await page.goto('./');
  await chooseAndStart(page, '25 pieces');
  const total = Number((await page.locator('.progress').textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(20);
  expect(total).toBeLessThanOrEqual(30);

  await placeNextFromTray(page);
  await placeNextFromTray(page);
  await expect(page.locator('.progress')).toHaveText(`2 of ${total} in place`);

  // A piece dropped far from its place stays loose on the table.
  const cell = page.locator('.tray-cell').first();
  const looseId = Number(await cell.getAttribute('data-id'));
  const box = (await cell.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(40, 120, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.progress')).toHaveText(`2 of ${total} in place`);

  await page.reload();
  await expect(page.locator('.progress')).toHaveText(`2 of ${total} in place`);
  await expect(page.locator('.layer .piece')).toHaveCount(3);

  // Move the loose piece from the table into place.
  const loose = await points(page, looseId);
  await page.mouse.move(loose.now.x, loose.now.y);
  await page.mouse.down();
  await page.mouse.move(loose.target.x, loose.target.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.progress')).toHaveText(`3 of ${total} in place`);

  while ((await page.locator('.tray-cell').count()) > 0) await placeNextFromTray(page);
  await expect(page.getByRole('heading', { name: 'Well done!' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Choose another picture' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a picture' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.carry-on')).toHaveCount(0);
});

test('the home screen offers to carry on, and starting anew asks first', async ({ page }) => {
  await page.goto('./');
  await chooseAndStart(page, '50 pieces');
  await placeNextFromTray(page);
  await page.getByRole('button', { name: 'Pictures' }).click();
  await expect(page.locator('.carry-on')).toContainText('1 of');
  await page.locator('.suggestion:not(.placeholder)').first().click();
  await page.getByRole('button', { name: '25 pieces' }).click();
  await page.getByRole('button', { name: 'Start the puzzle' }).click();
  await expect(page.getByRole('dialog', { name: 'Start this new puzzle?' })).toBeVisible();
  await page.getByRole('button', { name: 'No, go back' }).click();
  await page.getByRole('button', { name: 'Start the puzzle' }).click();
  await page.getByRole('button', { name: 'Yes, start new' }).click();
  await expect(page.locator('.progress')).toHaveText(/^0 of 2\d in place$/);
});

test('an uploaded photo with a custom piece count', async ({ page }) => {
  await page.goto('./');
  await page.locator('.file-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('heading', { name: 'How many pieces?' })).toBeVisible();
  await page.getByRole('button', { name: 'Other' }).click();
  await page.getByLabel('Number of pieces').fill('12');
  await expect(page.locator('.summary')).toHaveText('12 pieces, 4 across and 3 down');
  await page.getByRole('button', { name: 'More pieces' }).click();
  await expect(page.getByLabel('Number of pieces')).toHaveValue('17');
  await page.getByRole('button', { name: 'Start the puzzle' }).click();
  await expect(page.locator('.progress')).toHaveText(/^0 of 1[68] in place$/);
  await placeNextFromTray(page);
  await page.reload();
  await expect(page.locator('.progress')).toHaveText(/^1 of 1[68] in place$/);
});

test('the edge-piece filter and the big picture', async ({ page }) => {
  await page.goto('./');
  await chooseAndStart(page, '100 pieces');
  await page.getByRole('button', { name: 'Edge pieces' }).click();
  await expect(page.locator('.tray-info')).toContainText('edge pieces');
  const ids = await page.locator('.tray-cell').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.id)));
  const state = await page.evaluate(() => {
    const j = (window as unknown as { jigsaw: { state: { cols: number; rows: number } } }).jigsaw;
    return { cols: j.state.cols, rows: j.state.rows };
  });
  for (const id of ids) {
    const col = id % state.cols;
    const row = Math.floor(id / state.cols);
    expect(col === 0 || row === 0 || col === state.cols - 1 || row === state.rows - 1).toBe(true);
  }
  await page.getByRole('button', { name: 'Big picture' }).click();
  await expect(page.getByRole('dialog', { name: 'The whole picture' })).toContainText(/Test Photographer|Art Institute of Chicago/);
  await page.getByRole('dialog', { name: 'The whole picture' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('suggestions whose pictures are blocked are replaced', async ({ page }) => {
  await page.route('https://www.artic.edu/**', (route) => route.fulfill({ status: 403, body: 'blocked' }));
  await page.goto('./');
  const cards = page.locator('.suggestion:not(.placeholder)');
  await expect(cards).toHaveCount(3);
  await expect(cards.filter({ hasText: 'Art Institute' })).toHaveCount(0);
  await expect(page.locator('.suggestion.broken')).toHaveCount(0);
});

test('full screen can be switched on and off from the menu and the game', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Leave full screen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);

  await chooseAndStart(page, '25 pieces');
  const tool = page.locator('.toolbar').getByRole('button', { name: 'Full screen' });
  await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'false');
});

test('on an iPad, the install button explains Add to Home Screen', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Install as an app' }).click();
  const help = page.getByRole('dialog', { name: 'Install as an app' });
  await expect(help).toContainText('Add to Home Screen');
  await help.getByRole('button', { name: 'OK' }).click();
  await expect(help).toHaveCount(0);
});

test('where the browser offers to install, the install button asks it', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & { prompt(): Promise<void>; userChoice: Promise<unknown> };
    e.prompt = async () => {
      (window as unknown as { prompted: boolean }).prompted = true;
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.getByRole('button', { name: 'Install as an app' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
