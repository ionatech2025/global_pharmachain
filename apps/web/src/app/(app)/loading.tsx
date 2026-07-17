import { PageSkeleton } from "@/components/page-skeleton";

// Route-group loading boundary: the shell (sidebar, header, alerts) persists
// while the destination page streams — navigation feedback is immediate.
export default function AppLoading() {
  return <PageSkeleton />;
}
