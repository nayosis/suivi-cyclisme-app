# Suivi Cyclisme

Application desktop pour enregistrer les sorties vélo d'un cycliste amateur
(date, nom, durée, distance, dénivelé, vélo utilisé, commentaire) et en tirer
des statistiques (dashboard avec totaux, répartition par année/mois/vélo,
calendrier d'activité).

## Structure du projet

```
suivi-cyclisme-app/
├── desktop/            # L'application (Tauri + React + TypeScript)
└── suivi perf velo/    # Fichiers Excel sources : historique des sorties 2016-2026
```

## Stack technique

### Frontend (`desktop/src/`)

- **React + TypeScript**, servi par **Vite** (bundler et serveur de dev)
- **CSS pur** (`theme.css`) : variables CSS pour une palette cohérente,
  thème clair/sombre automatique (`prefers-color-scheme`), pas de framework
  UI (Tailwind, MUI, etc.)
- **Recharts** pour les graphiques (barres empilées par vélo, etc.)
- Le calendrier d'activité (heatmap façon GitHub) est fait main en CSS Grid,
  sans dépendance externe

Organisation :
- `pages/` — les 3 écrans (`DashboardPage`, `RidesPage`, `BikesPage`)
- `components/` — composants réutilisables (tuiles de stats, graphiques,
  modales de formulaire, calendrier)
- `db.ts` — toute la couche d'accès aux données (SQL), c'est le seul endroit
  qui parle à la base
- `palette.ts` / `theme.css` — couleurs et thème partagés entre les
  composants React et les graphiques

### Natif / "backend" (`desktop/src-tauri/`)

- **Tauri** (Rust) : encapsule l'app web dans un exécutable natif léger. À la
  différence d'Electron, Tauri n'embarque pas Chromium — il utilise le moteur
  web déjà présent sur l'OS (WebView2 sur Windows), d'où un exécutable
  beaucoup plus petit et un démarrage plus rapide.
- **SQLite** via le plugin **`tauri-plugin-sql`** : la base de données est
  interrogée directement depuis le TypeScript (`db.ts`) via des requêtes SQL,
  sans passer par des commandes Rust custom — toute la logique métier vit
  côté frontend.
- Le seul code Rust "métier" du projet est dans `src-tauri/src/lib.rs` : au
  premier lancement, il copie la base SQLite "graine"
  (`src-tauri/resources/suivi_cyclisme.db`, qui contient tout l'historique
  importé depuis `suivi perf velo/`) vers le dossier de données de
  l'application. Les lancements suivants réutilisent cette copie sans jamais
  écraser les données de l'utilisateur.

### Où vivent les données une fois l'app lancée ?

La base SQLite réelle (celle que l'app lit/écrit au quotidien) se trouve dans
le dossier de données de l'application Windows :
`%APPDATA%\com.vincentgouadon.suivicyclisme\suivi_cyclisme.db`

Ce n'est **pas** le fichier `desktop/src-tauri/resources/suivi_cyclisme.db`,
qui est seulement la graine copiée au premier lancement.

## Lancer l'application en développement

```bash
cd desktop
npm install
npm run tauri dev
```
