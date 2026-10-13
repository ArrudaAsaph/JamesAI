import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { before, after } from 'node:test';
import { Pool } from 'pg';
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { UserRepository } from '../dist/repositories/user.repository.js';
import oauth from 'oauth';
import google from 'passport-google-oauth2';
import { App } from '../dist/app.js';

const admin = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const databaseName = 'charles_test_' + randomBytes(8).toString('hex');
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.pathname = '/' + databaseName;
let databaseCreated = false;
before(async function createTestDatabase() {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
});
after(async function removeTestDatabase() {
  try {
    if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

const config = {
  databaseUrl: testUrl.toString(),
  tokenEncryptionKey: randomBytes(32).toString('hex'),
  auditLogKey: randomBytes(32).toString('hex'),
  googleClientId: 'test-client',
  googleClientSecret: 'test-secret',
  googleCallbackUrl: 'http://localhost:3000/auth/google',
  sessionSecret: 'test-session-secret-with-at-least-32-characters',
  openRouterApiKey: 'test-openrouter-key',
  openRouterModel: 'test-model',
};

async function withServer(run) {
  const application = new App(config);
  await application.initialize();
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}/auth/google`, application);
  } finally {
    await new Promise(function closeServer(resolve) { server.close(resolve); });
    await application.close();
  }
}

async function begin(url) {
  const response = await fetch(url, { redirect: 'manual' });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('client_id'), config.googleClientId);
  assert.equal(location.searchParams.get('redirect_uri'), config.googleCallbackUrl);
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('access_type'), 'offline');
  assert.equal(location.searchParams.get('prompt'), 'consent');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(location.searchParams.get('code_challenge'));
  const state = location.searchParams.get('state');
  assert.ok(state);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  return { state, cookie: cookie.split(';')[0] };
}

test('inicia OAuth e rejeita callback sem sessão ou com state incorreto', async function testAuthentication() {
  await withServer(async function checkResponse(url) {
    const { cookie } = await begin(url);
    for (const headers of [{}, { cookie }]) {
      const response = await fetch(`${url}?code=invalid&state=wrong`, { headers });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    for (const query of ['error=access_denied', 'code=one&code=two', 'state=orphan', 'code=']) {
      const response = await fetch(`${url}?${query}`, { redirect: 'manual' });
      assert.equal(response.status, query.startsWith('error') ? 401 : 400);
    }
  });
});

test('cria sessão com perfil verificado, rejeita replay e e-mail não verificado', async function testAuthentication() {
  const originalToken = oauth.OAuth2.prototype.getOAuthAccessToken;
  const originalProfile = google.Strategy.prototype.userProfile;
  let verified = true;
  let tokenCalls = 0;
  let authenticatedCookie;
  let savedUser;
  oauth.OAuth2.prototype.getOAuthAccessToken = function (code, params, done) {
    tokenCalls++;
    assert.equal(code, 'valid-code');
    assert.ok(params.code_verifier);
    done(null, 'private-access-token', 'private-refresh-token', { expires_in: 3600 });
  };
  google.Strategy.prototype.userProfile = function (_token, done) {
    done(null, { id: '123', displayName: 'Teste', email: 'teste@example.com', email_verified: verified });
  };
  try {
    await withServer(async function checkResponse(url) {
      const { state, cookie } = await begin(url);
      const callbackUrl = `${url}?code=valid-code&state=${encodeURIComponent(state)}`;
      const response = await fetch(callbackUrl, { headers: { cookie } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.authenticated, true);
      savedUser = body.user;
      assert.equal(savedUser.googleId, '123');
      assert.equal(savedUser.name, 'Teste');
      assert.equal(savedUser.email, 'teste@example.com');
      assert.match(savedUser.id, /^[0-9a-f-]{36}$/);
      assert.ok(savedUser.createdAt);
      authenticatedCookie = response.headers.get('set-cookie').split(';')[0];
      const me = await fetch(url.replace('/google', '/me'), { headers: { cookie: authenticatedCookie } });
      assert.equal(me.status, 200);
      assert.deepEqual((await me.json()).user, savedUser);
      assert.notEqual(response.headers.get('set-cookie').split(';')[0], cookie);
      assert.equal((await fetch(callbackUrl, { headers: { cookie } })).status, 401);
      assert.equal(tokenCalls, 1);
      verified = false;
      const second = await begin(url);
      const rejected = await fetch(`${url}?code=valid-code&state=${second.state}`, {
        headers: { cookie: second.cookie },
      });
      assert.equal(rejected.status, 401);
    });
    await withServer(async function checkPersistedSession(url, application) {
      const meUrl = url.replace('/google', '/me');
      const response = await fetch(meUrl, { headers: { cookie: authenticatedCookie } });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).user, savedUser);
      const users = new UserRepository(application.database);
      const changed = await users.saveGoogleProfile({ id: '123', displayName: 'Nome atualizado',
        email: 'novo@example.com', email_verified: true });
      assert.equal(changed.id, savedUser.id);
      assert.equal(changed.createdAt, savedUser.createdAt);
      const refreshed = await fetch(meUrl, { headers: { cookie: authenticatedCookie } });
      assert.equal((await refreshed.json()).user.name, 'Nome atualizado');
      const sessions = await application.database.pool.query('SELECT sess FROM sessions');
      const loggedIn = sessions.rows.find(function isLoggedIn(row) { return row.sess.passport; });
      assert.equal(loggedIn.sess.passport.user, savedUser.id);
      await application.database.pool.query("UPDATE sessions SET expire = NOW() - INTERVAL '1 day'");
      assert.equal((await fetch(meUrl, { headers: { cookie: authenticatedCookie } })).status, 401);
      verified = true;
      const login = await begin(url);
      const loggedInAgain = await fetch(`${url}?code=valid-code&state=${login.state}`, {
        headers: { cookie: login.cookie },
      });
      assert.equal(loggedInAgain.status, 200);
      assert.equal((await loggedInAgain.json()).user.id, savedUser.id);
      authenticatedCookie = loggedInAgain.headers.get('set-cookie').split(';')[0];
      await application.database.pool.query('DELETE FROM users WHERE id = $1', [savedUser.id]);
      assert.equal((await fetch(meUrl, { headers: { cookie: authenticatedCookie } })).status, 401);
    });
  } finally {
    oauth.OAuth2.prototype.getOAuthAccessToken = originalToken;
    google.Strategy.prototype.userProfile = originalProfile;
  }
});

test('middleware rejeita ausência de sessão e cookie adulterado', async function testMiddleware() {
  await withServer(async function checkMiddleware(url, application) {
    const meUrl = url.replace('/google', '/me');
    assert.equal((await fetch(meUrl)).status, 401);
    assert.equal((await fetch(meUrl, { headers: { cookie: 'charles.sid=forged' } })).status, 401);
    const { cookie } = await begin(url);
    await application.database.pool.query("UPDATE sessions SET expire = NOW() - INTERVAL '1 day'");
    assert.equal((await fetch(meUrl, { headers: { cookie } })).status, 401);
  });
});

test('auditoria registra a requisição sem vazar cookies, tokens ou parâmetros', async function testAuditLog() {
  await withServer(async function checkAudit(url, application) {
    const response = await fetch(`${url}?login_hint=private@example.com&code=secret-code`, {
      redirect: 'manual',
    });
    assert.equal(response.status, 401);
    const requestId = response.headers.get('x-request-id');
    assert.match(requestId, /^[0-9a-f-]{36}$/);
    await application.auditLog.close();
    const rows = await application.database.pool.query(`
      SELECT request_id, event_type, method, path, query_keys, status_code,
        duration_ms, ip_hash, user_agent, error_code, previous_hash, entry_hash
      FROM audit_logs WHERE request_id = $1
    `, [requestId]);
    assert.equal(rows.rows.length, 1);
    const log = rows.rows[0];
    assert.equal(log.event_type, 'auth.login.completed');
    assert.equal(log.method, 'GET');
    assert.equal(log.path, '/auth/google');
    assert.deepEqual(log.query_keys, ['code', 'login_hint']);
    assert.equal(log.status_code, 401);
    assert.ok(log.duration_ms >= 0);
    assert.match(log.ip_hash, /^[a-f0-9]{64}$/);
    assert.equal(log.error_code, 'AUTHENTICATION_DENIED');
    assert.match(log.entry_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(log).includes('secret-code'), false);
    assert.equal(JSON.stringify(log).includes('private@example.com'), false);
    const integrity = await application.auditLog.verifyIntegrity();
    assert.equal(integrity.valid, true);
    assert.ok(integrity.checked >= 1);
    await assert.rejects(
      application.database.pool.query(
        'UPDATE audit_logs SET event_type = $1 WHERE request_id = $2',
        ['altered', requestId],
      ),
      /append-only/,
    );
  });
});

test('logins simultâneos do mesmo Google ID mantêm um único usuário', async function testConcurrentLogin() {
  await withServer(async function checkRepository(_url, application) {
    const users = new UserRepository(application.database);
    const profile = { id: 'concurrent', email: 'teste@example.com', email_verified: true };
    const results = await Promise.all([users.saveGoogleProfile(profile), users.saveGoogleProfile(profile)]);
    assert.equal(results[0].id, results[1].id);
    const count = await application.database.pool.query('SELECT COUNT(*) FROM users WHERE google_id = $1', ['concurrent']);
    assert.equal(count.rows[0].count, '1');
    // Um e-mail igual não vincula automaticamente identidades diferentes.
    const other = await users.saveGoogleProfile({ ...profile, id: 'another-google-id' });
    assert.notEqual(other.id, results[0].id);
  });
});

test('comando de voz transcrito cria o evento interpretado na agenda do usuário', async function testCommand() {
  const { default: axios } = await import('axios');
  const originalPost = axios.post;
  const originalToken = oauth.OAuth2.prototype.getOAuthAccessToken;
  const originalProfile = google.Strategy.prototype.userProfile;
  oauth.OAuth2.prototype.getOAuthAccessToken = function getToken(_code, _params, done) {
    done(null, 'calendar-access', 'calendar-refresh', { expires_in: 3600 });
  };
  google.Strategy.prototype.userProfile = function getProfile(_token, done) {
    done(null, { id: 'command-user', email: 'command@example.com', email_verified: true });
  };
  axios.post = async function post(url, body, options) {
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      assert.equal(options.headers.Authorization, 'Bearer test-openrouter-key');
      assert.match(body.messages[0].content, /reunião de projeto/);
      return { data: { choices: [{ message: { content: JSON.stringify({ intent: 'create', event: 'Reunião de projeto',
        date: '2026-10-02', time: '14:00', duration_minutes: 45, description: null, location: null }) } }] } };
    }
    assert.equal(url, 'https://www.googleapis.com/calendar/v3/calendars/primary/events');
    assert.equal(options.headers.Authorization, 'Bearer calendar-access');
    assert.equal(body.summary, 'Reunião de projeto');
    assert.equal(body.start.timeZone, 'America/Fortaleza');
    return { data: { id: 'created-event', summary: body.summary, start: body.start, end: body.end } };
  };
  try {
    await withServer(async function commandRequest(url) {
      const { state, cookie } = await begin(url);
      const login = await fetch(`${url}?code=command-code&state=${state}`, { headers: { cookie } });
      const session = login.headers.get('set-cookie').split(';')[0];
      const response = await fetch(url.replace('/auth/google', '/commands'), {
        method: 'POST', headers: { cookie: session, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Agende uma reunião de projeto na sexta às 14h' }),
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.action, 'created');
      assert.equal(result.event.id, 'created-event');
      assert.equal(result.interpretation.intent, 'create');
    });
  } finally {
    axios.post = originalPost;
    oauth.OAuth2.prototype.getOAuthAccessToken = originalToken;
    google.Strategy.prototype.userProfile = originalProfile;
  }
});

test('calendar: tokens criptografados, filtros, paginação, renovação e isolamento', async function testCalendar() {
  const { default: axios } = await import('axios');
  const originalGet = axios.get;
  const originalPost = axios.post;
  const originalToken = oauth.OAuth2.prototype.getOAuthAccessToken;
  const originalProfile = google.Strategy.prototype.userProfile;
  let googleId = 'calendar-user';
  let refreshToken = 'calendar-refresh';
  let getCalls = 0;
  let refreshCalls = 0;
  let failStatus = 0;
  let revoked = false;
  let rejectOnce = false;
  let persistedCookie;
  oauth.OAuth2.prototype.getOAuthAccessToken = function getToken(_code, _params, done) {
    done(null, 'calendar-access', refreshToken, { expires_in: 3600 });
  };
  google.Strategy.prototype.userProfile = function getProfile(_token, done) {
    done(null, { id: googleId, email: `${googleId}@example.com`, email_verified: true });
  };
  axios.get = async function getEvents(url, options) {
    getCalls++;
    assert.equal(url, 'https://www.googleapis.com/calendar/v3/calendars/primary/events');
    assert.ok(['Bearer calendar-access', 'Bearer renewed-access'].includes(options.headers.Authorization));
    assert.equal(options.params.singleEvents, true);
    assert.equal(options.params.orderBy, 'startTime');
    assert.equal(options.params.maxResults, 2);
    assert.equal(options.params.pageToken, 'page-two');
    if (rejectOnce) {
      rejectOnce = false;
      throw { isAxiosError: true, response: { status: 401 } };
    }
    if (failStatus) throw { isAxiosError: true, response: { status: failStatus } };
    return { data: { items: [{ id: 'event-1', summary: 'Reunião', start: { dateTime: '2026-10-01T10:00:00Z' } },
      { id: 'event-2', start: { date: '2026-10-02' } }], nextPageToken: 'page-three' } };
  };
  axios.post = async function refresh(url, body) {
    refreshCalls++;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(body.get('refresh_token'), 'calendar-refresh');
    assert.equal(body.get('grant_type'), 'refresh_token');
    if (revoked) throw { isAxiosError: true, response: { status: 400, data: { error: 'invalid_grant' } } };
    return { data: { access_token: 'renewed-access', expires_in: 3600 } };
  };
  async function login(url) {
    const { cookie, state } = await begin(url);
    const response = await fetch(`${url}?code=valid&state=${state}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], user: (await response.json()).user };
  }
  const filters = '?timeMin=2026-10-01T00:00:00Z&timeMax=2026-11-01T00:00:00Z&maxResults=2&pageToken=page-two';
  try {
    await withServer(async function checkCalendar(url, application) {
      const events = url.replace('/auth/google', '/calendar/events');
      assert.equal((await fetch(events)).status, 401);
      const loginResult = await login(url);
      persistedCookie = loginResult.cookie;
      const headers = { cookie: persistedCookie };
      assert.equal(JSON.stringify(loginResult.user).includes('calendar-access'), false);
      const stored = (await application.database.pool.query('SELECT * FROM google_tokens WHERE user_id = $1', [loginResult.user.id])).rows[0];
      assert.notEqual(stored.access_token, 'calendar-access');
      assert.notEqual(stored.refresh_token, 'calendar-refresh');
      const response = await fetch(events + filters, { headers });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const data = await response.json();
      assert.equal(data.items.length, 2);
      assert.equal(data.nextPageToken, 'page-three');
      assert.equal(refreshCalls, 0);
      const callsBefore = getCalls;
      for (const query of ['maxResults=0', 'maxResults=2501', 'timeMin=bad', 'maxResults=1&maxResults=2',
        'timeMin=2026-10-02T00:00:00Z&timeMax=2026-10-01T00:00:00Z', 'userId=someone-else']) {
        assert.equal((await fetch(events + '?' + query, { headers })).status, 400);
      }
      assert.equal(getCalls, callsBefore);
      // O Google pode omitir refresh_token em um novo login: preservar o anterior.
      refreshToken = undefined;
      const again = await login(url);
      assert.equal(again.user.id, loginResult.user.id);
      assert.equal((await application.database.pool.query('SELECT refresh_token FROM google_tokens WHERE user_id = $1', [again.user.id])).rows[0].refresh_token, stored.refresh_token);
      await application.database.pool.query("UPDATE google_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1", [again.user.id]);
      const renewed = await fetch(events + filters, { headers });
      assert.equal(renewed.status, 200);
      assert.equal(refreshCalls, 1);
      rejectOnce = true;
      assert.equal((await fetch(events + filters, { headers })).status, 200);
      assert.equal(refreshCalls, 2);
      for (const status of [403, 429, 500]) {
        failStatus = status;
        assert.equal((await fetch(events + filters, { headers })).status, status === 500 ? 502 : status);
      }
      failStatus = 0;
      googleId = 'calendar-other';
      const other = await login(url);
      await application.database.pool.query('DELETE FROM google_tokens WHERE user_id = $1', [other.user.id]);
      const missing = await fetch(events + filters, { headers: { cookie: other.cookie } });
      assert.equal(missing.status, 403);
      assert.equal((await missing.json()).code, 'GOOGLE_RECONNECT_REQUIRED');
    });
    await withServer(async function afterRestart(url, application) {
      const events = url.replace('/auth/google', '/calendar/events');
      const headers = { cookie: persistedCookie };
      assert.equal((await fetch(events + filters, { headers })).status, 200);
      await application.database.pool.query("UPDATE google_tokens SET expires_at = NOW() - INTERVAL '1 hour'");
      revoked = true;
      const response = await fetch(events + filters, { headers });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'GOOGLE_RECONNECT_REQUIRED');
    });
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
    oauth.OAuth2.prototype.getOAuthAccessToken = originalToken;
    google.Strategy.prototype.userProfile = originalProfile;
  }
});

