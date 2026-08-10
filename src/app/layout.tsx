import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const fontDisplay = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const fontBody = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Consofy",
    template: "%s · Consofy",
  },
  description:
    "Gestión de consorcios: reclamos, edificios, comunicados y recordatorios en un solo panel para administradores.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f5f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="bg-canvas text-ink flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
