import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { idParamSchema } from "@pharmachain/core";
import { Prisma, prisma } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, RequireCompany, setAudit } from "../../common/decorators";
import { badRequest, notFound } from "../../common/errors";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser } from "../../lib/context";

const MAX_SAVED_SEARCHES = 10;

const savedSearchCreateSchema = z.object({
  name: z.string().min(2).max(60),
  params: z
    .object({
      q: z.string().max(120).optional(),
      kind: z.string().max(40).optional(),
      categoryId: z.uuid().optional(),
      country: z.string().max(56).optional(),
    })
    .refine((p) => Object.values(p).some(Boolean), "Save at least one filter"),
});
type SavedSearchCreate = z.infer<typeof savedSearchCreateSchema>;

/** Saved marketplace searches with daily new-match alerts (deferred item). */
@RequireCompany()
@Controller("saved-searches")
export class SavedSearchController {
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return prisma.savedSearch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(savedSearchCreateSchema)) body: SavedSearchCreate,
    @Req() req: FastifyRequest,
  ) {
    const count = await prisma.savedSearch.count({ where: { userId: user.id } });
    if (count >= MAX_SAVED_SEARCHES) {
      throw badRequest(`You can keep up to ${MAX_SAVED_SEARCHES} saved searches`);
    }
    const saved = await prisma.savedSearch.create({
      data: { userId: user.id, name: body.name, params: body.params as Prisma.InputJsonValue },
    });
    setAudit(req, { action: "saved-search.create", entityType: "SavedSearch", entityId: saved.id });
    return saved;
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const { count } = await prisma.savedSearch.deleteMany({
      where: { id: params.id, userId: user.id },
    });
    if (count === 0) throw notFound("Saved search not found");
    setAudit(req, {
      action: "saved-search.delete",
      entityType: "SavedSearch",
      entityId: params.id,
    });
    return { ok: true };
  }
}
