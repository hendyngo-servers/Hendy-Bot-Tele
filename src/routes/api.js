const express = require('express');
const router = express.Router();
const taskService = require('../services/taskService');

router.get('/tasks', async (req, res, next) => {
  try {
    const tasks = await taskService.getTasks();
    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
});

router.post('/tasks', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new Error('Tên công việc là bắt buộc.');
    const newTask = await taskService.addTask(name);
    res.status(201).json({ success: true, data: newTask });
  } catch (error) {
    error.statusCode = 400;
    next(error);
  }
});

module.exports = router;
