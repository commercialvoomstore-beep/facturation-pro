# Proforma Studio

Application de facturation proforma avec interface statique, authentification Supabase et synchronisation sécurisée des clients VosFactures. Elle prend en charge huit marques : Voomstore, Magasin Informatique, Onduleurs, Licences, Groupes électrogènes, Le Grand Bâtiment, Starlink CI et Entreprise Informatique.

## Utilisation

1. Hébergez le dépôt sur Vercel ou ouvrez `index.html` pour utiliser l’interface locale.
2. Vérifiez les informations d'identité et les coordonnées bancaires de chaque marque avant d'émettre une proforma.
3. Consultez et sélectionnez les clients présents dans l'onglet **Clients**, puis créez vos documents dans l'onglet **Éditeur**.
4. Pour un PDF, utilisez **Enregistrer en PDF…**, puis choisissez « Enregistrer au format PDF » dans le dialogue d'impression.

Le logo de l'interface et les logos de factures sont intégrés au fichier HTML. L’import VosFactures nécessite Vercel (ou un hébergement capable d’exécuter `api/import-vosfactures-clients.js`) ; l’ouverture directe du fichier HTML conserve la consultation Supabase mais ne fournit pas cette route serveur.

## Authentification (Supabase)

L'application s'ouvre sur un écran **Connexion / Inscription** : personne n'entre dans la plateforme sans compte. Après connexion, l'en-tête affiche « Bonjour *nom* » et un bouton **Déconnexion**.

