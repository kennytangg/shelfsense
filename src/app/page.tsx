import { DashboardView } from "@/components/dashboard";
import { isShelfStatus, isShelfView } from "@/components/shelf-summary";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const { view, status } = await searchParams;
  return (
    <DashboardView
      view={isShelfView(view) ? view : ""}
      status={isShelfStatus(status) ? status : ""}
    />
  );
}
