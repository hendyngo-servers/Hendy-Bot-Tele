const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '../../database.json');

const initDB = async () => {
  try {
    await fs.access(DB_PATH);
  } catch (error) {
    await fs.writeFile(DB_PATH, JSON.stringify({ tasks: [] }));
  }
};

const getTasks = async () => {
  await initDB();
  const data = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(data).tasks;
};

const saveTasks = async (tasks) => {
  await fs.writeFile(DB_PATH, JSON.stringify({ tasks }, null, 2));
};

const addTask = async (taskName) => {
  const tasks = await getTasks();
  const newTask = { id: Date.now(), name: taskName, completed: false };
  tasks.push(newTask);
  await saveTasks(tasks);
  return newTask;
};

const completeTask = async (id) => {
  const tasks = await getTasks();
  const task = tasks.find(t => t.id === parseInt(id));
  if (task) {
    task.completed = true;
    await saveTasks(tasks);
    return task;
  }
  return null;
};

const deleteTask = async (id) => {
  let tasks = await getTasks();
  const initialLength = tasks.length;
  tasks = tasks.filter(t => t.id !== parseInt(id));
  if (tasks.length !== initialLength) {
    await saveTasks(tasks);
    return true;
  }
  return false;
};

module.exports = { getTasks, addTask, completeTask, deleteTask };
