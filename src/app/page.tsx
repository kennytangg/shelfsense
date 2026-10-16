import { DashboardView } from "@/components/dashboard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string }>;
}) {
  const { status, view } = await searchParams;
  return (
    <DashboardView
      view={
        ["restocking", "verification", "attention"].includes(view || "")
          ? view
          : ""
      }
      status={["Full", "Low", "Empty"].includes(status || "") ? status : ""}
    />
  );
}
