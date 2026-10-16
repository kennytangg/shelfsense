import { cn } from "@/lib/utils";
export const photoFrameClass =
  "photo-frame flex aspect-[4/3] max-h-96 w-full min-w-0 items-center justify-center rounded-lg bg-muted object-contain text-center text-sm leading-5 text-muted-foreground [@media(min-width:768px)]:h-[min(32vw,24rem)] [@media(min-width:768px)]:aspect-auto";
export function PhotoFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(photoFrameClass, className)}>{children}</div>;
}
