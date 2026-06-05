# contract-back — API «Простой Договор»

Node.js + TypeScript + Fastify + PostgreSQL (Prisma) для мобильного приложения [contract-mp](/Users/pp/contract-mp).

Формат ответов совместим с клиентом: `{ success, errors, message, data }`.

## Быстрый старт

```bash
# 1. PostgreSQL
docker compose up -d

# 2. Зависимости
cp .env.example .env
npm install

# 3. БД
npm run db:push
npm run db:seed

# 4. Запуск
npm run dev
```

API: `http://localhost:3000`

В `.env` мобильного приложения: `DEV_BASE_URL=http://localhost:3000` (для эмулятора Android — `http://10.0.2.2:3000`).

## Основные эндпоинты

### Авторизация
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/register` | Регистрация email + пароль (JSON) |
| POST | `/auth/registration` | То же, multipart (совместимость с RN) |
| POST | `/auth/login-email` | Вход email + пароль |
| POST | `/auth/login` | Вход (email+password в body) |
| POST | `/auth/logout` | Выход (Bearer) |
| POST | `/auth/forgot-password` | Сброс пароля (заглушка) |
| POST | `/auth/login/google` | Google OAuth (заглушка) |
| POST | `/auth/login/telegram` | Telegram (заглушка) |

Ответ авторизации: `{ type: "Bearer", accessToken: "..." }`

### Пользователь
| Метод | Путь |
|-------|------|
| GET | `/user/profile` |
| PATCH | `/user/profile` |
| PUT | `/user/profile` |
| GET | `/user/notifications` |
| PUT | `/user/notifications` — `{ enabled }` |
| POST | `/user/onboarding` — `{ roles[], topics[] }` |
| DELETE | `/user/documents` — удалить все документы |
| DELETE | `/user/delete` |

### Документы
| Метод | Путь |
|-------|------|
| GET | `/documents` — список, фильтры: `search`, `type`, `risk`, `sort` |
| GET | `/documents/recent` |
| GET | `/documents/:id` |
| GET | `/documents/:id/status` — polling обработки |
| PATCH | `/documents/:id` — `{ title }` |
| PUT | `/documents/:id` — `{ title }` |
| DELETE | `/documents` — удалить все документы пользователя |
| DELETE | `/documents/:id` |
| POST | `/documents/upload` — multipart file |
| POST | `/documents/analyze` — `{ fileIds: string[] }` после `/files/upload` |
| POST | `/documents/from-template` — `{ templateId }` |
| POST | `/documents/:id/reanalyze` |
| GET | `/documents/:id/export/pdf` — `{ url, title, fileName }` |
| GET | `/documents/:id/export/pdf/download` — PDF-файл (Bearer) |
| GET | `/documents/:id/share` — `{ url, title }`, создаёт `shareToken` |
| GET | `/share/:token` — публичный просмотр анализа (JSON или HTML) |
| POST | `/documents/:id/compare` |
| POST | `/documents/:id/referral` — заявка юристу |
| GET | `/documents/:id/chat/messages` |
| POST | `/documents/:id/chat` — `{ message }` |

### Файлы
| GET | `/files/:id/content` — скачать файл (Bearer) |
| POST | `/files/upload` — один файл |
| POST | `/files/upload-multiple` — несколько файлов |

### Шаблоны, план, система
| GET | `/templates`, `/templates/popular`, `/templates/:id` |
| GET | `/plan` |
| POST | `/plan/subscribe`, `/plan/cancel` |
| GET | `/system/settings`, `/system/docs` |

## Хранение файлов

По умолчанию **`STORAGE_MODE=database`** — файлы сохраняются в PostgreSQL (`DocumentFile.data`). Работает на Render free **без карты**, переживает рестарт API.

| Режим | Переменная | Когда |
|-------|------------|-------|
| **database** | `STORAGE_MODE=database` | Render free, по умолчанию |
| local | `STORAGE_MODE=local` | Dev, папка `uploads/` |
| s3 | `STORAGE_MODE=s3` + `S3_*` | R2 / AWS S3 |

Лимит Render Postgres free — ~1 ГБ. Для фото/PDF договоров хватает на старте.

Скачивание: `GET /files/:id/content` (с Bearer-токеном).

### Опционально: Cloudflare R2 (нужна карта)

```env
STORAGE_MODE=s3
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_BUCKET=yasnodogovor-files
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_URL=https://pub-xxxx.r2.dev
```

## Деплой (только бэкенд)

Мобильное приложение не выкладывается — достаточно URL API в `contract-mp/.env`:

```env
DEV_BASE_URL=https://ваш-api.onrender.com
PROD_BASE_URL=https://ваш-api.onrender.com
```

### Render (бесплатно, рекомендуется)

1. Залейте `contract-back` в GitHub.
2. [render.com](https://render.com) → **New** → **Blueprint** → подключите репозиторий.
3. Render подхватит `render.yaml` (Web Service + PostgreSQL).
4. Вручную задайте переменную **`PUBLIC_URL`** = `https://<имя-сервиса>.onrender.com`.
5. После первого деплоя в **Shell** сервиса:

```bash
npm run db:seed
```

6. Проверка: `https://<имя>.onrender.com/health`

**Ограничения free tier:** сервис засыпает без запросов (~30–60 с на первый ответ). Файлы в Postgres сохраняются; лимит БД ~1 ГБ.

### Docker (Fly.io, Railway, VPS)

```bash
docker build -t contract-back .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="длинная-случайная-строка" \
  -e PUBLIC_URL="https://your-domain.com" \
  contract-back
```

### Переменные окружения

| Переменная | Обязательно | Пример |
|------------|-------------|--------|
| `DATABASE_URL` | да | от Render Postgres / Neon |
| `JWT_SECRET` | да | min 16 символов |
| `PUBLIC_URL` | да | `https://api.example.com` |
| `STORAGE_MODE` | нет | `database` (по умолчанию), `local`, `s3` |
| `S3_*` | нет | только при `STORAGE_MODE=s3` |
| `GIGACHAT_AUTH_KEY` | нет | Authorization key из developers.sber.ru |
| `GIGACHAT_MODEL` | нет | `GigaChat` (по умолчанию) |
| `PORT` | нет | Render задаёт сам |
| `HOST` | нет | `0.0.0.0` |

---

## GigaChat (ИИ)

Если задан **`GIGACHAT_AUTH_KEY`**, анализ договоров и чат работают через [GigaChat API](https://developers.sber.ru/docs/ru/gigachat/overview):

1. [developers.sber.ru](https://developers.sber.ru/) → GigaChat API → **Настройка API**
2. Скопируйте **Authorization key** (не Client ID)
3. Добавьте в `.env` / Render:

```env
GIGACHAT_AUTH_KEY=ваш_authorization_key
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat
```

Без ключа — fallback на локальную заглушку анализа.

**OCR:** фото и PDF распознаются через **GigaChat Files API** (нужен `GIGACHAT_AUTH_KEY`). Текст сохраняется в `originalText` после анализа.

## Анализ документов

Асинхронный анализ через GigaChat (JSON: риски, резюме, простое объяснение). История чата сохраняется в `DocChatMessage`.

## Ошибки API

Все ответы с ошибкой:

```json
{
  "success": false,
  "message": "Текст для пользователя",
  "errors": { "email": ["..."] },
  "data": null,
  "error": {
    "code": "GIGACHAT_OAUTH",
    "detail": "полный текст (только в dev или при EXPOSE_ERROR_DETAILS=true)",
    "requestId": "uuid-запроса"
  }
}
```

- **Локально** (`NODE_ENV=development`) в `error.detail` приходит полный текст ошибки.
- **Render:** добавьте `EXPOSE_ERROR_DETAILS=true`, чтобы видеть `detail` в ответах; в логах Render всегда есть `requestId` и stack.
- **Анализ документа** (`GET /documents/:id/status`):
  - `status: "not_contract"` — файл не договор (`errorCode: NOT_A_CONTRACT`), отдельно от технических сбоев;
  - `status: "failed"` — ошибка обработки (`GIGACHAT_*`, `ANALYSIS_FAILED`, …);
  - в обоих случаях `summary` — текст для пользователя, `errorDetail` — при `EXPOSE_ERROR_DETAILS=true`.

После деплоя: `npx prisma db push` (поля `errorCode`, `errorDetail` в `Document`).

## Лимиты Freemium

`FREE_ANALYSES_PER_MONTH` (по умолчанию 3). Премиум — безлимит (`POST /plan/subscribe` в тестовом режиме).

## Структура

```
src/
  modules/   auth, user, documents, templates, plan, system, files
  services/  analysis, gigachat, document-ai, ocr, plan, storage
  middleware/
prisma/      schema, seed
```
