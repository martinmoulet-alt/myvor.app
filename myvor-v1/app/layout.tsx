import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./dashboard-fixes.css";
import "./myvor-dossier-dark.css";
import "./myvor-veille-dark.css";
import "./myvor-impact-background.css";
import "./impact-radar-labels.css";
import "./note-builder-fullbleed.css";
import "./note-builder-readability.css";
import "./myvor-quality-pass.css";
import "./mobile-module-dock.css";
import "./myvor-app-background.css";
import "./dossiers-cockpit-accent.css";
import PwaRegister from "./PwaRegister";
import StartupRecovery from "./StartupRecovery";
import NetworkStatus from "./NetworkStatus";
import LegalHelpMenu from "./LegalHelpMenu";
import MobileDossierTabs from "./MobileDossierTabs";
import WorkflowGuide from "./WorkflowGuide";
import AITransparencyNotice from "./AITransparencyNotice";
import FirstRunOnboarding from "./FirstRunOnboarding";
import MobileModuleDock from "./MobileModuleDock";
import DossierRealtimeRefresh from "./DossierRealtimeRefresh";

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
  return <html lang="fr"><body><PwaRegister/><StartupRecovery/><NetworkStatus/><DossierRealtimeRefresh/><LegalHelpMenu/><MobileDossierTabs/><WorkflowGuide/><AITransparencyNotice/><FirstRunOnboarding/><MobileModuleDock/>{children}</body></html>;
}
