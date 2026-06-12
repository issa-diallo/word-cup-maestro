import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viral Shorts Factory",
  description: "Transforme un lien YouTube en 4 shorts originaux prets a produire."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
