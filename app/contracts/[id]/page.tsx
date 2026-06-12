import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/db/queries";
import { WorkspaceProvider } from "@/components/workspace/workspace-store";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default async function ContractWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const locale = await getLocale();
  const data = await getWorkspace(id, locale);
  if (!data) notFound();

  return (
    <WorkspaceProvider data={data} view={view === "changes" ? "changes" : "analyze"}>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
