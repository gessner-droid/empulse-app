import type { ReactNode } from "react";
import "./globals.css";
import Sidebar from "./ui/Sidebar";

export const metadata = { title: "empulse-app" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="app-shell">
          <Sidebar />
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}