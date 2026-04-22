import type { Context, SessionFlavor, InlineKeyboard } from "grammy";
import { logger } from "../lib/logger";

export interface NavSession {
  navMessageIds: number[];
}

type NavCtx = Context & SessionFlavor<NavSession>;

export async function clearNav(ctx: NavCtx): Promise<void> {
  if (!ctx.chat) return;
  const ids = ctx.session.navMessageIds ?? [];
  ctx.session.navMessageIds = [];
  for (const id of ids) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, id);
    } catch (e) {
      logger.debug({ e, id }, "failed to delete nav message");
    }
  }
}

export async function tryDeleteIncoming(ctx: NavCtx): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    /* ignore */
  }
}

export interface NavReplyOptions {
  parse_mode?: "MarkdownV2" | "HTML";
  reply_markup?: InlineKeyboard;
}

export async function sendNav(
  ctx: NavCtx,
  text: string,
  options: NavReplyOptions = {},
): Promise<void> {
  const sent = await ctx.reply(text, options as any);
  if (!ctx.session.navMessageIds) ctx.session.navMessageIds = [];
  ctx.session.navMessageIds.push(sent.message_id);
}

export async function sendNavPhoto(
  ctx: NavCtx,
  photo: string,
  options: NavReplyOptions & { caption?: string } = {},
): Promise<void> {
  const sent = await ctx.replyWithPhoto(photo, options as any);
  if (!ctx.session.navMessageIds) ctx.session.navMessageIds = [];
  ctx.session.navMessageIds.push(sent.message_id);
}
