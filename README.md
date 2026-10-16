# FitFood

PWA para registrar comidas con una foto: Gemini detecta los alimentos, estima gramos y calcula kcal, proteína, carbohidratos y grasas. Los objetivos se adaptan a la etapa (volumen, definición, mantenimiento) y al horario de entrenamiento.

Stack: Next.js (Pages Router) + React, Supabase (auth, base y fotos), Gemini `gemini-2.5-flash-lite`, deploy en Vercel. Todo en free tier.

## Puesta en marcha

### 1. Supabase (proyecto nuevo)
1. Creá un proyecto nuevo en supabase.com.
2. SQL Editor > New query > pegá `supabase/schema.sql` > Run. Crea las tablas `profiles`, `meals`, `weights`, el bucket privado `meal-photos` y las políticas para que cada usuario vea solo lo suyo.
3. Authentication > Sign In / Providers > Email: si querés que tus amigos entren sin confirmar el mail, desactivá **Confirm email**.
4. Authentication > URL Configuration: poné tu dominio de Vercel como **Site URL** (cuando lo tengas).
5. Project Settings > API: copiá la **Project URL** y la **anon public key**.

### 2. Gemini
Generá una API key en aistudio.google.com (la misma de Pulso sirve, pero los análisis comparten el cupo gratuito).

### 3. Local
```bash
cp .env.example .env.local   # completá las 3 variables
npm install
npm run dev
```

### 4. Vercel
Importá el repo y cargá las mismas variables en Settings > Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY` (y opcionalmente `GEMINI_MODEL`).

### 5. Instalar en el celu
- iPhone: Safari > Compartir > Agregar a inicio.
- Android: Chrome > ⋮ > Instalar app.

## Estructura
```
pages/index.js           Orquesta sesión, perfil, pestañas y la hoja de carga
pages/api/analyze.js     Foto/texto → Gemini → alimentos con valores c/100 g (requiere sesión)
components/
  AuthScreen.js          Login y registro con mail y contraseña
  GoalsForm.js           Datos, etapa, horario de entreno y objetivos (onboarding y ajustes)
  TodayView.js           Proteína del día como protagonista, macros y lista de comidas
  MealEditor.js          Foto → análisis → revisión editable de gramos → guardar
  HistoryView.js         Últimos 14 días, promedios y registro de peso
  SettingsView.js        Ajustes y cierre de sesión
lib/nutrition.js         Etapas, momentos del día, esquema completo/low carb, cálculo de objetivos
lib/image.js             Compresión de fotos en el celu (máx. 1024 px, JPEG)
supabase/schema.sql      Tablas, bucket y políticas
```

## Cómo funcionan los cálculos
- Cada alimento se guarda con sus valores **cada 100 g**; al cambiar los gramos se recalcula todo en el celu.
- Los totales los calcula el servidor a partir de gramos × valores c/100 g, no se toman de la cuenta del modelo.
- Objetivos sugeridos: Mifflin-St Jeor × 1,5 (3 entrenamientos por semana), +10 % en volumen, −20 % en definición. Proteína = g/kg × peso. Grasa 0,9 g/kg (0,8 en definición). El resto, carbohidratos. Son un punto de partida editable.
- Esquema del plan: si entrenás a la mañana, desayuno y almuerzo son plato completo y merienda y cena low carb; a la tarde/noche es al revés.
