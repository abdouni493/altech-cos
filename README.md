# Altech POS — Caisse & gestion de boutique, 100 % hors ligne

Application de caisse et de gestion de boutique (stock, achats, ventes, clients,
fournisseurs, employés, dépenses, caisse, rapports) en **React 18 + TypeScript + Vite**.
Elle fonctionne **sans internet** : toutes les données sont enregistrées sur le PC, dans le dossier
`data\`. Interface bilingue **Français / Arabe (RTL)**, utilisable au clavier, sur PC et sur mobile.

## Installation sur un PC client (Windows)

Prérequis : **Node.js LTS** (https://nodejs.org), à installer une seule fois.

1. Copiez tout le dossier de l'application sur le PC (par ex. `C:\AltechPOS`).
2. Double-cliquez sur **`create-desktop-shortcut.bat`** :
   - installe les dépendances et prépare l'application (première fois : quelques minutes) ;
   - crée le raccourci **« Altech POS »** sur le bureau et dans le menu Démarrer, avec l'icône Altech POS.
3. Double-cliquez sur **Altech POS** sur le bureau : le serveur local démarre en arrière-plan et
   l'application s'ouvre dans **sa propre fenêtre, sans cadre de navigateur** (Edge ou Chrome en mode
   application ; à défaut, le navigateur par défaut).

| Fichier | Rôle |
|---|---|
| `create-desktop-shortcut.bat` | installation + raccourci bureau / menu Démarrer |
| `run-app.bat` | lance l'application avec la fenêtre du serveur visible (journal, dépannage). Fermer cette fenêtre arrête le serveur |
| `stop-app.bat` | arrête le serveur lancé par le raccourci (avant une mise à jour ou un déplacement du dossier) |

Après une mise à jour du code, le raccourci reconstruit l'application automatiquement au lancement suivant.

## Premier lancement

L'écran de connexion propose **« Créer un compte Admin »** tant qu'aucun administrateur n'existe.
Dès que le compte est créé, ce bouton **disparaît définitivement**. L'administrateur se connecte
ensuite avec son email **ou** son nom d'utilisateur. Les comptes des employés se créent dans
**Employés** (case « Compte de connexion ») et utilisent les permissions de la fiche employé.

Les mots de passe ne sont jamais stockés : seule une empreinte salée (SHA-256 itéré) est enregistrée.

## Données — base locale

| Élément | Emplacement |
|---|---|
| Base de données | `data\altech-pos.json` + journal `data\journal.jsonl` (chaque opération est écrite sur disque immédiatement) |
| Sauvegardes automatiques | `data\backups\` — une copie par jour, 30 jours conservés, + une copie avant chaque restauration |
| Journal du serveur | `data\server.log`, `data\server-error.log` |

- **Sauvegarde / restauration manuelle** : Paramètres → Base de données (fichier JSON). Les sauvegardes
  de l'ancienne version en ligne sont acceptées (les comptes actuels sont alors conservés).
- **Changer de PC** : faites une sauvegarde, installez l'application sur le nouveau PC, restaurez.
- Autre dossier de données : variable d'environnement `ALTECH_DATA_DIR`. Autre port : `PORT` (5175 par défaut).
- Si l'application est ouverte sans le serveur local (simple hébergement statique), les données sont
  gardées dans le navigateur (IndexedDB).
- La base n'est accessible que depuis ce PC. Pour partager la même base entre plusieurs caisses du
  réseau local, démarrez le serveur avec `ALTECH_LAN_DB=1` et ouvrez `http://<IP-du-PC>:5175` sur les autres postes.

## Vente en détail (boîte / pièce)

Un produit peut être vendu **à la boîte** et **à la pièce** — ex. un paquet de 20 cigarettes, un flacon
de parfum de 100 ml vendu par 10 ml.

1. **Stock → Nouveau produit** : choisissez (ou créez sur place avec **+**) l'**unité** du produit
   (paquet, boîte, flacon…), activez **Vente en détail**, choisissez l'**unité de détail** (pièce,
   cigarette, ml…), le **nombre de pièces dans une boîte** et le **prix de vente d'une pièce**. Le stock
   initial se saisit en « 12 paquets + 7 cigarettes ». Optionnel : portion par défaut et code-barres
   de la pièce. Les prix d'achat / de vente de la boîte arrivent avec le premier achat.
2. **Caisse** : toucher (ou scanner) le produit ouvre la fenêtre **« Vendre en paquet / Au détail »**
   (touches **B** / **D**), avec quantité (**↑ ↓**), raccourcis de quantité, prix en direct et
   l'état du rayon **avant → après** la vente. Scanner le code-barres d'une pièce l'ajoute directement.
3. **Stock** : chaque carte affiche les **boîtes scellées**, les **pièces restantes dans la boîte
   entamée** (avec jauge) et le total ; le bouton **« Ouvrir 1 paquet »** entame une boîte.
4. Le stock diminue automatiquement à chaque vente : les pièces sont prises d'abord dans la boîte
   entamée, puis une nouvelle boîte est ouverte. Supprimer une vente remet tout en stock.

## Raccourcis clavier (F1 dans l'application)

| Touche | Action |
|---|---|
| `Alt+1…8`, `Alt+E/C/R/P` | ouvrir un module (tableau de bord, caisse, stock, achats…) |
| `Alt+M` | menu complet |
| `F2` | recherche / scanner de la caisse |
| `3*code` puis Entrée | ajouter 3 articles d'un coup |
| `F4` / `F6` / `F7` | client / remise / montant reçu |
| `F8` | mettre la vente **en attente** (rappel via « En attente ») |
| `F9` ou `Ctrl+Entrée` | valider la vente |
| `+` / `−` / `Suppr` | quantité / suppression de la dernière ligne |
| `Ctrl+Entrée` | enregistrer la fiche produit |

## Scanner avec le téléphone

Dans la caisse, **« Scanner avec mon téléphone »** affiche un QR code. Le téléphone (sur le même
Wi-Fi) l'ouvre et chaque code-barres filmé arrive dans le panier, relayé par le serveur local — sans
internet. L'adresse réseau du PC est détectée automatiquement (Paramètres → Base de données).
Les navigateurs mobiles n'autorisent la caméra que sur une page sécurisée : si la caméra du téléphone
est refusée, utilisez la saisie manuelle de la page de scan, la caméra du PC ou une douchette USB.

## Développement

```bash
npm install
npm run dev        # http://localhost:5175 — même base de données data\ que le serveur hors ligne
npm run build      # build de production (dist\)
npm start          # serveur hors ligne : sert dist\ + la base locale
npm run typecheck
```

Icône : `public\altech-pos.svg` ; le fichier `.ico` du raccourci se régénère avec
`.venv\Scripts\python.exe scripts\make-icon.py`.

## Structure

```
server/            serveur hors ligne (Node, sans dépendance) : base locale, API, relais du scanner
scripts/           lanceur du raccourci, préparation (install/build), création du raccourci, icône
src/lib/           database (chargement + sauvegarde automatique des stores), password, scanSession
src/store/         stores Zustand (produits, ventes, achats, comptes…)
src/pages/         un écran par module + /scan (page du téléphone)
src/components/    layout (barre d'icônes, menu, en-tête, raccourcis) + ui + shared
src/utils/         calculs, vente en détail (retail.ts), export / import
```
