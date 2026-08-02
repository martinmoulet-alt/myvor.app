# Myvor — migrations Supabase

`supabase/migrations/` est désormais la source de vérité pour toutes les évolutions de base de données.

## Règles

1. Toute nouvelle modification SQL crée un nouveau fichier `YYYYMMDDHHMMSS_description.sql`.
2. Une migration déjà versionnée n'est jamais modifiée après avoir été appliquée en production.
3. `schema.sql` est uniquement un snapshot/document de référence ; il ne sert plus à faire évoluer la base de production.
4. Les anciens fichiers `v1_*.sql` et les scripts SQL historiques sont conservés uniquement pour compatibilité/documentation. Ils ne doivent pas recevoir de nouvelles fonctionnalités.
5. Un correctif SQL manuel d'urgence dans le Dashboard Supabase doit être immédiatement reproduit dans une migration horodatée dans le dépôt.
6. Toute migration doit être idempotente quand c'est raisonnablement possible (`if not exists`, `drop policy if exists`, etc.).
7. Toute modification RLS doit être testée avec au moins deux utilisateurs distincts avant un pilote externe.

## Point de départ V1

La base de production V1 existait avant l'introduction de ce dossier de migrations. Les migrations initiales ci-dessous reflètent donc des changements qui ont déjà été appliqués manuellement à la base live :

- `20260802090000_dossier_strategy_profile.sql`
- `20260802100000_secure_tenant_rls.sql`
- `20260802103000_ai_rate_limits.sql`

Lors du passage futur au Supabase CLI, ces versions devront être marquées comme déjà appliquées sur la base live plutôt que rejouées aveuglément.

## Déploiement futur recommandé

Workflow cible :

1. écrire la migration dans `supabase/migrations/` ;
2. relire les effets destructifs (`drop`, changement de type, contrainte, policy) ;
3. tester sur une base de développement/staging ;
4. appliquer la migration ;
5. déployer le frontend/les Edge Functions qui dépendent du nouveau schéma ;
6. exécuter un smoke test Myvor.

Les Edge Functions Supabase restent un déploiement séparé des migrations SQL.
