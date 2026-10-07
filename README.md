# Proforma Studio

Application de facturation proforma autonome, sans serveur et utilisable en ouvrant `index.html` dans un navigateur. Elle prend en charge huit marques : Voomstore, Magasin Informatique, Onduleurs, Licences, Groupes électrogènes, Le Grand Bâtiment, Starlink CI et Entreprise Informatique.

## Utilisation

1. Téléchargez `index.html` et ouvrez-le dans un navigateur récent, ou hébergez-le comme site statique.
2. Vérifiez les informations d'identité et les coordonnées bancaires de chaque marque avant d'émettre une proforma.
3. Ajoutez vos clients manuellement dans l'onglet **Clients**, puis créez vos documents dans l'onglet **Éditeur**.
4. Pour un PDF, utilisez **Enregistrer en PDF…**, puis choisissez « Enregistrer au format PDF » dans le dialogue d'impression.

Le logo de l'interface et les logos de factures sont intégrés au fichier HTML.

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
- Après connexion, le répertoire de l'onglet **Éditeur** et de l'onglet **Clients** charge les enregistrements de `public.contacts` par pages de 1 000 lignes, afin de dépasser la limite de réponse par défaut de Supabase et de récupérer aussi les fiches au-delà de 1 000. Le mapping utilisé est : `nom` → entreprise / nom affiché, `nom_usage_interne` → nom interne, `numero_fiscal` → numéro fiscal, `emails` → e-mail et `telephones` → téléphone. Le schéma fourni ne contient pas de colonne d'adresse ni de contact séparé ; ces champs restent donc vides lors de la sélection.
- La table `public.contacts` ne contient pas de `user_id` : elle est actuellement considérée comme un répertoire partagé entre les utilisateurs autorisés. Si les contacts doivent être privés par compte, ajoutez une colonne `user_id` et des politiques RLS avant de poursuivre.
- La sélection d'une fiche copie ses coordonnées dans la proforma. Les brouillons, proformas, profils, archives et événements restent enregistrés dans le `localStorage` ; la création ou la modification d'une fiche depuis l'interface n'est pas encore synchronisée vers `public.contacts`.

## Données et confidentialité

Les contacts affichés depuis `public.contacts` sont stockés dans Supabase. Les brouillons, identités personnalisées, archives et l'historique restent dans le `localStorage` du navigateur utilisé, **pas dans ce dépôt**. Ils ne sont ni synchronisés entre appareils ni transférés automatiquement en passant d'un fichier local à un site hébergé. Une suppression des données du navigateur peut effacer les données locales.

Le fichier HTML contient les identités et coordonnées bancaires par défaut destinées à apparaître sur les proformas. **Si le dépôt GitHub est public, ces valeurs le sont également.** Vérifiez leur exactitude et leur attribution à chaque marque avant utilisation.

## GitHub Pages (facultatif)

Dans **Settings → Pages**, choisissez **Deploy from a branch**, branche **main**, dossier **/(root)**. Le site sera alors accessible comme page statique ; GitHub Pages n'ajoute aucun serveur de données.
