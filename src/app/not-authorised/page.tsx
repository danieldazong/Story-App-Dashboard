import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function NotAuthorisedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-page-padding">
      <div className="card flex max-w-[420px] flex-col gap-3 p-6">
        <h1 className="text-page-title">Not authorised</h1>
        <p className="card__sub-line">
          This account doesn&apos;t have operator access to the NovelNow
          dashboard.
        </p>
        <div>
          <SignOutButton redirectUrl="/sign-in">
            <Button variant="outline">Sign out</Button>
          </SignOutButton>
        </div>
      </div>
    </main>
  );
}
