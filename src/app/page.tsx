import { DashboardView } from "@/components/dashboard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <DashboardView
      status={["Full", "Low", "Empty"].includes(status || "") ? status : ""}
    />
  );
}
