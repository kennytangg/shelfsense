import { redirect } from "next/navigation";
import { ShelfDetail } from "@/components/shelf-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ setup?: string; duplicate?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (query.setup === "1") redirect(`/shelves/${id}/setup`);
  return <ShelfDetail id={id} duplicate={query.duplicate === "1"} />;
}
