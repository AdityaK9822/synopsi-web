import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/* Plus Jakarta Sans: the reference design's display/UI face — headings,
   labels and body all speak it. Geist Mono stays for code/hash/type chips. */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Synopsi — Smart Academic Notes Assistant",
  description:
    "Messy lectures, PDFs and scans in, exam-ready study pack out — a summary, key concepts and revision questions, answered strictly from your own notes.",
};

// Applied before React hydrates so the theme never flashes the wrong way.
const themeInit = `try{var t=localStorage.getItem('snaw-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${jakarta.variable} ${geistMono.variable} font-sans antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
