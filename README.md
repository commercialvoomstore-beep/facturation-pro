# Proforma Studio

Application de facturation proforma avec interface statique, authentification Supabase et synchronisation sécurisée des clients VosFactures. Le catalogue actif comprend dix marques : Voomstore, Voomnet Technology (`VNT`), Magasin Informatique, Onduleurs, Licences, Groupes électrogènes, Le Grand Bâtiment, Starlink CI, Entreprise Informatique et Cabinet VF. Voomnet Technology utilise `contact@voomnettechnology.ci`, le domaine `voomnettechnology.ci` et le logo fourni ; son adresse, son téléphone et son WhatsApp restent à renseigner tant qu’ils ne sont pas confirmés.

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
- Chaque utilisateur connecté peut modifier son mot de passe depuis le bouton **Mot de passe** de l'en-tête ou depuis **Identité → Sécurité du compte**. L'application vérifie d'abord le mot de passe actuel avec Supabase Auth, puis appelle `updateUser` pour enregistrer le nouveau ; aucun mot de passe ni secret n'est stocké dans le navigateur et aucune migration SQL n'est nécessaire.
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
- Les nouveaux brouillons préremplissent les champs de livraison et de conditions particulières avec les conditions commerciales standard, sans ajouter de titre dans le contenu ; ces textes restent modifiables avant l’enregistrement.
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

Pour rendre l’onglet **Archives** et l’onglet **Historique** persistants, exécutez `supabase/proformas-history.sql` dans **Supabase → SQL Editor**. Le script crée les tables `public.proformas`, `public.activity_events` et les réservations sécurisées de suffixes aléatoires par utilisateur, puis active les politiques RLS. Les archives sont privées par compte utilisateur ; les événements d’historique sont en lecture seule pour l’utilisateur et ne peuvent pas être supprimés depuis l’application. Les brouillons non enregistrés restent locaux.

Lors de la première connexion après l’installation du script, les proformas et événements déjà présents dans le `localStorage` du navigateur sont importés dans le compte connecté avec une source de migration. Les proformas enregistrées ensuite utilisent Supabase comme source principale ; une indisponibilité temporaire active seulement le mode local de secours.
Les nouveaux numéros utilisent le segment fixe `2620` et un suffixe aléatoire de six chiffres, par exemple `PRO-ENTINF-2620-583742` ou `FAC-CABVF-2620-914205`. La date réelle d’émission reste conservée dans le document ; seul le segment de numérotation est fixé à `2620`. Les anciennes références séquentielles restent inchangées. Une réservation serveur empêche les collisions lors de créations simultanées.
Chaque ligne de proforma possède également un champ **Description (facultatif)** sous la désignation. Cette description est conservée dans le brouillon, l’archive, le PDF et l’e-mail du document.

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

## Formulaires clients par site et conversion en facture

Le formulaire client intégré est public uniquement lorsqu’il est ouvert avec un lien généré depuis l’application. Depuis **Clients**, sélectionnez la marque active dans l’en-tête puis cliquez sur **Créer le lien**. Le lien est rattaché à cette marque, valable 30 jours et peut être copié dans WhatsApp. Le client ne choisit pas la marque et aucun PDF n’est envoyé automatiquement par WhatsApp.

Le formulaire impose : nom de l’entreprise, NCC, RCCM, localisation, personne en charge de la validation, e-mail, téléphone, au moins une référence avec quantité et mode de paiement (virement ou espèce). La réponse crée une fiche dans le répertoire partagé, une demande et une proforma avec les lignes reçues. La proforma est automatiquement routée vers la marque/site du lien utilisé : son numéro, son `brand_id`, son logo, ses coordonnées et son snapshot d’identité correspondent à ce site. Les prix ne sont pas demandés au client : la proforma est créée en attente de prix ; l’équipe complète les prix HT dans l’éditeur avant validation. Les champs **Livraison / exécution** et **Note / conditions particulières** sont toujours préremplis avec les conditions commerciales standard ; une valeur personnalisée non vide est conservée.

Le workflow commercial est séquencé ainsi :

