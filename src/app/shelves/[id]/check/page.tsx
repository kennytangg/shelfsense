import { ShelfWorkflow } from "@/components/shelf-workflows";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ShelfWorkflow id={id} mode="check" />;
}
