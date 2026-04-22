import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { getBotMeta, broadcastToCustomers } from "../bot";

const router: IRouter = Router();

router.get("/bot/info", async (_req, res) => {
  res.json(getBotMeta());
});

router.post("/bot/broadcast", async (req, res) => {
  const parsed = z.object({ message: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await broadcastToCustomers(parsed.data.message);
  res.json(result);
});

export default router;