1. La demande publique crée une proforma `pending_pricing`, sans prix ; l’équipe complète les prix HT et enregistre la proforma.
2. Dans **Archives**, le bouton **Envoyer la proforma** devient disponible lorsque les lignes sont complètes et que le montant est supérieur à zéro. L’e-mail utilise l’adresse client enregistrée dans la proforma et joint le PDF généré côté serveur.
3. Après un envoi réussi, l’action devient **Renvoyer la proforma**. Chaque renvoi demande une confirmation explicite et crée une nouvelle tentative dans `public.proforma_email_deliveries` ; un rechargement ou un double-clic ne déclenche jamais un renvoi implicite.
4. Après cet envoi, **Confirmer l’accord client** enregistre en une seule opération métier la validation de la proforma, la commande et le paiement reçu. Le badge de confirmation et l’action sont inscrits dans l’historique.
5. L’action **Générer et envoyer la facture** devient disponible après cette confirmation. La contrainte unique sur `public.invoices.proforma_id`, complétée par le contrôle idempotent côté interface, garantit qu’une proforma ne crée qu’une seule facture définitive.
6. La génération tente automatiquement l’envoi de la facture finale par e-mail. Si l’e-mail échoue, la facture reste conservée et l’archive affiche **Renvoyer la facture** ; chaque renvoi demande une confirmation et est journalisé dans `public.invoice_email_deliveries`.
7. Tant qu’aucune facture définitive n’existe, **Annuler la proforma** réalise une annulation logique irréversible individuelle : le numéro, le document et l’historique restent conservés.

Avant d’utiliser cette fonctionnalité :

1. Exécutez `supabase/proformas-history.sql`, puis `supabase/contacts-write.sql`, puis `supabase/client-forms.sql` dans **Supabase → SQL Editor**. Exécutez ensuite `supabase/proforma-email.sql` et `supabase/invoice-email.sql` pour activer les journaux d’envoi.
2. Dans Vercel, configurez côté serveur uniquement :
   - `SUPABASE_URL` ;
   - `SUPABASE_ANON_KEY` pour vérifier les sessions des utilisateurs ;
   - `SUPABASE_SERVICE_ROLE_KEY` pour le formulaire public et les opérations serveur (secret, jamais dans le navigateur ou Git).
3. Redéployez l’application. L’API `api/client-form.js` utilise la clé service uniquement côté serveur pour vérifier le lien, enregistrer la demande, créer la proforma au nom du compte qui a généré le lien et générer son numéro.

Si `client-forms.sql` n’est pas exécuté, les liens et les demandes publiques restent désactivés ; les fonctions d’authentification et de facturation existantes continuent de fonctionner après exécution des scripts Supabase précédents.

## Envoi des proformas et factures par e-mail

L’envoi des documents suit le workflow commercial décrit ci-dessus : la proforma est envoyée après saisie et enregistrement des prix, puis la facture finale est générée après confirmation globale de la validation, de la commande et du paiement. Les deux routes (`api/send-proforma-email.js` et `api/send-invoice-email.js`) génèrent le PDF côté serveur avec PDFKit et l’envoient via **Microsoft Graph / Exchange Online**. Les boutons **Renvoyer la proforma** et **Renvoyer la facture** ne sont activés que par une action explicite et une confirmation ; chaque tentative est conservée dans sa table de suivi.

Le formulaire public ne transmet jamais un PDF directement au client et aucun PDF n’est envoyé automatiquement par WhatsApp. Il crée uniquement la proforma dans Supabase ; l’équipe complète les prix avant l’envoi de la proforma.

Les e-mails de documents utilisent la boîte Microsoft 365 de la marque/site du document. L’expéditeur ne peut pas être choisi depuis le navigateur : il est déterminé côté serveur par la marque.

### Boîtes Exchange vérifiées

La vérification actuelle des boîtes Exchange a confirmé les boîtes de marque sélectionnées suivantes :

