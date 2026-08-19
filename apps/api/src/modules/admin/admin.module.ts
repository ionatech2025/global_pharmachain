import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  // Confirming a credit request settles it through BillingService, the same
  // path the payment webhook takes.
  imports: [BillingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
