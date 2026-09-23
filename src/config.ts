function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}
export const config = {
  port: Number(process.env.PORT || 3000),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  sessionRoot: process.env.SESSION_ROOT || "/data/sessions",
  mediaBucket: process.env.MEDIA_BUCKET || "whatsapp-media",
  logLevel: process.env.LOG_LEVEL || "info"
};