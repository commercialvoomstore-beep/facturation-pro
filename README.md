# Proforma Studio

Application de facturation proforma autonome, sans serveur et utilisable en ouvrant `index.html` dans un navigateur. Elle prend en charge huit marques : Voomstore, Magasin Informatique, Onduleurs, Licences, Groupes électrogènes, Le Grand Bâtiment, Starlink CI et Entreprise Informatique.

## Utilisation

1. Téléchargez `index.html` et ouvrez-le dans un navigateur récent, ou hébergez-le comme site statique.
2. Vérifiez les informations d'identité et les coordonnées bancaires de chaque marque avant d'émettre une proforma.
3. Ajoutez ou importez vos clients (Excel `.xlsx` ou CSV), puis créez vos documents dans l'onglet **Éditeur**.
4. Pour un PDF, utilisez **Enregistrer en PDF…**, puis choisissez « Enregistrer au format PDF » dans le dialogue d'impression.

Le logo de l'interface, les logos de factures et les bibliothèques nécessaires à l'import des fichiers `.xlsx` sont intégrés au fichier HTML. Certains formats anciens (`.xls`, `.xlsb`) peuvent demander l'ouverture du fichier HTML directement dans le navigateur si l'aperçu bloque le lecteur complémentaire.

## Données et confidentialité

Les clients, brouillons, identités personnalisées, archives et l'historique sont enregistrés dans le `localStorage` du navigateur utilisé, **pas dans ce dépôt**. Ils ne sont ni synchronisés entre appareils ni transférés automatiquement en passant d'un fichier local à un site hébergé. Une suppression des données du navigateur peut effacer ces informations.

Le fichier HTML contient les identités et coordonnées bancaires par défaut destinées à apparaître sur les proformas. **Si le dépôt GitHub est public, ces valeurs le sont également.** Vérifiez leur exactitude et leur attribution à chaque marque avant utilisation.

## GitHub Pages (facultatif)

Dans **Settings → Pages**, choisissez **Deploy from a branch**, branche **main**, dossier **/(root)**. Le site sera alors accessible comme page statique ; GitHub Pages n'ajoute aucun serveur de données.
