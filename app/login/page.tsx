import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/contracts");
  return <AuthForm />;
}
