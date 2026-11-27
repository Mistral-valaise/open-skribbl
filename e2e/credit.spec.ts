import { expect, test } from '@playwright/test';

/** The author's credit on the centred pages (spec 011, "Credit"). */
const CREDIT: Record<string, string> = {
  en: 'Created by Mistral N',
  de: 'Erstellt von Mistral N',
  es: 'Creado por Mistral N',
  fr: 'Créé par Mistral N',
};

test('AC-011-20: the centred pages credit the author in every language, without contacting the linked site', async ({
  page,
  baseURL,
}) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseURL!)) foreign.push(request.url());
  });

  for (const path of ['/', '/solo', '/r/ABCDEF']) {
    await page.goto(path);
    for (const [language, text] of Object.entries(CREDIT)) {
      await page.getByTestId(`language-${language}`).first().click();
      await expect(page.getByTestId('created-by'), `${path} in ${language}`).toHaveText(text);
    }
    const link = page.getByTestId('author-link');
    await expect(link).toHaveText('Mistral N');
    await expect(link).toHaveAttribute('href', 'https://mistraln.de/');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toBeVisible();
  }
  // The link is navigation the player may choose; nothing is loaded from the site.
  expect(foreign).toEqual([]);
});
