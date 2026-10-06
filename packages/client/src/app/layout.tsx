import "./globals.css";
import { Schibsted_Grotesk, Newsreader, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const ui = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui" });
const script = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-script" });
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("dark", ui.variable, script.variable, code.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
