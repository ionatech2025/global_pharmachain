import { Module, type OnApplicationShutdown } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { prisma } from "@pharmachain/db";
import { AppController } from "./app.controller";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AuthGuard } from "./common/guards/auth.guard";
import { ClientIpThrottlerGuard } from "./common/guards/client-ip-throttler.guard";
import { MembershipGuard } from "./common/guards/membership.guard";
import { PolicyGuard } from "./common/guards/policy.guard";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { HybridThrottlerStorage } from "./common/throttler-storage";
import { env } from "./env";
import { JobsModule } from "./jobs/jobs.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AnnouncementModule } from "./modules/announcement/announcement.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { BomModule } from "./modules/bom/bom.module";
import { CatalogueModule } from "./modules/catalogue/catalogue.module";
import { CompanyModule } from "./modules/company/company.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DisputeModule } from "./modules/dispute/dispute.module";
import { DocumentModule } from "./modules/document/document.module";
import { LogisticsModule } from "./modules/logistics/logistics.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { OrderModule } from "./modules/order/order.module";
import { RfqModule } from "./modules/rfq/rfq.module";
import { SavedSearchModule } from "./modules/saved-search/saved-search.module";

@Module({
  imports: [
    // Global default rate limit; auth endpoints tighten it per-route. Long-window
    // (security) throttles persist in Postgres so they hold across serverless
    // instances; the short-window default stays in per-instance memory.
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: 300 }],
      storage: new HybridThrottlerStorage(),
    }),
    ScheduleModule.forRoot(),
    // Cron jobs run in-process unless a dedicated worker handles them.
    ...(env.JOBS_IN_PROCESS ? [JobsModule] : []),
    AuthModule,
    CompanyModule,
    CatalogueModule,
    RfqModule,
    OrderModule,
    LogisticsModule,
    DisputeModule,
    DocumentModule,
    BomModule,
    MessagingModule,
    NotificationModule,
    AnnouncementModule,
    BillingModule,
    SavedSearchModule,
    DashboardModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    // Guard order matters: throttle → authenticate → load membership → policy.
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: MembershipGuard },
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await prisma.$disconnect();
  }
}
