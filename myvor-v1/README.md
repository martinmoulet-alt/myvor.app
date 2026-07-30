# Myvor V1

Application Next.js mobile-first connectée à Supabase.

## Mise en route

1. Créer un projet Supabase.
2. Dans **SQL Editor**, exécuter `supabase/schema.sql`.
3. Copier `.env.example` vers `.env.local` et renseigner l’URL et la clé anon Supabase.
4. Lancer :

```bash
npm install
npm run dev
```

## Déploiement Netlify

- Importer le dépôt ou déposer le projet.
- Build command : `npm run build`
- Ajouter dans **Environment variables** :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Inclus

- Authentification e-mail/mot de passe
- Tableau de bord
- Dossiers clients
- Veille avec types juridiques et liens officiels
- Niveaux d’impact vert/orange/rouge/bordeaux
- Écrans Note d’impact, Radar d’influence et Note Builder préparés
- Sécurité RLS : chaque utilisateur ne voit que ses données
