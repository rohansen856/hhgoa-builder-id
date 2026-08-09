import type { Metadata } from "next";
import { Kanit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Kanit({
  variable: "--font-hh-display",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const sans = Plus_Jakarta_Sans({
  variable: "--font-hh-sans",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Hacker House Goa | Builder Card",
  description:
    "Upload your photo and generate your official Hacker House Goa 2026 builder card.",
};

export const viewport = {
  themeColor: "#063725",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
