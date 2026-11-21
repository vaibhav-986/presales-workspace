import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../server/index.js';
import { createDatabase, seedAdmin } from '../server/db.js';

const ADMIN = {
  email: 'admin@example.test',
  password: 'CorrectHorse2026!',
  name: 'Test Admin',
};

const databases = [];
afterEach(() => {
  while (databases.length) databases.pop().close();
});

function appForTest() {
  const app = createApp({ databasePath: ':memory:', admin: ADMIN, loginLimit: 1_000 });
  databases.push(app.locals.db);
  return app;
}

async function signIn(agent, email = ADMIN.email, password = ADMIN.password) {
  const response = await agent
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  assert.ok(response.body.data.csrfToken);
  return response.body.data.csrfToken;
}

function opportunity(overrides = {}) {
  return {
    visitDate: '2026-11-24',
    startTime: '10:00',
    endTime: '11:30',
    propertyName: 'Grand Palms Hotel',
    propertyLocation: 'Bengaluru, India',
    presalerName: 'Test Admin',
    stage: 'Discovery',
    softwareType: 'Cloud PMS',
    propertyCategory: 'Hotel',
    wonAmount: 250000,
    currentPms: 'Legacy PMS',
    attendees: 'Owner, General Manager',
    requirementDescription: 'A secure cloud migration.',
    issuesFaced: 'Manual reporting.',
    ...overrides,
  };
}

async function createUser(agent, csrfToken, overrides = {}) {
  const body = {
    name: 'Workspace Member',
    email: 'member@example.test',
    title: 'Solutions Consultant',
    role: 'member',
    password: 'MemberPassword2026!',
    ...overrides,
  };
  const response = await agent
    .post('/api/users')
    .set('X-CSRF-Token', csrfToken)
    .send(body)
    .expect(201);
  return { ...body, id: response.body.data.id };
}

test('authentication establishes and clears a protected session', async () => {
  const app = appForTest();
  const agent = request.agent(app);

  await agent.get('/api/auth/session').expect(401);
  await agent.post('/api/auth/login').send({ email: ADMIN.email, password: 'incorrect' }).expect(401);

  const csrfToken = await signIn(agent);
  const session = await agent.get('/api/auth/session').expect(200);
  assert.equal(session.body.data.user.email, ADMIN.email);
  assert.equal(session.body.data.csrfToken, csrfToken);

  await agent.post('/api/auth/logout').expect(403);
  await agent.post('/api/auth/logout').set('X-CSRF-Token', csrfToken).expect(204);
  await agent.get('/api/auth/session').expect(401);
});

test('unsafe requests reject untrusted origins, missing CSRF tokens, and malformed JSON', async () => {
  const app = appForTest();
  const agent = request.agent(app);

  await agent
    .post('/api/auth/login')
    .set('Origin', 'https://malicious.example')
    .send({ email: ADMIN.email, password: ADMIN.password })
    .expect(403);

  await agent
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":')
    .expect(400)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_JSON'));

  await signIn(agent);
  await agent.post('/api/opportunities').send(opportunity()).expect(403);
});

