import type { Metadata } from "next";
import { APP_NAME } from "@/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "All your money in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
