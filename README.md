# Familien-App

Web-App (PWA) für den Familienalltag: Termine, Einkaufsliste, Erinnerungen.
React (Vite) + Supabase, gehostet bei IONOS.

- `npm install`, `npm run dev` – lokal starten
- `npm run build` – fertige Dateien in `dist/` (für IONOS Deploy Now: Build-Befehl `npm run build`, Ausgabeordner `dist`)
- `npm test` – Tests für Kalender-Wiederholungen, Klender-Import, Einkaufsbereiche

Zugang: nur Konten, deren E-Mail in `members.email` steht (Supabase-Projekt „Familien-App“).
