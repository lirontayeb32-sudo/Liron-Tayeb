import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-28 md:pb-12">{children}</main>
    </>
  );
}
