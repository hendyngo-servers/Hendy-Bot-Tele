const { Telegraf } = require('telegraf');
const taskController = require('./taskController');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is missing in the environment variables.');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Chào mừng đến với Hendy Bot! 🤖\n\nGõ /help để xem danh sách lệnh.');
});

bot.help((ctx) => {
  ctx.reply(
    'CÁC LỆNH KHẢ DỤNG:\n' +
    '/tasks - Xem danh sách công việc\n' +
    '/add <tên> - Thêm việc mới\n' +
    '/complete <id> - Đánh dấu hoàn thành\n' +
    '/delete <id> - Xóa công việc'
  );
});

// Map các lệnh tới taskController
bot.command('tasks', taskController.listTasks);
bot.command('add', taskController.addTask);
bot.command('complete', taskController.completeTask);
bot.command('delete', taskController.deleteTask);

module.exports = bot;
