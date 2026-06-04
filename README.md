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
| DELETE | `/documents/:id` |
| POST | `/documents/upload` — multipart file |
| POST | `/documents/from-template` — `{ templateId }` |

### Шаблоны, план, система
| GET | `/templates`, `/templates/popular`, `/templates/:id` |
| GET | `/plan` |
| POST | `/plan/subscribe`, `/plan/cancel` |
| GET | `/system/settings`, `/system/docs` |
| POST | `/files/upload` |

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

**Ограничения free tier:** сервис засыпает без запросов (~30–60 с на первый ответ), файлы в `uploads/` не сохраняются между рестартами. Для тестов auth/шаблонов/анализа — достаточно.

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
| `PORT` | нет | Render задаёт сам |
| `HOST` | нет | `0.0.0.0` |

---

## Анализ документов

Сейчас — **заглушка** (без OCR/AI): асинхронная обработка ~1.5 с, результат по ключевым словам в тексте. После подключения AI замените `src/services/analysis.service.ts`.

**ИИ-чат** в этом этапе не реализован (по ТЗ).

## Лимиты Freemium

`FREE_ANALYSES_PER_MONTH` (по умолчанию 3). Премиум — безлимит (`POST /plan/subscribe` в тестовом режиме).

## Структура

```
src/
  modules/   auth, user, documents, templates, plan, system, files
  services/  analysis, plan, mappers
  middleware/
prisma/      schema, seed
```
