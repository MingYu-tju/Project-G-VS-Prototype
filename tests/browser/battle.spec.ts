import { test, expect, devices } from '@playwright/test';

test('phone viewport retains touch controls and can fire', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /单机训练/ }).tap();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('SHT', { exact: true })).toBeVisible();
    await page.getByText('SHT', { exact: true }).tap();
    await expect(page.getByText('BEAM RIFLE 19 / 20', { exact: true })).toBeVisible();
    await page.screenshot({ path: '.artifacts/mobile-training.png' });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('training renders and both editors retain their entry points', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /单机训练/ }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('TRAINING', { exact: true })).toBeVisible();
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  await page.keyboard.press('j');
  await page.screenshot({ path: '.artifacts/training.png' });
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('button', { name: '姿势 / 动画编辑器' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: '.artifacts/pose-editor.png' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'EXP ANIM', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('CUSTOM_ANIM');
  await page.goto('/');
  await page.getByRole('button', { name: '模型工厂' }).click();
  await page.getByRole('button', { name: 'START BUILDING', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: '.artifacts/model-editor.png' });
  await page.getByRole('button', { name: 'EXP JSON', exact: true }).click();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).id).toBe('root');
  expect(errors).toEqual([]);
});

test('two browser players join, shoot, win, rematch and resolve a disconnect', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const p1 = await a.newPage(), p2 = await b.newPage();
  const errors: string[] = [];
  for (const page of [p1, p2]) page.on('pageerror', e => errors.push(e.message));
  try {
    await p1.goto('/'); await p2.goto('/');
    await p1.getByRole('button', { name: /在线对战/ }).click();
    await p2.getByRole('button', { name: /在线对战/ }).click();
    await p1.getByLabel('驾驶员昵称').fill('Alpha');
    await p2.getByLabel('驾驶员昵称').fill('Bravo');
    await p1.getByRole('button', { name: '创建 1v1 房间' }).click();
    const code = await p1.getByTestId('room-code').innerText();
    await p2.getByLabel('房间码').fill(code);
    await p2.getByRole('button', { name: '加入', exact: true }).click();
    await expect(p2.getByTestId('room-code')).toHaveText(code);
    await p1.getByRole('button', { name: '准备战斗' }).click();
    await p2.getByRole('button', { name: '准备战斗' }).click();
    await expect(p1.locator('canvas')).toBeVisible();
    await expect(p2.locator('canvas')).toBeVisible();
    await expect(p1.getByText('GET READY', { exact: true })).not.toBeVisible({ timeout: 15000 });
    await p1.keyboard.press('j');
    await expect(p2.getByTestId('self-hp')).toHaveText('540 HP');
    // Wait for the receiving player's hitstun before returning fire.
    await p2.waitForTimeout(650);
    await p2.keyboard.press('j');
    await expect(p1.getByTestId('self-hp')).toHaveText('540 HP');
    await p1.keyboard.down('d'); await p1.waitForTimeout(400); await p1.keyboard.up('d');
    // Play to an actual KO, then exercise the UI rematch path before testing disconnect.
    for (let i = 0; i < 11; i++) {
      if (await p1.getByText('VICTORY', { exact: true }).isVisible()) break;
      await p1.keyboard.press('j'); await p1.waitForTimeout(1450);
    }
    await expect(p1.getByText('VICTORY', { exact: true })).toBeVisible();
    await expect(p2.getByText('DEFEAT', { exact: true })).toBeVisible();
    await p1.getByRole('button', { name: '准备再战', exact: true }).click();
    await p2.getByRole('button', { name: '准备再战', exact: true }).click();
    await expect(p1.getByText('GET READY', { exact: true })).toBeVisible();
    await expect(p1.getByText('GET READY', { exact: true })).not.toBeVisible();
    await expect(p1.getByTestId('self-hp')).toHaveText('600 HP');
    await expect(p2.getByTestId('self-hp')).toHaveText('600 HP');
    await p1.screenshot({ path: '.artifacts/online-blue.png' });
    await p2.screenshot({ path: '.artifacts/online-red.png' });
    await b.close();
    await expect(p1.getByText('VICTORY', { exact: true })).toBeVisible();
    await expect(p1.getByText('对手已离线', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});
