import { HttpException } from "@nestjs/common";

/** Domain exception carrying the API's error envelope. Helper names/signatures
 *  are shared with the service layer — throw sites read as business rules. */
export class ApiException extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ error: { code, message, details } }, status);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiException(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") =>
  new ApiException(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You are not authorised to perform this action") =>
  new ApiException(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new ApiException(404, "NOT_FOUND", message);
export const conflict = (message: string) => new ApiException(409, "CONFLICT", message);
export const limitReached = (message: string, details?: unknown) =>
  new ApiException(403, "LIMIT_REACHED", message, details);
