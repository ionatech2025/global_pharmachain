import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasskeyService } from "./passkey.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasskeyService],
  exports: [AuthService, PasskeyService],
})
export class AuthModule {}
