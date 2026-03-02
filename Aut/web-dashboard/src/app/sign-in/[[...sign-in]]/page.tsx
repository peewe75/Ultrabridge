import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Page() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="mb-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
        >
          <div className="p-2 rounded-full bg-zinc-900 border border-white/5 group-hover:border-white/20 transition-all">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium">Torna alla Home</span>
        </Link>
      </div>

      <SignIn appearance={{
        elements: {
          rootBox: "mx-auto",
          card: "bg-zinc-950 border border-white/10 shadow-2xl",
          headerTitle: "text-white font-bold",
          headerSubtitle: "text-gray-400",
          socialButtonsBlockButton: "bg-zinc-900 border-white/10 text-white hover:bg-zinc-800 transition-all",
          dividerLine: "bg-white/10",
          dividerText: "text-gray-500",
          formFieldLabel: "text-gray-300",
          formFieldInput: "bg-black border-white/10 text-white focus:border-blue-500 transition-all",
          formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20",
          footerActionText: "text-gray-400",
          footerActionLink: "text-blue-500 hover:text-blue-400 transition-colors",
        }
      }} />
    </div>
  );
}