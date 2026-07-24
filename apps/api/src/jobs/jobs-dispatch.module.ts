import { Module } from "@nestjs/common";
import { JobsDispatchController } from "./jobs-dispatch.controller";

/** Always registered — serverless production has no cron host, so the HTTP
 *  dispatcher must exist regardless of JOBS_IN_PROCESS. */
@Module({
  controllers: [JobsDispatchController],
})
export class JobsDispatchModule {}
