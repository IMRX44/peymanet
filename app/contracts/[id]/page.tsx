import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/db/queries";
import { WorkspaceProvider } from "@/components/workspace/workspace-store";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default async function ContractWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const data = await getWorkspace(id, locale);
  if (!data) notFound();

  return (
    <WorkspaceProvider data={data}>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
