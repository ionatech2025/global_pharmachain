import { z } from "zod";
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_STATUSES } from "../enums";
import { paginationQuerySchema } from "../pagination";
import { optionalFilter } from "./common";

export const issueCreateSchema = z.object({
  subject: z.string().trim().min(5, "Subject must be at least 5 characters").max(200),
  description: z.string().trim().min(10, "Please describe the issue (min 10 characters)").max(4000),
  category: z.enum(ISSUE_CATEGORIES).default("BUG"),
  priority: z.enum(ISSUE_PRIORITIES).default("MEDIUM"),
  pageUrl: z.string().trim().max(500).optional(),
});
export type IssueCreateInput = z.infer<typeof issueCreateSchema>;

export const issueReplySchema = z.object({
  body: z.string().trim().min(2, "Reply must be at least 2 characters").max(4000),
});
export type IssueReplyInput = z.infer<typeof issueReplySchema>;

export const issueAdminUpdateSchema = z
  .object({
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    resolution: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.status !== undefined || v.priority !== undefined || v.resolution !== undefined, {
    message: "Provide at least one field to update",
  });
export type IssueAdminUpdateInput = z.infer<typeof issueAdminUpdateSchema>;

export const issueQuerySchema = paginationQuerySchema.extend({
  status: optionalFilter(z.enum(ISSUE_STATUSES)),
  category: optionalFilter(z.enum(ISSUE_CATEGORIES)),
  priority: optionalFilter(z.enum(ISSUE_PRIORITIES)),
  q: optionalFilter(z.string().max(120)),
});
export type IssueQuery = z.infer<typeof issueQuerySchema>;
