import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Workspace } from "@/components/workspace";
import "./globals.css";
export const metadata: Metadata = {
  title: "ShelfSense · Store operations",
  description: "Check visible shelf coverage and coordinate restocking.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Workspace>{children}</Workspace>
        </Providers>
      </body>
    </html>
  );
}
