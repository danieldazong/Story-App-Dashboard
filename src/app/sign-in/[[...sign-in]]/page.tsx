import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-page-padding">
      <div className="flex flex-col items-center gap-6">
        <span className="text-[16px] font-semibold leading-none text-text">
          NovelNow
        </span>
        {/* No sign-up route exists — operators are provisioned in the Clerk
            Dashboard. See Prompts/11-clerk-auth.md. */}
        <SignIn appearance={clerkAppearance} />
      </div>
    </main>
  );
}
