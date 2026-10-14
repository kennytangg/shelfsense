import { redirect } from "next/navigation";
import { ShelfDetail } from "@/components/shelf-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ setup?: string }>;
}) {
  const { id } = await params;
  if ((await searchParams).setup === "1") redirect(`/shelves/${id}/setup`);
  return <ShelfDetail id={id} />;
}
