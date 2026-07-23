# Calmación

Bitácora personal de regulación emocional — episodios de ira, inteligencia
emocional, pequeños detonantes, momentos de felicidad, niveles de calma,
Catalizador (guía en el momento) y estadísticas.

Los datos se guardan en **Supabase** (Postgres), protegidos por login
(correo + contraseña) y Row Level Security, así que solo tú puedes ver o
modificar tus registros.

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta / proyecto gratis.
2. En el proyecto, ve a **SQL Editor → New query**, pega el contenido de
   [`supabase-schema.sql`](./supabase-schema.sql) y dale **Run**. Esto crea
   las tablas `entries` y `profiles` con Row Level Security activada.
3. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key**

## 2. Desarrollo local

```bash
cp .env.example .env
# pega tu Project URL y anon key en .env

npm install
npm run dev
```

Abre http://localhost:5173, crea una cuenta desde la pantalla de login y listo.

## 3. Desplegar en Vercel

1. Sube este proyecto a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com), **Add New → Project** e importa ese repo.
   Vercel detecta Vite automáticamente (build command `vite build`, output `dist`).
3. En **Environment Variables**, agrega las mismas dos variables de `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Cada push a `main` vuelve a desplegar automáticamente.

## Datos y respaldo

Además de vivir en Supabase, puedes exportar/importar un respaldo `.json`
desde el ícono de engranaje dentro de la app — útil antes de cambios grandes
o para migrar registros.