test('login web retorna ao frontend; logout destrói a sessão e mantém usuário', async function webAuth() {
  const originalToken = oauth.OAuth2.prototype.getOAuthAccessToken;
  const originalProfile = google.Strategy.prototype.userProfile;
  oauth.OAuth2.prototype.getOAuthAccessToken = function getToken(_code, _params, done) {
    done(null, 'web-access', 'web-refresh', { expires_in: 3600 });
  };
  google.Strategy.prototype.userProfile = function getProfile(_token, done) {
    done(null, { id: 'web-user', email: 'web@example.com', email_verified: true });
  };
  try {
    await withServer(async function checkWeb(url, application) {
      const { cookie, state } = await begin(url + '?client=web');
      const login = await fetch(`${url}?code=valid&state=${state}`, { headers: { cookie }, redirect: 'manual' });
      assert.equal(login.status, 302);
      assert.equal(login.headers.get('location'), 'http://localhost:3002');
      const session = login.headers.get('set-cookie').split(';')[0];
      const meUrl = url.replace('/google', '/me');
      const logoutUrl = url.replace('/google', '/logout');
      assert.equal((await fetch(meUrl, { headers: { cookie: session } })).status, 200);
      assert.equal((await fetch(logoutUrl, { method: 'POST', headers: { cookie: session } })).status, 403);
      assert.equal((await fetch(logoutUrl, { method: 'POST', headers: { cookie: session, 'x-requested-with': 'XMLHttpRequest', origin: 'https://evil.example' } })).status, 403);
      const result = await fetch(logoutUrl, { method: 'POST', headers: { cookie: session, 'x-requested-with': 'XMLHttpRequest', origin: 'http://localhost:3002' } });
      assert.equal(result.status, 204);
      assert.match(result.headers.get('set-cookie'), /charles.sid=;/);
      assert.equal((await fetch(meUrl, { headers: { cookie: session } })).status, 401);
      const users = await application.database.pool.query('SELECT id FROM users WHERE google_id = $1', ['web-user']);
      assert.equal(users.rows.length, 1);
    });
  } finally {
    oauth.OAuth2.prototype.getOAuthAccessToken = originalToken;
    google.Strategy.prototype.userProfile = originalProfile;
  }
});
