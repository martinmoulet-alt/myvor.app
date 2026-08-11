# watch-date-enricher

Worker de réparation ponctuelle des dates historiques manquantes. Il n'est volontairement pas planifié : les collecteurs stricts exigent désormais une date officielle à l'ingestion, et ce worker reste disponible uniquement pour le rattrapage de données héritées.
