DROP VIEW IF EXISTS public.players_public;

-- Recreate function as SECURITY INVOKER (token-based access is the security boundary)
DROP FUNCTION IF EXISTS public.get_my_character(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_my_character(p_player_id UUID, p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT character
  FROM public.players
  WHERE id = p_player_id AND secret_token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_character(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_character(UUID, TEXT) TO anon, authenticated;