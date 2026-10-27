import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";

export const metadata: Metadata = {
  title: "aphring — Nigeria's Community Knowledge Network",
  description:
    "Ask questions about local knowledge, history, traditional leadership, and community records across Nigeria.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <ChunkLoadRecovery />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
