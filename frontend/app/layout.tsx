import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";


const heading = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk"
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope"
});

export const metadata: Metadata = {
  title: "AI Education Platform",
  description: "Industry-grade AI learning SaaS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${heading.variable} ${body.variable} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
