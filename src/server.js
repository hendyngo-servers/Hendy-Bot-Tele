import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./routes/api.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { initializeTelegramBot } from "./services/telegramStartup.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/healthz", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

// Mount Backend API routes
app.use("/api", apiRouter);

// Frontend Vite Integration
if (!isProduction) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
    root: path.resolve(__dirname, "../mini-app")
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, "../mini-app/dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Error Handler
app.use(errorHandler);

// Launch HTTP Server
const server = app.listen(PORT, async () => {
  console.log(`[Hendy Bot System] Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
  try {
    const botStatus = await initializeTelegramBot();
    console.log(`[Telegram Bot] ${botStatus.note}`);
  } catch (err) {
    console.warn(`[Telegram Bot] Startup notice: ${err.message}`);
  }
});

export default app;
