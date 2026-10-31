const test = require('node:test');
const assert = require('node:assert/strict');
const { CloudflareD1Client } = require('./cloudflareD1Service');

function makeFetch(payload, status = 200, inspect) {
  return async (url, options) => {
    inspect?.(url, options);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}

test('Cloudflare D1 sends authenticated parameterized SQL to the account/database endpoint', async () => {
  let request;
  const client = new CloudflareD1Client({
    accountId: '918ff2f016938fc978ed23b96505b21e',
    databaseId: '11111111-2222-4333-8444-555555555555',
    apiToken: 'unit-test-token',
    fetchImpl: makeFetch({
      success: true,
      result: [{ success: true, results: [{ connected: 1 }] }]
    }, 200, (url, options) => { request = { url, options }; })
  });

  const result = await client.query('SELECT ? AS connected', [1]);
  assert.equal(result.results[0].connected, 1);
  assert.equal(
    request.url,
    'https://api.cloudflare.com/client/v4/accounts/918ff2f016938fc978ed23b96505b21e/d1/database/11111111-2222-4333-8444-555555555555/query'
  );
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer unit-test-token');
  assert.deepEqual(JSON.parse(request.options.body), {
    sql: 'SELECT ? AS connected',
    params: ['1']
  });
});

test('Cloudflare D1 sends multiple statements through the batch API', async () => {
  let body;
  const client = new CloudflareD1Client({
    accountId: '918ff2f016938fc978ed23b96505b21e',
    databaseId: '11111111-2222-4333-8444-555555555555',
    apiToken: 'unit-test-token',
    fetchImpl: makeFetch({
      success: true,
      result: [
        { success: true, results: [] },
        { success: true, results: [] }
      ]
    }, 200, (_url, options) => { body = JSON.parse(options.body); })
  });

  const result = await client.batch([
    { sql: 'INSERT INTO test_table (id) VALUES (?)', params: ['a'] },
    { sql: 'INSERT INTO test_table (id) VALUES (?)', params: ['b'] }
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(body.batch.map(item => item.params), [['a'], ['b']]);
});

test('Cloudflare D1 rejects incomplete credentials before network access', async () => {
  const client = new CloudflareD1Client({
    accountId: '918ff2f016938fc978ed23b96505b21e',
    databaseId: '',
    apiToken: ''
  });
  await assert.rejects(client.query('SELECT 1'), /CLOUDFLARE_D1_DATABASE_ID/);
});

test('Cloudflare D1 reports API errors without exposing the API token', async () => {
  const client = new CloudflareD1Client({
    accountId: '918ff2f016938fc978ed23b96505b21e',
    databaseId: '11111111-2222-4333-8444-555555555555',
    apiToken: 'do-not-print-this-token',
    fetchImpl: makeFetch({
      success: false,
      errors: [{ message: 'Database not found' }]
    }, 404)
  });

  await assert.rejects(client.query('SELECT 1'), error => {
    assert.match(error.message, /Database not found/);
    assert.doesNotMatch(error.message, /do-not-print-this-token/);
    return true;
  });
});
