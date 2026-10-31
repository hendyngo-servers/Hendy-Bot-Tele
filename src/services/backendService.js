const CORE_BACKEND_URL = process.env.CORE_BACKEND_URL || 'https://telegram-mini-app.ngogiaidy56.workers.dev';

const sendAdminCommand = async (command, adminId) => {
  try {
    const response = await fetch(`${CORE_BACKEND_URL}/api/bot-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: adminId,
        userName: 'Hendy_Admin',
        action: 'ADMIN_COMPOSE_COMMAND',
        command: command,
        clientSDK: 'ComposeWeb-TMA-KtorClient'
      })
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const triggerVietsubPipeline = async (chatId, userName) => {
  const response = await fetch(`${CORE_BACKEND_URL}/api/bot-trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, userName, action: 'START_VIETSUB_PIPELINE' })
  });
  return await response.json();
};

module.exports = { sendAdminCommand, triggerVietsubPipeline };
