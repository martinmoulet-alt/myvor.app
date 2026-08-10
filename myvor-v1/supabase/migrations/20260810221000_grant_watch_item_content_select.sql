-- Note Builder and other authenticated Myvor modules need to read source text
-- while RLS continues to restrict rows to the active workspace.
grant select on table public.watch_item_content to authenticated;
