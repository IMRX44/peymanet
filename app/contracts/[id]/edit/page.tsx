import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { EditorWorkspace } from "@/components/editor/editor-workspace";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();
  if (contract.ownerId && contract.ownerId !== user.id) notFound();

  const version = contract.headVersionId
    ? await prisma.contractVersion.findUnique({ where: { id: contract.headVersionId } })
    : await prisma.contractVersion.findFirst({ where: { contractId: id }, orderBy: { versionNumber: "desc" } });

  return (
    <EditorWorkspace
      contractId={id}
      initialContent={version?.contentText ?? ""}
      versionNumber={version?.versionNumber ?? 1}
      title={contract.title}
      locale={locale}
    />
  );
}
