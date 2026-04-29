const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.functions.invoke('gm', {
    body: { action: 'character', payload: { nickname: 'test' } }
  });
  console.log(data);
}
run();
