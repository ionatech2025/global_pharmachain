import { Body, Controller, Get, Param, Post, Query, Req, Sse } from "@nestjs/common";
import {
  idParamSchema,
  type MessageCreate,
  messageCreateSchema,
  type ThreadLookup,
  threadLookupSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  RequirePermission,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { MessagingService } from "./messaging.service";

const afterQuerySchema = z.object({ after: z.iso.datetime().optional() });
type AfterQuery = z.infer<typeof afterQuerySchema>;

@Controller("threads")
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @RequirePermission("message:read")
  @Get()
  list(@CurrentMembership() membership: Membership) {
    return this.messagingService.listThreads(membership);
  }

  @RequirePermission("message:read")
  @Post("lookup")
  lookup(
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(threadLookupSchema)) body: ThreadLookup,
  ) {
    return this.messagingService.lookupOrCreateThread(membership, body);
  }

  @RequirePermission("message:read")
  @Get(":id/messages")
  messages(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Query(zodPipe(afterQuerySchema)) query: AfterQuery,
  ) {
    return this.messagingService.listMessages(membership, params.id, query.after);
  }

  @RequirePermission("message:read")
  @Sse(":id/stream")
  async stream(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    // Access is asserted before the stream opens; afterwards the observable
    // only ever reveals "something changed".
    await this.messagingService.listMessages(membership, params.id, new Date().toISOString());
    const lastEventId = req.headers["last-event-id"];
    const since = typeof lastEventId === "string" ? new Date(lastEventId) : new Date();
    return this.messagingService.streamChanges(
      membership,
      params.id,
      Number.isNaN(since.getTime()) ? new Date() : since,
    );
  }

  @RequirePermission("message:write")
  @Post(":id/messages")
  async post(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(messageCreateSchema)) body: MessageCreate,
    @Req() req: FastifyRequest,
  ) {
    const message = await this.messagingService.postMessage(
      user,
      membership,
      params.id,
      body.body,
      body.attachmentDocumentIds,
    );
    setAudit(req, { action: "message.post", entityType: "Message", entityId: message.id });
    return message;
  }
}
