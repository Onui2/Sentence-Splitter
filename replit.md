# Shadowing - Language Learning App

## Overview

Shadowing is a language learning web application built around the "shadowing" technique — where users practice pronunciation by listening to and repeating sentences. Users create "materials" (collections of sentences), add original text with translations, and practice them with text-to-speech playback and translation reveal features.

The app follows a monorepo structure with a React frontend, Express backend, PostgreSQL database, and shared schema/route definitions between client and server.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Directory Structure
- `client/` — React frontend (Vite-based SPA)
- `server/` — Express backend API
- `shared/` — Shared types, schemas, and route definitions used by both client and server
- `migrations/` — Drizzle database migrations
- `script/` — Build scripts

### Frontend Architecture
- **Framework**: React with TypeScript
- **Bundler**: Vite with HMR support
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state
- **UI Components**: Shadcn/ui (new-york style) with Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Animations**: Framer Motion for transitions
- **Forms**: React Hook Form with Zod resolvers for validation
- **Icons**: Lucide React
- **Fonts**: Inter (sans), Calistoga (display)
- **Responsive**: Mobile-first responsive design using `useIsMobile` hook (768px breakpoint). Shadcn sidebar renders as Sheet drawer on mobile. Home page category sidebar becomes overlay drawer with scroll locking. Table columns hide on mobile with inline summary.

