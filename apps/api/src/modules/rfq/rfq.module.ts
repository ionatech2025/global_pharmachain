import { Module } from "@nestjs/common";
import { QuotationController, RfqController } from "./rfq.controller";
import { RfqService } from "./rfq.service";

@Module({
  controllers: [RfqController, QuotationController],
  providers: [RfqService],
})
export class RfqModule {}
