// Run with Playwright against a loaded IonicFormula page.
export default async function verifyPromptFit(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('label.mode-card').filter({ has: page.locator('[value="compound"]') }).click();
  await page.locator('.complex-only-option').click();
  await page.locator('#start-button').click();
  await page.locator('#quiz-screen').waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const prompt = document.querySelector('#question-prompt');
    prompt.classList.remove('formula');
    prompt.innerHTML = '<span class="ion-pair names"><span class="ion-pair-first"><span class="ion-name">テトラヒドロキシド亜鉛(II)酸イオン</span><span class="ion-separator">＆</span></span><span class="ion-pair-second"><span class="formula-token">K<sup>＋</sup></span></span></span>';
    const pair = prompt.firstElementChild;
    window.promptFitSamples = { changes: 0, hidden: 0, heights: [] };
    window.promptFitObserver = new MutationObserver(() => {
      window.promptFitSamples.changes++;
      if (getComputedStyle(pair).visibility === 'hidden') window.promptFitSamples.hidden++;
      window.promptFitSamples.heights.push(document.querySelector('#question-card').getBoundingClientRect().height);
    });
    window.promptFitObserver.observe(pair, { attributes: true });
  });
  await page.setViewportSize({ width: 389, height: 844 });
  await page.waitForTimeout(1200);
  const narrow = await page.evaluate(() => {
    window.promptFitObserver.disconnect();
    return { ...window.promptFitSamples, twoLines: document.querySelector('.ion-pair.names').classList.contains('is-two-lines') };
  });
  if (narrow.changes > 2 || narrow.hidden || !narrow.twoLines) throw new Error(`Unstable narrow prompt: ${JSON.stringify(narrow)}`);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(150);
  const wide = await page.locator('#question-prompt .ion-pair.names').evaluate(pair => pair.classList.contains('is-two-lines'));
  if (wide) throw new Error('Long prompt did not return to horizontal layout at desktop width');
  return { narrow, wideTwoLines: wide };
}
