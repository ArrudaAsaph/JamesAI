import { test, expect, type Page } from '@playwright/test';

async function mockApi(page: Page, loggedIn = true) {
  const now = new Date();
  const events = [
    { id: '1', summary: 'Alinhamento de equipe', location: 'Google Meet', hangoutLink: 'https://meet.google.com/example', start: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 30).toISOString() }, end: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 30).toISOString() } },
    { id: '2', summary: 'Café com a Marina', location: 'Café da esquina', start: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10).toISOString() }, end: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11).toISOString() } },
    { id: '3', summary: 'Planejamento da próxima semana', start: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 14).toISOString() }, end: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 15).toISOString() } },
  ];
  await page.route('**/api/**', async function respond(route) {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/logout') { loggedIn = false; await route.fulfill({ status: 204 }); return; }
    if (!loggedIn) { await route.fulfill({ status: 401, json: { error: 'Faça login' } }); return; }
    if (url.pathname === '/api/auth/me') await route.fulfill({ json: { user: { id: 'test', name: 'Asaph Arruda', email: 'asaph@example.com', picture: null } } });
    else if (url.pathname === '/api/commands') await route.fulfill({ json: { action: 'created', message: 'Evento “Reunião” adicionado à sua agenda.', text: 'Agende uma reunião', context: { id: 'calendar' }, interpretation: { intent: 'create', event: 'Reunião', date: '2026-10-02', time: '14:00' } } });
    else await route.fulfill({ json: { items: events } });
  });
}

test('desktop: calendário, navegação, detalhes e logout', async function desktop({ page }) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Meu calendário' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Alinhamento de equipe/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true, animations: 'disabled' });
  const current = new Date().getMonth();
  await page.getByRole('button', { name: 'Próximo mês', exact: true }).click();
  await expect(page.getByLabel('Mês', { exact: true })).toHaveValue(String((current + 1) % 12));
  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await page.getByRole('button', { name: /Alinhamento de equipe/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar na reunião' })).toHaveAttribute('href', 'https://meet.google.com/example');
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Charles' }).click();
  await expect(page.getByLabel('Chat com Charles')).toBeVisible();
  await page.getByPlaceholder('Escreva um comando').fill('Agende uma reunião');
  await page.getByRole('button', { name: 'Enviar comando' }).click();
  await expect(page.getByText('Evento “Reunião” adicionado à sua agenda.')).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Minha conta' }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('link', { name: 'Continuar com Google' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continuar com Google' })).toHaveAttribute('href', '/api/auth/google?client=web');
});

test('mobile: layout sem overflow, agenda e conta', async function mobile({ page }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Meu calendário' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Alinhamento de equipe/ })).toBeVisible();
  expect(await page.evaluate(function width() { return document.documentElement.scrollWidth; })).toBe(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('navigation', { name: 'Navegação mobile' }).getByRole('button', { name: 'Próximos eventos' }).click();
  await expect(page.getByRole('heading', { name: 'Próximos eventos' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegação mobile' }).getByRole('button', { name: 'Minha conta' }).click();
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toBeVisible();
});

test('login e falha do calendário têm ações disponíveis', async function errors({ page }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, false);
  await page.goto('/?error=auth_failed');
  await expect(page.getByRole('alert').filter({ hasText: 'O login não foi concluído' })).toBeVisible();
  await page.screenshot({ path: 'test-results/login.png', fullPage: true, animations: 'disabled' });
  await page.unroute('**/api/**');
  await mockApi(page);
  await page.route('**/api/calendar/events?**', async function denied(route) {
    await route.fulfill({ status: 403, json: { error: 'Autorize seu calendário novamente.', code: 'GOOGLE_RECONNECT_REQUIRED' } });
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Reconectar Google' })).toBeVisible();
});
