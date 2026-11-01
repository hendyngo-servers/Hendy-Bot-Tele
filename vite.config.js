import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import express from "express";
import cors from "cors";
import apiRouter from "./src/routes/api.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";

// Initialize Express backend application for dev middleware
const apiApp = express();
apiApp.use(cors({ origin: true, credentials: true }));
apiApp.use(express.json({ limit: "10mb" }));
apiApp.use(express.urlencoded({ extended: true, limit: "10mb" }));

const healthHandler = (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: "hendy-bot-server",
    botMode: process.env.BOT_MODE || "polling",
    cloudflare: {
      d1: Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || true),
      r2: Boolean(process.env.CLOUDFLARE_R2_BUCKET || true),
      pages: Boolean(process.env.WEBAPP_URL || true)
    }
  });
};

apiApp.get("/healthz", healthHandler);
apiApp.get("/api/healthz", healthHandler);
apiApp.get("/api/v1/healthz", healthHandler);
apiApp.use("/api", apiRouter);
apiApp.use("/api/v1", apiRouter);
apiApp.post("/telegram/webhook", (req, res, next) => {
  req.url = "/telegram/webhook";
  apiRouter(req, res, next);
});
apiApp.use(errorHandler);

export default defineConfig({
  plugins: [
    react(),
    {
      name: "dev-api-middleware",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (
            req.url.startsWith("/api/") ||
            req.url === "/api" ||
            req.url === "/healthz" ||
            req.url === "/telegram/webhook"
          ) {
            apiApp(req, res, next);
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {}
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true
  }
});
