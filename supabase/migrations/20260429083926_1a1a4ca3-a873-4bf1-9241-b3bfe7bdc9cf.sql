-- Rooms
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'lobby', -- lobby | playing | finished
  catastrophe JSONB,
  bunker JSONB,
  capacity INT,
  current_round INT NOT NULL DEFAULT 0,
  epilogue TEXT,
  host_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  secret_token TEXT NOT NULL,
  nickname TEXT NOT NULL,
  character JSONB,           -- full hidden character card
  revealed JSONB NOT NULL DEFAULT '{}'::jsonb, -- revealed attrs
  status TEXT NOT NULL DEFAULT 'alive', -- alive | dead | exiled
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_room ON public.players(room_id);

-- Messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- system | gm | reveal | event | chat
  author TEXT,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_room ON public.messages(room_id, created_at);

-- Public card view (without character full data)
CREATE OR REPLACE VIEW public.players_public AS
SELECT id, room_id, nickname, revealed, status, is_host, joined_at
FROM public.players;

-- Function to get own card by secret token
CREATE OR REPLACE FUNCTION public.get_my_character(p_player_id UUID, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_char JSONB;
BEGIN
  SELECT character INTO v_char
  FROM public.players
  WHERE id = p_player_id AND secret_token = p_token;
  RETURN v_char;
END;
$$;

-- RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Rooms: anyone can read & insert; anyone can update (game is open by code)
CREATE POLICY "rooms_select_all" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert_all" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms_update_all" ON public.rooms FOR UPDATE USING (true);

-- Players: select returns row but characters column is sensitive — handled by view/RPC
CREATE POLICY "players_select_all" ON public.players FOR SELECT USING (true);
CREATE POLICY "players_insert_all" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_update_all" ON public.players FOR UPDATE USING (true);

-- Messages
CREATE POLICY "messages_select_all" ON public.messages FOR SELECT USING (true);
CREATE POLICY "messages_insert_all" ON public.messages FOR INSERT WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;