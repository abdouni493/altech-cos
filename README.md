# Belle Cosmétiques — Gestion de Boutique Beauté

Application web complète de gestion d'une boutique de cosmétiques, parfums et soins de beauté, construite en **React 18 + TypeScript + Vite**. Toutes les données sont locales (seed riche + persistance `localStorage` via Zustand). Interface bilingue **Français / Arabe (RTL)**, palette « rose · prune · blush · or champagne », animations Framer Motion partout.

## Démarrage

```bash
npm install
npm run dev      # http://localhost:5173
```

Autres scripts :

```bash
npm run build      # build de production (tsc + vite)
npm run preview    # prévisualiser le build
npm run typecheck  # vérification des types
```

## Base de données Supabase

L'application est connectée au projet Supabase `https://iaodxcutsajckdjjqhnk.supabase.co`.

**Installation (une seule fois) :**

1. Supabase Dashboard → **SQL Editor** → New query
2. Coller tout le fichier [`supabase_schema.sql`](supabase_schema.sql) (racine du projet) et **RUN**
   — le script est idempotent, il peut être relancé sans risque.
3. Revenir sur l'application → écran de connexion → **« Créer un compte Admin »**.

Le fichier SQL contient : toutes les tables (produits, achats + lignes + paiements, ventes + lignes +
paiements, clients, fournisseurs, employés + acomptes/absences/salaires, dépenses, caisse, sessions de
scan, journal d'activité), les fonctions RPC derrière **chaque bouton** de l'application
(`create_purchase`, `create_sale`, `add_purchase_payment`, `pay_worker_salary`, …), la sécurité RLS, et
les vues d'analyse (`v_dashboard_kpis`, `v_caisse_ledger`, `v_product_sales_stats`, `v_category_stats`,
`period_summary(…)`). Un en-tête du fichier détaille la correspondance **écran → SQL**.

Les identifiants sont dans `.env` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) avec repli codé en dur
pour que le build `dist/` fonctionne sans fichier `.env`.

## Connexion

- **Premier lancement** : le bouton **« Créer un compte Admin »** est affiché tant qu'aucun
  administrateur n'existe (vérifié côté serveur via `admin_exists()`). Dès que le compte est créé, le
  bouton disparaît définitivement, sur tous les postes.
- Le compte est créé dans la **table d'authentification Supabase** (`auth.users`) : l'admin se connecte
  ensuite directement avec son email **ou** son nom d'utilisateur.
- **Employés** : dans la fiche employé, cochez « Compte de connexion » et saisissez email + mot de passe.
  Le compte est créé dans `auth.users` avec les permissions accordées — l'employé se connecte
  immédiatement à son espace.
- ⚠️ **Une connexion au serveur est requise** : l'application n'affiche plus aucune donnée locale, tout
  vient de Supabase (voir « Fonctionnement des données »).

## Modules

Dashboard · Gestion de Stock · Achats · Point de Vente (POS) · Ventes · Clients · Fournisseurs · Employés · Dépenses · Caisse · Rapports · Paramètres.

### Scanner les produits avec le téléphone (POS)

Dans le **Point de Vente**, le bouton **« Scanner avec mon téléphone »** ouvre une session d'appairage :

1. Un **QR code** s'affiche sur la caisse.
2. Le téléphone le flashe et ouvre la page `/scan/<session>` (aucun compte requis).
3. Chaque code-barres filmé est envoyé à la caisse **en temps réel** (Supabase Realtime + repli par
   interrogation toutes les 1,5 s) et le produit correspondant est **ajouté au panier de la facture**.

Autres modes de saisie disponibles au même endroit : la **caméra du poste** (PC / tablette) et la saisie
manuelle. Une douchette USB fonctionne aussi en tapant dans le champ de recherche (validation par Entrée).

