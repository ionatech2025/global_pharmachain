import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  controllers: [BillingController],
  providers: [BillingService],
  // The finance webhook and the admin credit queue both settle fee requests
  // through this service, so the grants a confirmed purchase unlocks live in
  // exactly one place.
  exports: [BillingService],
})
export class BillingModule {}