- Projet Supabase : `facturation-proforma` (projectID `qugokmusdjleoheuvsvo`), URL `https://qugokmusdjleoheuvsvo.supabase.co`.
- Collez la clé **« anon public »** (tableau de bord Supabase → *Settings → API*) dans la constante `SUPABASE_ANON_KEY`, en haut du script applicatif de `index.html`. Cette clé est faite pour le navigateur ; **ne mettez jamais la clé `service_role`** dans ce fichier.
- Le nom saisi à l'inscription est conservé dans `user_metadata.name` et sert à la salutation.
- L'inscription demande aussi un **matricule 3CX** unique. Il est normalisé en majuscules et enregistré dans `public.user_profiles`.
- Pour activer la correspondance matricule → e-mail, exécutez une fois le script `supabase/3cx-auth.sql` dans **Supabase → SQL Editor**. Il crée la table protégée par RLS, le trigger d'inscription et la fonction RPC utilisée pour résoudre le matricule ; aucune clé `service_role` n'est exposée dans le navigateur.
- L'écran de connexion accepte désormais soit l'e-mail, soit le matricule 3CX, avec le même mot de passe. Les comptes existants continuent de se connecter par e-mail ; ils doivent disposer d'un profil 3CX avant de pouvoir utiliser un matricule.
- Si *Confirm email* est activé dans Supabase (*Authentication → Providers → Email*), l'inscription affiche un message invitant à valider l'e-mail avant de se connecter ; le trigger crée néanmoins la correspondance du matricule dès la création du compte.
- Le client Supabase est chargé depuis un CDN : une connexion internet est nécessaire pour se connecter.
- Après connexion, le répertoire de l'onglet **Éditeur** et de l'onglet **Clients** charge les enregistrements de `public.contacts` par pages de 1 000 lignes. Le mapping utilisé est : `nom` → entreprise / nom affiché, `nom_usage_interne` → nom interne, `numero_fiscal` → NCC, `numero_registre` ou `register_number` → RCC, `emails` → e-mail, `telephones` → téléphone, `contact` → personne de contact et `address` → adresse. La sélection d'un client recopie le NCC et le RCC dans la proforma lorsqu'ils existent.
- La table `public.contacts` ne contient pas de `user_id` : elle est actuellement considérée comme un répertoire partagé entre les utilisateurs autorisés. Si les contacts doivent être privés par compte, ajoutez une colonne `user_id` et des politiques RLS avant de poursuivre.
- Pour autoriser la lecture, la suppression et la synchronisation depuis le répertoire partagé, exécutez `supabase/contacts-write.sql` dans **Supabase → SQL Editor**. Ce script ajoute les colonnes d’origine externe, crée l’unicité `(source, external_id)` et donne aux utilisateurs authentifiés les droits RLS nécessaires. Il n’utilise pas de clé `service_role`.
- Les fiches affichées sont lues depuis `public.contacts`. Depuis la plateforme, elles peuvent être sélectionnées pour une proforma ou supprimées du répertoire. Dans l’éditeur standard, un nouveau client peut être utilisé uniquement sur la proforma ou enregistré explicitement dans le répertoire commun ; la modification manuelle d’une fiche existante reste désactivée.
- L’enregistrement contextuel écrit `source = manual`, sans `external_id`, et mappe `clientCompany` vers `nom`, `clientContact` vers `contact`, `clientPhone` vers `telephones`, `clientEmail` vers `emails`, `clientAddress` vers `address`, `clientNcc` vers `numero_fiscal` et `clientRcc` vers `numero_registre` / `register_number`. Une vérification des doublons par NCC, RCC, e-mail, téléphone ou nom est effectuée avant l’insertion.
- La sélection d'une fiche copie ses coordonnées dans la proforma. Les brouillons et les identités personnalisées restent conservés localement ; les proformas enregistrées et les événements d’historique sont synchronisés dans Supabase après exécution de `supabase/proformas-history.sql`. En cas d’indisponibilité de la base, l’interface conserve temporairement un cache local.
- Le champ facultatif **Titre / objet de la proforma** est conservé dans les brouillons et les proformas enregistrées. Il s’affiche dans l’en-tête du document, sous « Facture proforma » et avant le numéro, par exemple : `INFRASTRUCTURE WI-FI PROFESSIONNELLE`. Les archives peuvent également être recherchées par ce titre.
- La condition de règlement accepte désormais soit une date limite précise, soit **À la commande**. Le document affiche la formulation correspondante dans ses métadonnées.
- Le pied de page du document affiche au centre le **nom du vendeur** issu du compte connecté ainsi que les coordonnées de l’entreprise sélectionnée. Les anciennes mentions légales et la ligne domaine / numéro ont été retirées de ce pied de page. Ces informations sont conservées dans le snapshot des proformas enregistrées.
- Chaque ligne article possède désormais une **unité de vente** (`u`, `m`, `m²`, `m³`, `kg`, `h`, `jour` ou `forfait`). Les quantités mesurées acceptent les décimales et le document affiche `Qté / unité`; une ligne forfaitaire est calculée avec une quantité de 1 et affichée comme `Forfait`. Les anciennes lignes sans unité restent interprétées comme des unités (`u`).
- Dans l’onglet **Éditeur**, les informations client et les articles restent à gauche, l’aperçu A4 se place au centre et le panneau **Conditions & total** se place à droite sur grand écran. Le panneau s’empile automatiquement sur les écrans plus étroits.
- Le bloc final du document affiche désormais le montant entier **À payer** en francs CFA, puis sa valeur en toutes lettres sous le montant, sans centimes, avec une taille de texte réduite et un retour à la ligne automatique.

## Synchronisation VosFactures

Le bouton **Importer les clients** de l’onglet **Clients** récupère l’endpoint `clients.json` page par page avec `per_page=25`, puis effectue un upsert dans `public.contacts` avec :

- `source = vosfactures` ;
- `external_id = id` VosFactures ;
- les champs de nom, nom d’usage, NCC, RCC, e-mail, téléphone, contact et adresse normalisés.

Relancer l’import est donc idempotent : les fiches existantes sont mises à jour au lieu d’être dupliquées. Les champs VosFactures individuels `token`, `panel_url` et les données brutes ne sont jamais enregistrés.

Avant le premier import :

