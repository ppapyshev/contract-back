import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// --- Шаблоны временно отключены ---
/*
const templates = [
  {
    title: "Договор аренды",
    icon: "🏠",
    color: "from-emerald-500 to-teal-600",
    category: "Аренда",
    popular: true,
    sortOrder: 1,
    description: "Найм жилого помещения между физлицами",
    content: `ДОГОВОР НАЙМА ЖИЛОГО ПОМЕЩЕНИЯ

1. Предмет договора
Наймодатель передаёт Нанимателю жилое помещение по адресу: ___________

3. Размер и порядок оплаты
3.4. Наймодатель вправе в одностороннем порядке изменить размер платы, уведомив за 14 календарных дней.

5. Ответственность
5.2. При досрочном расторжении по инициативе Нанимателя обеспечительный платёж не возвращается.`,
  },
  {
    title: "Договор подряда",
    icon: "💼",
    color: "from-amber-500 to-orange-600",
    category: "Услуги",
    popular: true,
    sortOrder: 2,
    description: "Оказание услуг / фриланс",
    content: `ДОГОВОР ВОЗМЕЗДНОГО ОКАЗАНИЯ УСЛУГ

4. Оплата
4.2. Оплата производится в течение 30 календарных дней после подписания акта.

6. Права на результат
6.1. Исключительные права на результат работ переходят Заказчику в полном объёме.`,
  },
  {
    title: "Купля-продажа",
    icon: "🤝",
    color: "from-blue-500 to-indigo-600",
    category: "Купля-продажа",
    popular: true,
    sortOrder: 3,
    content: "ДОГОВОР КУПЛИ-ПРОДАЖИ ...",
  },
  {
    title: "NDA / Конфиденциальность",
    icon: "🔒",
    color: "from-purple-500 to-pink-600",
    category: "Другое",
    sortOrder: 4,
    content: "СОГЛАШЕНИЕ О НЕРАЗГЛАШЕНИИ ...",
  },
  {
    title: "Договор займа",
    icon: "💰",
    color: "from-yellow-500 to-amber-600",
    category: "Другое",
    sortOrder: 5,
    content: "ДОГОВОР ЗАЙМА ...",
  },
  {
    title: "Расписка",
    icon: "📝",
    color: "from-gray-500 to-slate-600",
    category: "Другое",
    sortOrder: 6,
    content: "РАСПИСКА в получении денежных средств ...",
  },
];
*/

const systemDocs = [
  {
    slug: "disclaimer",
    title: "Disclaimer",
    sortOrder: 1,
    content: `Сервис «Простой Договор» предоставляет информационную помощь в понимании текстов договоров.
Результаты анализа не являются юридической консультацией и не заменяют помощь квалифицированного юриста.
Перед подписанием важных документов рекомендуем обратиться к специалисту.`,
  },
  {
    slug: "privacy",
    title: "Политика обработки данных",
    sortOrder: 2,
    content:
      "Мы обрабатываем персональные данные в соответствии с законодательством РФ...",
  },
  {
    slug: "faq",
    title: "FAQ",
    sortOrder: 3,
    content: "Частые вопросы о сервисе, лимитах и подписке...",
  },
];

async function main() {
  // for (const t of templates) {
  //   const existing = await prisma.template.findFirst({
  //     where: { title: t.title },
  //   });
  //   if (!existing) {
  //     await prisma.template.create({ data: t });
  //   }
  // }

  for (const d of systemDocs) {
    await prisma.systemDoc.upsert({
      where: { slug: d.slug },
      create: d,
      update: { title: d.title, content: d.content, sortOrder: d.sortOrder },
    });
  }

  console.log("Seed completed");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
