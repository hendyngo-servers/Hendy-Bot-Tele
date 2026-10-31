const test = require('node:test');
const assert = require('node:assert/strict');
const { mainMenu } = require('../utils/keyboards');

test('menu thành viên Telegram chỉ dùng callback, không mở Mini App', () => {
  const keyboard = mainMenu('member-regression-test');
  const buttons = keyboard.reply_markup.inline_keyboard.flat();

  assert.ok(buttons.length >= 14, 'Menu cần có đầy đủ các chức năng thành viên');
  assert.ok(
    buttons.every(button => typeof button.callback_data === 'string'),
    'Tất cả nút menu thành viên phải là callback Telegram'
  );
  assert.ok(
    buttons.every(button => !button.web_app && !button.url),
    'Menu thành viên không được chứa nút Mini App hoặc liên kết URL'
  );

  const actions = buttons.map(button => button.callback_data);
  for (const action of [
    'member:live',
    'member:tools',
    'member:codes',
    'member:wallet',
    'member:otp',
    'member:viptools',
    'member:customer',
    'member:duel',
    'member:ref',
    'member:vip',
    'member:group',
    'member:news',
    'member:gift',
    'member:support'
  ]) {
    assert.ok(actions.includes(action), 'Thiếu chức năng ' + action);
  }
});
