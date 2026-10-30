import type { Metadata, Viewport } from "next";
import splashScreens from "@/lib/pwa/splash-screens.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlanToMe",
  description:
    "A calm daily list: calendar events, tasks and habits in one place.",
  applicationName: "PlanToMe",
  appleWebApp: {
    capable: true,
    title: "PlanToMe",
    statusBarStyle: "default",
    startupImage: splashScreens.map(({ width, height, ratio }) => ({
      url: `/splash/${width * ratio}x${height * ratio}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#faf8f4",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
