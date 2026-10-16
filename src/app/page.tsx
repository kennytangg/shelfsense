import { DashboardView } from "@/components/dashboard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return (
    <DashboardView
      view={
        ["restocking", "verification", "attention"].includes(view || "")
          ? view
          : ""
      }
    />
  );
}
