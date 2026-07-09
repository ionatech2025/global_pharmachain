import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import {
  idParamSchema,
  type PaginationQuery,
  PREFERENCE_EVENT_TYPES,
  type PreferenceUpdate,
  paginate,
  paginationQuerySchema,
  preferenceUpdateSchema,
  skipTake,
} from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { CurrentUser } from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser } from "../../lib/context";

@Controller("notifications")
export class NotificationController {
  /** In-app notification centre (US-605). */
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(zodPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    const where = { userId: user.id };
    const [items, total] = await prisma.$transaction([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(query) }),
      prisma.notification.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  @Get("unread-count")
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    return { count };
  }

  @HttpCode(200)
  @Post(":id/read")
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    await prisma.notification.updateMany({
      where: { id: params.id, userId: user.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @HttpCode(200)
  @Post("read-all")
  async markAllRead(@CurrentUser() user: AuthUser) {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  /** Per-event opt-out (US-606): defaults all-on; in-app can't be disabled. */
  @Get("preferences")
  async preferences(@CurrentUser() user: AuthUser) {
    const stored = await prisma.notificationPreference.findMany({ where: { userId: user.id } });
    const preferences = PREFERENCE_EVENT_TYPES.map((eventType) => {
      const row = stored.find((p) => p.eventType === eventType);
      return { eventType, email: row?.email ?? true, whatsapp: row?.whatsapp ?? true };
    });
    return { preferences };
  }

  @Put("preferences")
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(preferenceUpdateSchema)) body: PreferenceUpdate,
  ) {
    await prisma.$transaction(
      body.preferences.map((pref) =>
        prisma.notificationPreference.upsert({
          where: { userId_eventType: { userId: user.id, eventType: pref.eventType } },
          update: { email: pref.email, whatsapp: pref.whatsapp },
          create: {
            userId: user.id,
            eventType: pref.eventType,
            email: pref.email,
            whatsapp: pref.whatsapp,
          },
        }),
      ),
    );
    return { ok: true };
  }
}
