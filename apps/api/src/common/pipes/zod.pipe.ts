import type { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { ApiException } from "../errors";

/** Per-route validation with the shared @pharmachain/core Zod contracts:
 *  `@Body(zodPipe(registerSchema)) body: RegisterInput`. */
export function zodPipe<Output>(schema: ZodType<Output>): PipeTransform<unknown, Output> {
  return {
    transform(value: unknown): Output {
      const result = schema.safeParse(value);
      if (!result.success) {
        throw new ApiException(
          400,
          "VALIDATION_ERROR",
          "Invalid input",
          result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
      }
      return result.data;
    },
  };
}
