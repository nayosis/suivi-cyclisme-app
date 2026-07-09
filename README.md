# Suivi Cyclisme

Application desktop pour enregistrer les sorties vélo d'un cycliste amateur
(date, nom, durée, distance, dénivelé, vélo utilisé, commentaire) et en tirer
des statistiques (dashboard avec totaux, répartition par année/mois/vélo,
calendrier d'activité).

## Structure du projet

```
suivi-cyclisme-app/
└── desktop/    # L'application (Tauri + React + TypeScript)
```

Le dépôt ne contient aucune donnée personnelle : ni base de données, ni
export, ni fichier source d'historique. La base démarre vide (voir
[Sauvegarde / transfert des données](#sauvegarde--transfert-des-données)).

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
- Le seul code Rust "métier" du projet est dans `src-tauri/src/lib.rs` : il se
  contente de s'assurer que le dossier de données de l'application existe. La
  base SQLite elle-même (schéma seul, vide) est créée au premier lancement par
  `db.ts` via `tauri-plugin-sql` — aucune donnée n'est embarquée dans l'exe.

### Où vivent les données une fois l'app lancée ?

`%APPDATA%\<identifier>\suivi_cyclisme.db`, où `<identifier>` est la valeur du
champ `identifier` dans `src-tauri/tauri.conf.json` (actuellement
`com.vincentgouadon.suivicyclisme`). Changer cet identifiant fait pointer
l'app vers un nouveau dossier vide — la base existante n'est pas supprimée,
juste "orpheline" ; il faut alors ré-importer un export JSON pour récupérer
ses données.

### Sauvegarde / transfert des données

L'application ne contient **aucune donnée personnelle** dans son code source :
la base démarre vide. Pour sauvegarder ou transférer des sorties/vélos, on
passe par l'onglet **Options** (icône engrenage) :
- **Exporter** génère un fichier JSON avec tout l'historique (vélos + sorties)
- **Importer** fusionne un fichier JSON exporté précédemment avec les données
  existantes (les doublons sont ignorés, rien n'est jamais écrasé)

Le fichier JSON exporté contient un numéro de version de format (`version`),
pour rester importable même si la structure des données évolue (par exemple
si un futur suivi d'entretien vélo est ajouté).

## Lancer l'application en développement

```bash
cd desktop
npm install
npm run tauri dev
```
