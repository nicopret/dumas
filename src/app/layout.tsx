import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dumas",
  description: "Visual story development",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
