import { ImportWizard } from "@/components/import-wizard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "ייבוא לידים" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="ייבוא לידים" subtitle="כפילויות מזוהות לפי מספר טלפון מנורמל" />
      <ImportWizard />
    </div>
  );
}