test('opportunities support validation, literal search, updates, dashboard totals, and deletion', async () => {
  const app = appForTest();
  const agent = request.agent(app);
  const csrfToken = await signIn(agent);

  const invalidTime = await agent
    .post('/api/opportunities')
    .set('X-CSRF-Token', csrfToken)
    .send(opportunity({ endTime: '09:30' }))
    .expect(422);
  assert.ok(invalidTime.body.error.fields.endTime);

  const invalidType = await agent
    .post('/api/opportunities')
    .set('X-CSRF-Token', csrfToken)
    .send(opportunity({ softwareType: 'Unsupported system' }))
    .expect(422);
  assert.ok(invalidType.body.error.fields.softwareType);

  const percentRecord = await agent
    .post('/api/opportunities')
    .set('X-CSRF-Token', csrfToken)
    .send(opportunity({ propertyName: '100% Hospitality', stage: 'Won' }))
    .expect(201);
  await agent
    .post('/api/opportunities')
    .set('X-CSRF-Token', csrfToken)
    .send(opportunity({ propertyName: '1000 Hospitality', stage: 'Proposal' }))
    .expect(201);

  const literalSearch = await agent.get('/api/opportunities?search=%25').expect(200);
  assert.deepEqual(literalSearch.body.data.map((item) => item.propertyName), ['100% Hospitality']);

  const updated = await agent
    .patch(`/api/opportunities/${percentRecord.body.data.id}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ stage: 'Negotiation', wonAmount: 300000 })
    .expect(200);
  assert.equal(updated.body.data.stage, 'Negotiation');
  assert.equal(updated.body.data.wonAmount, 300000);

  const dashboard = await agent.get('/api/dashboard').expect(200);
  assert.equal(dashboard.body.data.totalCount, 2);
  assert.equal(dashboard.body.data.activeOpportunities.count, 2);

  await agent
    .delete(`/api/opportunities/${percentRecord.body.data.id}`)
    .set('X-CSRF-Token', csrfToken)
    .expect(204);
  await agent
    .delete(`/api/opportunities/${percentRecord.body.data.id}`)
    .set('X-CSRF-Token', csrfToken)
    .expect(404);
});

test('role permissions separate viewing, editing, importing, deleting, and user administration', async () => {
  const app = appForTest();
  const adminAgent = request.agent(app);
  const adminCsrf = await signIn(adminAgent);
  await createUser(adminAgent, adminCsrf, {
    name: 'Read Only User',
    email: 'viewer@example.test',
    role: 'viewer',
    password: 'ViewerPassword2026!',
  });
  await createUser(adminAgent, adminCsrf, {
    name: 'Pipeline Manager',
    email: 'manager@example.test',
    role: 'manager',
    password: 'ManagerPassword2026!',
  });

  const created = await adminAgent
    .post('/api/opportunities')
    .set('X-CSRF-Token', adminCsrf)
    .send(opportunity())
    .expect(201);

  const viewerAgent = request.agent(app);
  const viewerCsrf = await signIn(viewerAgent, 'viewer@example.test', 'ViewerPassword2026!');
  await viewerAgent.get('/api/opportunities').expect(200);
  await viewerAgent.get('/api/users').expect(403);
  await viewerAgent
    .post('/api/opportunities')
    .set('X-CSRF-Token', viewerCsrf)
    .send(opportunity({ propertyName: 'Viewer Write Attempt' }))
    .expect(403);
  await viewerAgent
    .post('/api/opportunities/import')
    .set('X-CSRF-Token', viewerCsrf)
    .attach('file', Buffer.from('visitDate\n2026-11-24'), { filename: 'items.csv', contentType: 'text/csv' })
    .expect(403);

  const managerAgent = request.agent(app);
  const managerCsrf = await signIn(managerAgent, 'manager@example.test', 'ManagerPassword2026!');
  await managerAgent
    .delete(`/api/opportunities/${created.body.data.id}`)
    .set('X-CSRF-Token', managerCsrf)
    .expect(204);
});

test('CSV import is atomic and export neutralizes spreadsheet formulas', async () => {
  const app = appForTest();
  const agent = request.agent(app);
  const csrfToken = await signIn(agent);
  const headers = 'visitDate,startTime,endTime,propertyName,propertyLocation,presalerName,stage,softwareType,propertyCategory,wonAmount,currentPms,attendees,requirementDescription,issuesFaced';
  const validCsv = `${headers}\n2026-11-24,10:00,11:00,Imported Hotel,Delhi India,Test Admin,Discovery,Cloud PMS,Hotel,50000,,,,\n2026-11-25,12:00,13:00,Imported Resort,Goa India,Test Admin,Proposal,CRM,Resort,90000,,,,`;

  const imported = await agent
    .post('/api/opportunities/import')
    .set('X-CSRF-Token', csrfToken)
    .attach('file', Buffer.from(validCsv), { filename: 'valid.csv', contentType: 'text/csv' })
    .expect(201);
  assert.equal(imported.body.data.imported, 2);

  const invalidCsv = `${headers}\n2026-11-26,10:00,09:00,Broken Hotel,Mumbai India,Test Admin,Discovery,Unknown,Hotel,10000,,,,`;
  const invalid = await agent
    .post('/api/opportunities/import')
    .set('X-CSRF-Token', csrfToken)
    .attach('file', Buffer.from(invalidCsv), { filename: 'invalid.csv', contentType: 'text/csv' })
    .expect(422);
  assert.equal(invalid.body.error.code, 'IMPORT_VALIDATION_FAILED');
  assert.equal(invalid.body.error.rows[0].row, 2);

  await agent
    .post('/api/opportunities')
    .set('X-CSRF-Token', csrfToken)
    .send(opportunity({ propertyName: '=2+2 Resort' }))
    .expect(201);

  const exported = await agent.get('/api/opportunities/export.csv').expect(200);
  assert.match(exported.headers['content-type'], /text\/csv/);
  assert.match(exported.text, /"'=2\+2 Resort"/);
  assert.equal((await agent.get('/api/opportunities').expect(200)).body.data.length, 3);
});

test('user administration prevents duplicates, disabled logins, and removal of the last active admin', async () => {
  const app = appForTest();
  const agent = request.agent(app);
  const csrfToken = await signIn(agent);
  const member = await createUser(agent, csrfToken);

  await agent
    .post('/api/users')
    .set('X-CSRF-Token', csrfToken)
    .send({
      name: 'Duplicate Member',
      email: member.email,
      title: '',
      role: 'member',
      password: 'AnotherPassword2026!',
    })
    .expect(409);

  await agent
    .patch(`/api/users/${member.id}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ status: 'disabled' })
    .expect(200);
  await request(app)
    .post('/api/auth/login')
    .send({ email: member.email, password: member.password })
    .expect(401);

  const users = await agent.get('/api/users').expect(200);
  const admin = users.body.data.find((user) => user.email === ADMIN.email);
  const lastAdmin = await agent
    .patch(`/api/users/${admin.id}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ role: 'manager' })
    .expect(422);
  assert.equal(lastAdmin.body.error.code, 'LAST_ADMIN');
});

test('production startup requires an explicit initial administrator password', () => {
  const database = createDatabase(':memory:');
  databases.push(database);
  const previousNodeEnv = process.env.NODE_ENV;
  const previousPassword = process.env.ADMIN_PASSWORD;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_PASSWORD;
    assert.throws(
      () => seedAdmin(database, { email: 'production-admin@example.test' }),
      /ADMIN_PASSWORD must be set/,
    );
    assert.throws(
      () => seedAdmin(database, { email: 'production-admin@example.test', password: 'Presales@2026' }),
      /non-default value/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
});
