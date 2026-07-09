import { Module } from "@nestjs/common";
import { AnnouncementController } from "./announcement.controller";

@Module({
  controllers: [AnnouncementController],
})
export class AnnouncementModule {}
