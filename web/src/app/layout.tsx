import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rezumate — AI Resume Agent",
  description:
    "Intelligent AI agent that tailors your resume to any job description. ATS optimization, skills gap analysis, cover letter generation, and career management — all in one platform.",
  keywords: ["resume", "AI", "ATS", "job", "career", "cover letter", "optimization"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
