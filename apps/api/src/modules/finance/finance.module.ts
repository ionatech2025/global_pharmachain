import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  // The provider webhook lands here but can settle a platform-fee request as
  // well as an order payment, so BillingService comes in.
  imports: [BillingModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
