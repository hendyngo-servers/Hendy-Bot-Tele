const { MongoClient, ServerApiVersion } = require('mongodb');

let client = null;
let database = null;
let connecting = null;

function getMongoConfig() {
  const uri = String(process.env.MONGODB_URI || '').trim();
  const dbName = String(process.env.MONGODB_DB_NAME || 'hendy_bot').trim();
  if (!uri) throw new Error('MONGODB_URI chưa được cấu hình.');
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('MONGODB_URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://.');
  }
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(dbName)) {
    throw new Error('MONGODB_DB_NAME không hợp lệ.');
  }
  return { uri, dbName };
}

async function connectMongo() {
  if (database) return database;
  if (connecting) return connecting;

  connecting = (async () => {
    const { uri, dbName } = getMongoConfig();
    const nextClient = new MongoClient(uri, {
      appName: 'Hendy-Bot-Tele',
      maxPoolSize: Math.max(2, Math.min(20, Number(process.env.MONGO_MAX_POOL_SIZE) || 10)),
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    });

    try {
      await nextClient.connect();
      const nextDatabase = nextClient.db(dbName);
      await nextDatabase.command({ ping: 1 });
      client = nextClient;
      database = nextDatabase;
      console.info('[DB] MongoDB Atlas đã kết nối:', dbName);
      return database;
    } catch (error) {
      await nextClient.close().catch(() => {});
      throw new Error('Không kết nối được MongoDB Atlas: ' + error.message);
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

function getDatabase() {
  if (!database) throw new Error('MongoDB chưa kết nối. Gọi connectMongo() trước.');
  return database;
}

async function closeMongo() {
  const current = client;
  client = null;
  database = null;
  if (current) await current.close();
}

function isConnected() {
  return Boolean(database && client);
}

function hasConfig() {
  return Boolean(String(process.env.MONGODB_URI || '').trim());
}

module.exports = { connectMongo, getDatabase, closeMongo, isConnected, hasConfig };