Path aliases:
- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`
- `@assets` → `./attached_assets/`

### Backend Architecture
- **Framework**: Express 5 on Node.js
- **Runtime**: tsx for TypeScript execution in dev, esbuild for production builds
- **API Pattern**: REST API under `/api/*` prefix
- **Database**: PostgreSQL via `pg` Pool
- **ORM**: Drizzle ORM with relational queries
- **Validation**: Zod schemas shared between client and server (defined in `shared/`)
- **Dev Server**: Vite middleware in development, static file serving in production

### Shared Layer (`shared/`)
- `schema.ts` — Drizzle table definitions, Zod insert schemas, and TypeScript types
- `routes.ts` — API route definitions with paths, methods, input schemas, and response schemas. Acts as a contract between frontend and backend.

### Database Schema
Two tables with a one-to-many relationship:

**materials** — Learning material collections
- `id` (serial, PK)
- `title` (text, required)
- `description` (text, optional)

**sentences** — Individual practice sentences within a material
- `id` (serial, PK)
- `materialId` (integer, FK → materials.id)
- `originalText` (text, required)
- `translation` (text, required)
- `orderIndex` (integer, required — controls display order)

Relations are defined using Drizzle's `relations()` helper for query support.

### API Endpoints
- `GET /api/materials` — List all materials
- `GET /api/materials/:id` — Get a material with all its sentences
- `POST /api/materials` — Create a new material
- `POST /api/materials/:materialId/sentences` — Add a single sentence
- `POST /api/materials/:materialId/sentences/bulk` — Bulk add sentences (paste multiple at once)
- `GET /api/flip-categories` — Fetch FlipEdu shadowing category tree (proxied)
- `GET /api/flip-papers?classifyNo=X&page=0&size=20` — Fetch FlipEdu shadowing papers for a category (proxied, paginated)
- `GET /api/flip-papers/:paperNo` — Fetch FlipEdu paper detail with shadowings array (proxied)
- `GET /api/question-paper-categories` — Fetch question paper category tree (proxied to `branch/question-paper/classifys/all`)
- `POST /api/question-paper-categories` — Create question paper category
- `PUT /api/question-paper-categories/:classifyNo` — Rename question paper category
- `DELETE /api/question-paper-categories/:classifyNo` — Delete question paper category
- `GET /api/question-papers?classifyNo=X&page=0&size=20` — List question papers (proxied to `branch/question-papers`)
- `POST /api/question-papers` — Create question paper (creates questions then paper)
- `GET /api/question-papers/:paperNo` — Get question paper detail
- `DELETE /api/question-papers/:paperNo` — Delete question paper
- `GET /api/video-categories` — Fetch video category tree (proxied to `branch/video/classifys/all`)
- `POST /api/video-categories` — Create video category
- `PUT /api/video-categories/:classifyNo` — Rename video category
- `DELETE /api/video-categories/:classifyNo` — Delete video category
- `GET /api/videos` — Fetch videos with pagination/filtering (proxied to `branch/videos`)
- `POST /api/videos` — Create video (proxied to `branch/videos`)
- `DELETE /api/videos/:videoNo` — Delete video
- `PUT /api/questions/bulk-classify` — Bulk update question classifyNo (per-question PUT to FlipEdu)
- `POST /api/ai/classify-subject` — Gemini AI auto-classify questions into subject categories (uses gemini-1.5-flash)
- `POST /api/ai/extract-questions` — Gemini Vision AI extract questions from an uploaded image (base64); returns structured question list with type/body/question/choices/answer/explanation
- `POST /api/ai/generate-similar` — Gemini AI generate N similar questions from a source question (question/body/choices/answer/type/count); returns same structured question list

### Storage Layer
- `IStorage` interface defines the data access contract
- `DatabaseStorage` class implements it with Drizzle ORM queries
- Exported as a singleton `storage` instance

### Build Process
- Dev: `tsx server/index.ts` runs the server with Vite middleware for HMR
- Build: Custom script (`script/build.ts`) uses Vite for client and esbuild for server
- Production output goes to `dist/` (server as `index.cjs`, client assets in `dist/public/`)

### Key Frontend Pages
- `/` — Home page (나만의 쉐도잉) with category sidebar, papers list table, and slide-out paper detail panel
- `/create` — Shadowing create page with category selection, sentence splitting, and bulk question setting
- `/video` — Video home (나만의 영상) with video-specific category sidebar, video list, and embedded create modal (drag-and-drop, multi-file upload with left file list + right preview panel)
- `/worksheet` — Worksheet home (나만의 학습지) with question paper category sidebar, question papers list, and embedded create modal (3-step wizard: 기본설정 → 문항입력 → 확인 및 저장)
- `/material/:id` — Material detail with sentence list, add forms, TTS playback, and translation toggle

### Authentication
- **FlipEdu Login**: Multi-step authentication via FlipEdu Editor API (`editor.flipedu.app`)
  1. Academy search: `GET /api/auth/partners?name=학원명` → returns `{ brandNo, logo }`
  2. Branch list: `GET /api/auth/branches?brandNo=X` → returns `[{ value, label1, label2? }]`
  3. Login: `POST /api/auth/login` with `{ brandNo, branchNo, username, credential: btoa(encodeURIComponent(password)) }`
- Server proxies all auth requests to `editor.flipedu.app` to avoid CORS issues
- Auth token stored in server-side session (express-session)
- Session type extended with `authToken`, `username`, and `academyName` fields
- Auth routes: `/api/auth/partners`, `/api/auth/branches`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`
- Auth response body excluded from API logging for security
- Frontend uses `AuthProvider` context in `client/src/hooks/use-auth.tsx`
- Protected routes: unauthenticated users see Login page
- Login page: 2-step UI (academy search → branch select + 아이디/비밀번호 입력)

## External Dependencies

### Database
- **PostgreSQL** — Primary data store, connected via `DATABASE_URL` environment variable
- **Drizzle ORM** — Schema definition, migrations (`drizzle-kit push`), and queries
- **connect-pg-simple** — Listed as dependency (for session storage, though sessions aren't currently implemented)

### Key NPM Packages
- `express` v5 — HTTP server
- `drizzle-orm` + `drizzle-zod` — ORM and schema-to-Zod conversion
- `@tanstack/react-query` — Client-side data fetching/caching
- `wouter` — Client-side routing
- `framer-motion` — Animations
- `react-hook-form` + `@hookform/resolvers` — Form handling
- `zod` — Schema validation (shared between client/server)
- Shadcn/ui component library (Radix UI primitives, Tailwind, class-variance-authority)
- `recharts` — Charting library (available but not currently used)

### Browser APIs
- **Web Speech API** (SpeechSynthesis) — Used for text-to-speech pronunciation playback in SentenceCard

### Replit Plugins
- `@replit/vite-plugin-runtime-error-modal` — Error overlay
- `@replit/vite-plugin-cartographer` — Dev tooling (dev only)
- `@replit/vite-plugin-dev-banner` — Dev banner (dev only)

## FlipEdu Question Paper API Notes

### Question Paper Detail Response Structure (GET /api/question-papers/:paperNo)
Each question in `questions[]` is structured as:
```json
{
  "ordering": 0,
  "questionType": {"id": "BASIC", "name": "기본"},
  "answerType": {"id": "OBJECTIVE", "name": "객관식"},
  "question": {
    "questionNo": 12345,
    "body": [
      {"ordering": 0, "type": "QUERY", "contents": "문제 질문"},
      {"ordering": 1, "type": "EXAMPLE", "contents": "지문 내용"},
      {"ordering": 2, "type": "CHOICE", "contents": "보기 1"},
      {"ordering": 3, "type": "CHOICE", "contents": "보기 2"}
    ],
    "correctForms": [{"corrects": ["2"], "inCorrects": null}],
    "gradingConditions": {"sensitive": false, "specialCharacter": false, "spacingWord": false, "orGrading": false},
    "comments": null
  }
}
```

**Key mappings for `paperToEditInitData` in WorksheetHome.tsx:**
- **Choices**: `inner.body[]` filtered by `type === "CHOICE"`, sorted by `ordering`
- **Correct answer**: `correctForms[0].corrects[0]` is the body item's **ordering value** → find matching CHOICE item index → 1-based index
- **Question type**: `answerType.id === "OBJECTIVE"` → CHOICE, `"SUBJECTIVE"` → SHORT_ANSWER
- **Grading**: `gradingConditions.sensitive`, `.specialCharacter`, `.spacingWord`, `.orGrading`
- **Explanation**: `inner.comments[0].contents` (HTML stripped)

**When CREATING questions (POST /api/question-papers):**
- Choices are sent as `items: [{ordering, contents}]`
- Correct answer sent as `answer: "2"` (string)
- Explanation sent as `commentary: [{type, contents}]`
- FlipEdu normalizes these to the body/correctForms format internally