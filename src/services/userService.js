let users = {}; 
const userStates = {};

const initUser = (chatId, user) => {
  if (!users[chatId]) {
    users[chatId] = {
      name: user ? (user.first_name || 'Khách') : 'Khách',
      balance: 50000,
      history: ["Khởi tạo tài khoản (+50,000 VNĐ)"],
      linkedAccounts: { SC88: [], C168: [], CM88: [], F8BET: [], ABCVIP: [], KJC_CU: [] },
      accountKho: { RR88: [], MM88: [], GG88: [], U888: [], J88: [], "88CLB": [], ABC8: [], XX8: [] }
    };
  }
  return users[chatId];
};

const getUser = (chatId) => users[chatId];
const getAllUsers = () => users;

const setState = (chatId, stateData) => { userStates[chatId] = stateData; };
const getState = (chatId) => userStates[chatId];
const clearState = (chatId) => { delete userStates[chatId]; };

module.exports = { initUser, getUser, getAllUsers, setState, getState, clearState };
