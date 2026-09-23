import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
export type AppUser = { id: string; email: string | null };
export async function getUserFromBearer(authorization?: string): Promise<AppUser | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
export async function assertOrgMembership(userId: string, organizationId: string, roles?: string[]) {
  const { data, error } = await supabase.from("whatsapp_members").select("role, active")
    .eq("organization_id", organizationId).eq("user_id", userId).eq("active", true).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Usuário não pertence a esta organização.");
  if (roles && !roles.includes(data.role)) throw new Error("Usuário sem permissão para esta ação.");
  return data;
}