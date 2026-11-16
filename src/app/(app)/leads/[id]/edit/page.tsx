import { notFound } from "next/navigation";
import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/db";
import { getLeadDetail } from "@/lib/queries";

export const metadata = { title: "עריכת ליד" };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = await getLeadDetail(user.id, id);
  if (!detail) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`עריכה: ${detail.lead.full_name}`} />
      <LeadForm lead={detail.lead} />
    </div>
  );
}
