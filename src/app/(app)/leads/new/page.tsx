import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "ליד חדש" };

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="ליד חדש" />
      <LeadForm />
    </div>
  );
}