- **Le Grand Bâtiment** : `contact@legrandbatiment.ci` → `MS_MAILBOX_LEGRAND` ;
- **Starlink CI** : `contact@starlinkci.ci` → `MS_MAILBOX_STARLINK` ;
- **Voomnet Formation / Cabinet VF** : `contact@voomnetformation.ci` → `MS_MAILBOX_CABINETVF` ;
- **Voomstore Côte d’Ivoire** : `contact@voomstore.ci` → `MS_MAILBOX_VOOM` ;
- **Voomnet Technology** : `contact@voomnettechnology.ci` → `MS_MAILBOX_VOOMNETTECH` ; l’adresse d’envoi doit être autorisée dans Exchange avant l’activation en production.

Les boîtes individuelles non sélectionnées dans Exchange ne sont pas utilisées comme expéditeurs de marque. Les marques **Magasin Informatique**, **Onduleurs**, **Licences**, **Groupes Électrogènes** et **Entreprise Informatique** n’ont pas encore de boîte de marque sélectionnée dans cette vérification ; leur envoi Graph restera indisponible tant qu’une boîte autorisée ne sera pas configurée.

Cette capture confirme la disponibilité des boîtes. Dans le périmètre actuellement retenu, aucune restriction Exchange RBAC supplémentaire n’est configurée : seules les variables `MS_MAILBOX_*` des boîtes disponibles sont renseignées dans Vercel et les autres marques restent sans expéditeur configuré. Cette limitation est applicative et opérationnelle ; la permission Entra `Mail.Send` reste potentiellement large au niveau du tenant. Une restriction Exchange RBAC pourra être ajoutée ultérieurement si une protection tenant-wide est requise.

Variables serveur Vercel à configurer :

- `MS_TENANT_ID` : identifiant du tenant Microsoft Entra ID ;
- `MS_CLIENT_ID` : identifiant de l’application Entra ID ;
- `MS_CLIENT_SECRET` : secret serveur de l’application (ne jamais le mettre dans le navigateur ou Git) ;
- `MS_MAILBOX_VOOM`, `MS_MAILBOX_VOOMNETTECH`, `MS_MAILBOX_MAGINFO`, `MS_MAILBOX_ONDULEURS`, `MS_MAILBOX_LICENCES`, `MS_MAILBOX_GROUPES`, `MS_MAILBOX_LEGRAND`, `MS_MAILBOX_STARLINK`, `MS_MAILBOX_ENTREPRISE`, `MS_MAILBOX_CABINETVF` : boîtes Microsoft 365 autorisées par marque du catalogue actif ; `MS_MAILBOX_VOOMNETTECH` correspond à `contact@voomnettechnology.ci`.
- `MS_REPLY_TO_*` et `MS_FROM_NAME_*` : variables facultatives de réponse et de nom affiché ;
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` pour les routes serveur.

L’application Microsoft Entra ID doit recevoir la permission applicative Microsoft Graph `Mail.Send` avec consentement administrateur. Dans la configuration actuelle, la limitation repose sur les boîtes `MS_MAILBOX_*` configurées côté serveur et non sur une restriction Exchange RBAC ; ne renseignez donc pas les variables des marques dont les boîtes ne sont pas disponibles. Les appels sont effectués uniquement côté serveur par `api/microsoft-graph.js` avec le flux client credentials ; aucun jeton Microsoft ni secret n’est envoyé au navigateur.

Les messages utilisent `POST /users/{boîte}/sendMail`, joignent le PDF et demandent sa conservation dans les éléments envoyés. Microsoft Graph renvoie un accusé d’acceptation par Exchange ; le suivi détaillé des livraisons et des rebonds nécessiterait une évolution séparée.

Exécutez `supabase/invoice-email.sql` et `supabase/proforma-email.sql` après `supabase/client-forms.sql`. Ces scripts créent les journaux `public.invoice_email_deliveries` et `public.proforma_email_deliveries`, qui conservent chaque tentative numérotée, le destinataire, l’expéditeur, le fournisseur Microsoft Graph, le statut et l’erreur éventuelle, sans exposer de secret. Les anciens enregistrements éventuellement liés à l’ancien fournisseur restent historiques et ne sont pas réécrits.

Les e-mails de connexion, d’inscription et de réinitialisation de l’application restent centralisés dans Supabase Auth. Leur configuration SMTP éventuelle est indépendante de l’envoi des documents commerciaux par Microsoft Graph.
