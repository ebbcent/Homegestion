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

## Déploiement sur le VPS (sans Docker)

Il te faut :

- un VPS sous Debian ou Ubuntu ;
- un nom de domaine, ou un sous-domaine, dont l'enregistrement DNS A pointe vers l'IP du VPS ;
- les ports 80 et 443 libres.

Le HTTPS est obligatoire pour installer l'application sur iPhone.

1. Sur ton Mac, construis l'archive avec `./scripts/package.sh`, ou utilise celle qu'on t'a fournie. Envoie-la sur le VPS :
   ```sh
   scp homegestion-0.1.0.tar.gz utilisateur@ip-du-vps:
   ```
2. Sur le VPS (`ssh utilisateur@ip-du-vps`) :
   ```sh
   tar xzf homegestion-0.1.0.tar.gz
   cd homegestion
   sudo ./deploy/install.sh
   ```
   Le script demande le domaine et le mot de passe de l'application, puis il :
   - installe Node.js 22 et Caddy ;
   - crée le service `homegestion`, qui redémarre tout seul ;
   - obtient le certificat HTTPS ;
   - programme une sauvegarde quotidienne de la base, conservée 30 jours.

**Mise à jour :** décompresse la nouvelle archive et relance `sudo ./deploy/install.sh`. Tes données et ta
configuration sont conservées.

**Emplacements sur le VPS :**

| Élément | Chemin |
| --- | --- |
| Application | `/opt/homegestion` |
| Données | `/var/lib/homegestion` (base, `uploads/`, `backups/`) |
| Configuration | `/etc/homegestion.env` (domaine et mot de passe) |
| Journaux | `journalctl -u homegestion -f` |

Pour changer le mot de passe, modifie `/etc/homegestion.env`, puis lance `sudo systemctl restart homegestion`.

### Variante avec Docker

```sh
cp .env.example .env && nano .env   # DOMAIN et APP_PASSWORD
docker compose up -d --build
```

## Installer l'application

- **iPhone** : ouvre le site dans Safari, puis Partager › « Sur l'écran d'accueil ».
- **Mac** : dans Safari, Fichier › « Ajouter au Dock ». Dans Chrome, utilise l'icône d'installation de la barre d'adresse.

## Sauvegarde

Avec le script d'installation, la base est copiée chaque nuit dans `/var/lib/homegestion/backups/`.
Pour emporter aussi les justificatifs :

```sh
sudo tar czf homegestion-$(date +%F).tar.gz -C /var/lib/homegestion backups uploads
```

Copie ensuite cette archive hors du VPS, par exemple vers pCloud avec rclone.

## Développement

```sh
npm install
APP_PASSWORD=dev npm run dev:server   # API sur http://localhost:3000
npm run dev:web                       # interface sur http://localhost:5173 (accessible depuis l'iPhone sur le même Wi-Fi)
npm test                              # tests du serveur
npm run typecheck
```
