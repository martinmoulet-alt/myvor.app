# sync-watch-dgccrf

Ingestion DGCCRF via le flux RSS officiel. Les pages HTML individuelles peuvent répondre 403 depuis l'egress Supabase ; le RSS officiel fournit le titre, la date et, lorsqu'elle existe, la description publiée. Le worker stocke cette substance officielle directement dans `watch_item_content`.
