import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  throw new Error("SUPABASE_URL/VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env");
}

const supabase = createClient(supabaseUrl, serviceRole);

const email = "usuario@padrao.com";
const password = "Usuario@123";

const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;

let user = listed.data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());

if (!user) {
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "user", nome_completo: "Usuário Padrão" }
  });
  if (created.error) throw created.error;
  user = created.data.user;
} else {
  const updated = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { ...(user.user_metadata || {}), role: "user", nome_completo: "Usuário Padrão" }
  });
  if (updated.error) throw updated.error;
  user = updated.data.user;
}

console.log(JSON.stringify({ ok: true, email, password, userId: user.id }, null, 2));
