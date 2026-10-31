const taskService = require('../services/taskService');

const listTasks = async (ctx) => {
  try {
    const tasks = await taskService.getTasks();
    if (tasks.length === 0) return ctx.reply('Bạn chưa có công việc nào.');
    
    const message = tasks.map(t => 
      `ID: ${t.id} - ${t.name} [${t.completed ? '✅' : '❌'}]`
    ).join('\n');
    await ctx.reply(`📋 Danh sách công việc:\n${message}`);
  } catch (error) {
    await ctx.reply('Lỗi khi lấy danh sách công việc.');
  }
};

const addTask = async (ctx) => {
  try {
    const taskName = ctx.message.text.split('/add ')[1];
    if (!taskName) return ctx.reply('Vui lòng nhập tên công việc. VD: /add Mua cafe');
    
    const newTask = await taskService.addTask(taskName);
    await ctx.reply(`✅ Đã thêm: ${newTask.name} (ID: ${newTask.id})`);
  } catch (error) {
    await ctx.reply('Lỗi khi thêm công việc.');
  }
};

const completeTask = async (ctx) => {
  try {
    const id = ctx.message.text.split('/complete ')[1];
    if (!id) return ctx.reply('Vui lòng nhập ID. VD: /complete 123456');
    
    const task = await taskService.completeTask(id);
    if (task) await ctx.reply(`✅ Đã hoàn thành: ${task.name}`);
    else await ctx.reply('❌ Không tìm thấy ID công việc này.');
  } catch (error) {
    await ctx.reply('Lỗi khi cập nhật công việc.');
  }
};

const deleteTask = async (ctx) => {
  try {
    const id = ctx.message.text.split('/delete ')[1];
    if (!id) return ctx.reply('Vui lòng nhập ID. VD: /delete 123456');
    
    const isDeleted = await taskService.deleteTask(id);
    if (isDeleted) await ctx.reply(`🗑 Đã xóa công việc ID: ${id}`);
    else await ctx.reply('❌ Không tìm thấy ID công việc này.');
  } catch (error) {
    await ctx.reply('Lỗi khi xóa công việc.');
  }
};

module.exports = { listTasks, addTask, completeTask, deleteTask };
