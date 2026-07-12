import cors from "cors";
import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { hyperliquidRouter } from "./routes/hyperliquid.routes";
import { tokenRouter } from "./routes/token.routes";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", tokenRouter);
  app.use("/api", hyperliquidRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
