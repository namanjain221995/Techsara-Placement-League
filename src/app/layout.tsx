import "@fontsource-variable/inter";
import "@fontsource-variable/oswald";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: { default: "TechSara Placement League", template: "%s · TechSara Placement League" },
  description: "Live candidate auction for the TechSara Placement League — organizer console and projector display.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#070b17", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh">
        {children}
        <Toaster theme="dark" position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
