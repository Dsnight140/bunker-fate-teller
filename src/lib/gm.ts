import { supabase } from "@/integrations/supabase/client";

export async function callGM(action: string, payload: any = {}) {
  const { data, error } = await supabase.functions.invoke("gm", {
    body: { action, payload },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "GM error");
  return data.result;
}