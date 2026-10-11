import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";
import { PAGE } from "@/styles/colours";
import "@/styles/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "All your money in one place.",
  // Opened from the Home Screen, an iPhone shows the app full screen under the status bar. The
  // default style lets the bar take the theme colour, so its text stays readable in both themes.
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  // Older iPhones only go full screen with Apple's own name for the tag.
  other: { "apple-mobile-web-app-capable": "yes" },
  // Account numbers and amounts aren't phone numbers.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // The page colour behind the status bar and the browser's own bars, for each theme.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: PAGE.dark },
    { media: "(prefers-color-scheme: light)", color: PAGE.light },
  ],
  // Draw to the screen's edges. The shell and sheets keep clear of the notch and the home bar.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
