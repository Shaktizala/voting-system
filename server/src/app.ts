import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import morgan from "morgan";
import { env, trustProxySetting } from "./config";
import { attachUser, ensureCsrfCookie, requirePasswordChanged, verifyCsrf } from "./middleware/auth";
import { apiLimiter, anonLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errors";
import authRoutes from "./routes/auth.routes";
import participantsRoutes from "./routes/participants.routes";
import teamsRoutes from "./routes/teams.routes";
import roomsRoutes from "./routes/rooms.routes";
import roundsRoutes from "./routes/rounds.routes";
import categoriesRoutes from "./routes/categories.routes";
import resultsRoutes from "./routes/results.routes";
import auditRoutes from "./routes/audit.routes";

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", trustProxySetting());

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: [env.WEB_ORIGIN],
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === "production" ? "tiny" : "dev"));

  // apiLimiter covers authenticated traffic (per user); anonLimiter covers
  // pre-login traffic (per IP, high ceiling) so a shared venue IP is safe.
  app.use("/api", attachUser, apiLimiter, anonLimiter, ensureCsrfCookie);
  // mutating requests must carry X-CSRF-Token matching the csrf cookie
  app.use("/api", verifyCsrf);
  // temporary-password accounts may only reach the auth endpoints until they set their own
  app.use("/api", requirePasswordChanged);

  // health
  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/participants", participantsRoutes);
  app.use("/api/teams", teamsRoutes);
  app.use("/api/rooms", roomsRoutes);
  app.use("/api", roundsRoutes);
  app.use("/api", resultsRoutes);
  app.use("/api", categoriesRoutes);
  app.use("/api/audit", auditRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
