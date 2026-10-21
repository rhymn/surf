import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.TOKEN;
const { server } = await import('../src/server.js');

before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)));
after(() => {
  server.closeAllConnections();
  server.close();
});

test('the maintenance endpoint is disabled when TOKEN is not set', async () => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/sources/a/maintenance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer anything' },
    body: JSON.stringify({ value: true }),
  });
  assert.equal(res.status, 503);
});
