import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data: agents, error: err1 } = await supabase.from('agents').select('*').limit(1);
  console.log('Agents Error:', err1);
  const { data: links, error: err2 } = await supabase.from('custom_links').select('*').limit(1);
  console.log('Links Error:', err2);
}
test();