1. **Révoquez le token VosFactures qui a été transmis précédemment et générez-en un nouveau.** Ne le recopiez ni dans `index.html`, ni dans Git, ni dans le chat.
2. Exécutez `supabase/contacts-write.sql` dans Supabase.
3. Dans **Vercel → Project Settings → Environment Variables**, ajoutez pour l’environnement déployé :
   - `VOSFACTURES_API_TOKEN` : le nouveau token, secret côté serveur ;
   - `SUPABASE_URL` : l’URL du projet Supabase ;
   - `SUPABASE_ANON_KEY` : la clé publique/anon du projet.
4. Redéployez Vercel, connectez-vous à la plateforme, ouvrez **Clients**, puis cliquez sur **Importer les clients**.

La route serveur vérifie d’abord la session Supabase de l’utilisateur. Elle utilise la clé anon et le JWT utilisateur pour écrire avec RLS ; aucune clé `service_role` n’est nécessaire ni exposée au navigateur. Le token VosFactures n’est utilisé que côté serveur et n’est pas renvoyé dans la réponse.

## Archives et historique Supabase

Pour rendre l’onglet **Archives** et l’onglet **Historique** persistants, exécutez `supabase/proformas-history.sql` dans **Supabase → SQL Editor**. Le script crée les tables `public.proformas`, `public.activity_events` et le compteur sécurisé des numéros par utilisateur, puis active les politiques RLS. Les archives sont privées par compte utilisateur ; les événements d’historique sont en lecture seule pour l’utilisateur et ne peuvent pas être supprimés depuis l’application. Les brouillons non enregistrés restent locaux.

Lors de la première connexion après l’installation du script, les proformas et événements déjà présents dans le `localStorage` du navigateur sont importés dans le compte connecté avec une source de migration. Les proformas enregistrées ensuite utilisent Supabase comme source principale ; une indisponibilité temporaire active seulement le mode local de secours.

## Export Excel ou SQL local

Si vous préférez générer un fichier à importer manuellement dans Supabase, utilisez `tools/export_vosfactures_clients.py`. Il utilise uniquement la bibliothèque standard Python et produit un fichier `.xlsx`, un script SQL, ou les deux :

```bash
export VOSFACTURES_API_TOKEN='NOUVEAU_TOKEN_CONFIGURE_HORS_DU_DEPOT'
python3 tools/export_vosfactures_clients.py \\
  --xlsx exports/vosfactures_clients.xlsx \\
  --sql exports/vosfactures_clients.sql
```

Le script récupère toutes les pages, s’arrête lorsqu’une page contient moins de 25 fiches, normalise les coordonnées et exclut les champs sensibles `token`, `panel_url` et la réponse brute. Pour le fichier SQL, exécutez d’abord `supabase/contacts-write.sql`, puis ouvrez le fichier généré dans **Supabase → SQL Editor**. Ne mettez jamais le token directement dans le script, le fichier SQL ou Git.

## Données et confidentialité

Les contacts affichés depuis `public.contacts`, les proformas enregistrées et les événements d’historique sont stockés dans Supabase. Les brouillons et identités personnalisées utilisent encore le `localStorage` comme cache local. Les archives et l’historique sont associés au compte connecté et peuvent être retrouvés depuis un autre appareil après exécution de `supabase/proformas-history.sql`. Une suppression des données du navigateur peut effacer les brouillons locaux, mais ne supprime pas les données déjà synchronisées dans Supabase.

Le fichier HTML contient les identités et coordonnées bancaires par défaut destinées à apparaître sur les proformas. **Si le dépôt GitHub est public, ces valeurs le sont également.** Vérifiez leur exactitude et leur attribution à chaque marque avant utilisation.

## GitHub Pages (facultatif)

Dans **Settings → Pages**, choisissez **Deploy from a branch**, branche **main**, dossier **/(root)**. Le site statique sera accessible, mais la route d’import VosFactures ne fonctionnera pas sur GitHub Pages ; utilisez Vercel ou déployez un backend équivalent.
