const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runWithTelegramRetry,
  formatTelegramError
} = require('./telegramStartup');

test('thử lại lỗi mạng tạm thời và thành công ở lần kế tiếp', async () => {
  let calls = 0;
  const delays = [];
  const value = await runWithTelegramRetry(async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('socket hang up');
      error.code = 'ECONNRESET';
      throw error;
    }
    return { username: 'hendy_test_bot' };
  }, {
    attempts: 3,
    initialDelayMs: 25,
    wait: async ms => delays.push(ms)
  });

  assert.equal(value.username, 'hendy_test_bot');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [25]);
});

test('không thử lại khi Telegram trả HTTP 401', async () => {
  let calls = 0;
  const error = new Error('Unauthorized');
  error.response = { error_code: 401, description: 'Unauthorized' };

  await assert.rejects(
    runWithTelegramRetry(async () => {
      calls += 1;
      throw error;
    }, {
      attempts: 5,
      wait: async () => assert.fail('Không được chờ khi token không hợp lệ.')
    }),
    received => received === error
  );

  assert.equal(calls, 1);
  assert.match(formatTelegramError(error), /HTTP 401: Unauthorized/);
});

test('tôn trọng retry_after do Telegram trả về', async () => {
  const delays = [];
  let calls = 0;

  await runWithTelegramRetry(async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('Too Many Requests');
      error.response = {
        error_code: 429,
        description: 'Too Many Requests',
        parameters: { retry_after: 3 }
      };
      throw error;
    }
    return true;
  }, {
    attempts: 2,
    initialDelayMs: 100,
    wait: async ms => delays.push(ms)
  });

  assert.deepEqual(delays, [3000]);
});

test('dừng sau khi hết số lần thử và che token khỏi log', async () => {
  let calls = 0;
  const error = new Error(
    'request to https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890/getMe failed'
  );
  error.cause = { code: 'ETIMEDOUT' };

  await assert.rejects(
    runWithTelegramRetry(async () => {
      calls += 1;
      throw error;
    }, {
      attempts: 3,
      initialDelayMs: 1,
      wait: async () => {}
    }),
    received => received === error
  );

  assert.equal(calls, 3);
  const message = formatTelegramError(error);
  assert.match(message, /ETIMEDOUT/);
  assert.doesNotMatch(message, /ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890/);
});
