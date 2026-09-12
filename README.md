# Sacramento Café Club

A phone-first collaborative café guide for Sacramento.

## Stack

- React + Vite
- Supabase (database + photo storage)
- Mapbox (interactive map)
- Vercel (hosting)

## Run locally

1. Install Node.js 18+.
2. Run `npm install`
3. Copy `.env.example` to `.env`
4. Add your Supabase URL and anon key.
5. Run `npm run dev`

## Current version

The first screen is a visual/interaction prototype. The next build step is to connect:
- real Supabase café/review data
- Supabase photo uploads
- Mapbox
- contributor identity
- collaborative editing
