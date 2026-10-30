import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// The fonts ship with the app (Latin letters, from Google Fonts; all under the SIL Open Font License)
// rather than being downloaded from Google during every build: a build server whose Google Fonts
// answer the build tool couldn't read stopped deployments, and nothing about the look changes.
const manrope = localFont({
  src: "./fonts/manrope.woff2",
  variable: "--font-manrope",
  weight: "400 800",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 500",
  display: "swap",
});

const instrumentSerif = localFont({
  src: [
    { path: "./fonts/instrument-serif.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BuildableLabs Team Connect",
  description: "BuildableLabs Team Connect: the team's tools for content, reviews, reports and operations in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
