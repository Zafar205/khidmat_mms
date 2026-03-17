import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const SITE_NAME = "RLCC Marks Management System";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: SITE_NAME,
  description: "School marks management and authentication",
  icons: {
    icon: "/rlcc_logo.jpg",
    shortcut: "/rlcc_logo.jpg",
    apple: "/rlcc_logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-[#632567] text-white">
          <header className="border-b border-white/40 bg-[#632567]">
            <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
              <Image
                src="/rlcc_logo.jpg"
                alt="RLCC logo"
                width={42}
                height={42}
                className="rounded-md border border-white/50 object-cover"
                priority
              />
              <p className="text-sm font-semibold tracking-wide text-white sm:text-base">
                {SITE_NAME}
              </p>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
