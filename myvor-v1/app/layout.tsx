import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./dashboard-fixes.css";
import "./myvor-dossier-dark.css";
import "./myvor-veille-dark.css";
import "./myvor-impact-background.css";
import PwaRegister from "./PwaRegister";

export const metadata: Metadata = {
  title: "Myvor — Anticipez l’impact",
  description: "Le cockpit opérationnel des affaires publiques.",
  manifest: "/manifest.webmanifest",
  applicationName: "Myvor",
  appleWebApp: {
    capable: true,
    title: "Myvor",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07162c"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister/>{children}</body></html>;
}
