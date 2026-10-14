# Homegestion

Application web pour gérer les factures de la maison, le budget mensuel et les dépenses récurrentes,
utilisable sur Mac et sur iPhone (application installable, ou PWA). Les données restent sur ton propre serveur.

## Fonctions

- **Factures** : libellé, fournisseur, montant, catégorie, échéance, statut payé ou à payer, notes, recherche et filtres.
- **Justificatifs** : PDF ou photos (JPEG, PNG, HEIC, WebP, 20 Mo au plus) joints à chaque facture. Sur iPhone,
  le bouton propose l'appareil photo, la photothèque ou l'app Fichiers.
- **Budget mensuel** : un plafond par catégorie, le réel comparé au prévu, les dépassements en rouge et un historique sur 12 mois.
- **Dépenses récurrentes** : mensuelles, bimestrielles, trimestrielles, semestrielles ou annuelles. Les échéances
  sont créées automatiquement jusqu'à la fin du mois suivant. Une échéance supprimée n'est pas recréée, et une
  modification du montant ne touche que les échéances à venir non payées.
- **Accueil** : reste à payer du mois, factures en retard, échéances des 14 prochains jours. Un toucher sur le
  cercle marque une facture payée.
- **Export JSON** de toutes les données.

## Architecture

| Partie | Technologie |
| --- | --- |
| Serveur | Node.js 22 et Fastify, base SQLite (`node:sqlite`, un seul fichier) |
| Interface | React et Vite, PWA (manifeste et service worker) |
| Accès | Mot de passe unique, session par cookie `httpOnly` de 90 jours, blocage après 5 essais |
| Déploiement | Docker Compose et Caddy (certificat HTTPS automatique avec Let's Encrypt) |

Les données vivent dans `data/` : `homegestion.db` pour la base, `uploads/` pour les justificatifs et `backups/`
pour les sauvegardes.

## Déploiement sur le VPS

Il te faut :

- Docker et Docker Compose sur le VPS ;
- un nom de domaine, ou un sous-domaine, qui pointe vers l'IP du VPS ;
- les ports 80 et 443 ouverts.

Le HTTPS est indispensable : sans lui, l'iPhone ne peut pas installer l'application.

```sh
git clone https://github.com/ebbcent/Homegestion.git
cd Homegestion
cp .env.example .env
nano .env            # renseigne DOMAIN et APP_PASSWORD
docker compose up -d --build
```

Ensuite, ouvre `https://ton-domaine`.

**Mise à jour :** `git pull && docker compose up -d --build`

## Installer l'application

- **iPhone** : ouvre le site dans Safari, puis Partager › « Sur l'écran d'accueil ».
- **Mac** : dans Safari, Fichier › « Ajouter au Dock ». Dans Chrome, utilise l'icône d'installation de la barre d'adresse.

## Sauvegarde

```sh
docker compose exec app node server/dist/backup.js              # instantané de la base dans data/backups/
tar czf homegestion-$(date +%F).tar.gz data/backups data/uploads  # base et justificatifs
```

Pour une sauvegarde quotidienne, ajoute ceci à la crontab du VPS (`crontab -e`) :

```
30 3 * * * cd /chemin/vers/Homegestion && docker compose exec -T app node server/dist/backup.js
```

Copie ensuite `data/` ailleurs, par exemple vers pCloud avec rclone.

## Développement

```sh
npm install
APP_PASSWORD=dev npm run dev:server   # API sur http://localhost:3000
npm run dev:web                       # interface sur http://localhost:5173 (accessible depuis l'iPhone sur le même Wi-Fi)
npm test                              # tests du serveur
npm run typecheck
```