> Le téléphone doit pouvoir joindre l'application : le serveur de dev écoute sur le réseau local
> (`npm run dev` affiche l'adresse `http://192.168.x.x:5175`). Si la caisse est ouverte sur `localhost`,
> la fenêtre de scan propose de saisir l'adresse réseau du PC une fois pour toutes.

### Dates d'expiration (cosmétiques)

- À l'achat (ou dans la fiche produit), on peut **activer / désactiver** le suivi de la date d'expiration par produit.
- Les produits concernés affichent leur date d'expiration sur leur **carte de stock** (pastille colorée : vert = OK, ambre = bientôt, rouge = expiré).
- Le **tableau de bord** et la cloche de notifications listent les produits **bientôt expirés** (≤ 30 jours) et **expirés**.

Chaque action met à jour l'état global (Zustand) et se reflète immédiatement dans toutes les vues liées : un achat met le stock à jour, une vente le décrémente, les dettes alimentent le dashboard et les rapports, etc.

## Stack

React Router v6 · Zustand (persist) · Supabase (Auth · Postgres · Realtime) · React Hook Form + Zod ·
Recharts · Framer Motion · date-fns · lucide-react · react-hot-toast · JsBarcode · qrcode ·
@zxing/browser · react-to-print · TailwindCSS.

## Structure

```
supabase_schema.sql   schéma SQL complet (tables, RPC, RLS, vues) — à exécuter dans Supabase
src/
├── lib/           supabase (client), cloud (repo + mappers), sync, scanSession, usePhoneScan
├── i18n/          traductions FR/AR + hook useTranslation
├── store/         stores Zustand (auth, products, purchases, sales, ...) — miroir cloud
├── data/          données initiales (seed)
├── types/         interfaces TypeScript
├── components/    layout (sidebar, header) + ui + shared (barcode, print, paiement, scanner)
├── pages/         une page par module de la sidebar + /scan (page téléphone)
└── utils/         calculs financiers, animations, helpers, export/import
```

### Fonctionnement des données — Supabase est la seule source

**Aucune donnée métier n'est stockée ni lue dans le navigateur.** Les stores Zustand ne sont qu'un cache
mémoire, rempli **uniquement** par un téléchargement depuis Supabase :

| Étape | Ce qui se passe |
|---|---|
| Connexion / rafraîchissement (F5) | `syncFromCloud()` télécharge toute la boutique depuis Postgres et remplit les écrans |
| Clic sur un bouton (créer, modifier, supprimer, payer…) | mise à jour immédiate à l'écran **+** écriture Supabase via une **file sérialisée** (les clés étrangères arrivent toujours dans le bon ordre) |
| Écriture refusée par la base | message d'erreur + **re-téléchargement automatique** : l'écran ne peut pas conserver une ligne que le serveur a rejetée |
| Modification depuis un autre poste / le téléphone | reçue en **temps réel** (Realtime sur toutes les tables) → les écrans se rafraîchissent |
| Retour sur l'onglet | rafraîchissement automatique |
| Déconnexion | les écrans sont vidés (`clearShopState`) |

Seules trois clés restent dans le navigateur, et aucune ne contient de données de la boutique :
`cosmetics-lang` (langue), `cosmetics-scan-base` (adresse du téléphone pour le scanner) et le jeton de
session Supabase.

> **Migration automatique** : si ce navigateur contient encore les données de l'ancienne version
> (100 % locale) et que le projet Supabase est vide, elles sont **envoyées vers Supabase** à la première
> connexion, puis rechargées depuis le serveur. Les anciennes clés sont conservées intactes par sécurité.

**Sauvegarde / Restauration** (Paramètres → Base de Données) passe aussi par le serveur : l'export est un
extrait frais de la base, et l'import réécrit le fichier dans Supabase avant de recharger les écrans.

## Notes

- **Sauvegarde / Restauration** : Paramètres → Base de Données (export/import JSON).
- **Impression** : factures d'achat / vente et rapports au format A4 avec en-tête du magasin (NIF/NIS/RC).
- **Codes-barres** : génération EAN-13 + impression depuis la fiche produit.
- Les données seed sont calculées en dates relatives à aujourd'hui pour que le tableau de bord soit toujours peuplé.
- Pour repartir de zéro : videz le `localStorage` du navigateur (clés `cosmetics-*`).
