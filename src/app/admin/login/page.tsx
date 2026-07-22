import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "@/components/ui/shell";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  const hasCustomAdminPassword = Boolean(process.env.ADMIN_PASSWORD);

  return (
    <PublicShell compact>
      <Card>
        <CardHeader>
          <CardTitle>Admin login</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminLoginForm />
          <p className="mt-4 text-xs text-zinc-600">
            {hasCustomAdminPassword
              ? "A custom ADMIN_PASSWORD from .env.local is active. Use that value to sign in."
              : "Local development fallback password: commandloop-admin. Set ADMIN_PASSWORD before production use."}
          </p>
        </CardContent>
      </Card>
    </PublicShell>
  );
}
