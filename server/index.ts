import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
}

function enforceJsonContentType(app: express.Application) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    if (!req.path.startsWith("/api")) {
      return next();
    }
    const ct = req.headers["content-type"] ?? "";
    if (!ct.includes("application/json")) {
      return res.status(415).json({ message: "Unsupported Media Type: requests must use application/json" });
    }
    next();
  });
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  const voteTemplatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "vote.html",
  );
  const votePageTemplate = fs.existsSync(voteTemplatePath)
    ? fs.readFileSync(voteTemplatePath, "utf-8")
    : null;

  const resetPasswordTemplatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "reset-password.html",
  );
  const resetPasswordTemplate = fs.existsSync(resetPasswordTemplatePath)
    ? fs.readFileSync(resetPasswordTemplatePath, "utf-8")
    : null;

  const privacyPolicyTemplatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "privacy-policy.html",
  );
  const privacyPolicyTemplate = fs.existsSync(privacyPolicyTemplatePath)
    ? fs.readFileSync(privacyPolicyTemplatePath, "utf-8")
    : null;

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path === "/reset-password" && resetPasswordTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(resetPasswordTemplate);
    }

    if (req.path === "/privacy" && privacyPolicyTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(privacyPolicyTemplate);
    }

    if (req.path.startsWith("/vote/") && votePageTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(votePageTemplate);
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

import { seedDatabase, updateExistingContactsWithLabels } from "./seed";
import { initPromptSync } from "./prompts-sync";
import { scheduleDailyNotifications } from "./push-notifications";
import { pool } from "./db";

async function ensureNotificationLogTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        contact_id VARCHAR NOT NULL,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS notif_type TEXT`);
  } catch (err) {
    console.error("[startup] Failed to create notification_log table:", err);
  }
}

async function ensureUserNotifPreferenceColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suggestion_notif_frequency TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suggestion_notif_time TEXT`);
  } catch (err) {
    console.error("[startup] Failed to add suggestion notif columns:", err);
  }
}

async function ensureHasPasswordColumn() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_password BOOLEAN NOT NULL DEFAULT TRUE`);
  } catch (err) {
    console.error("[startup] Failed to add has_password column:", err);
  }
}

async function ensureLastProfilePushAtColumn() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_profile_push_at TIMESTAMP`);
  } catch (err) {
    console.error("[startup] Failed to add last_profile_push_at column:", err);
  }
}

async function ensurePasswordResetTokensTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
      ON password_reset_tokens (token_hash)
    `);
  } catch (err) {
    console.error("[startup] Failed to create password_reset_tokens table:", err);
  }
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  enforceJsonContentType(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  await ensureNotificationLogTable();
  await ensureUserNotifPreferenceColumns();
  await ensureHasPasswordColumn();
  await ensureLastProfilePushAtColumn();
  await ensurePasswordResetTokensTable();

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  if (process.env.NODE_ENV !== "production") {
    await seedDatabase();
    await updateExistingContactsWithLabels();
  }

  initPromptSync().catch((err) => {
    console.log("[prompts-sync] Init failed (non-fatal):", err.message);
  });

  scheduleDailyNotifications();

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
