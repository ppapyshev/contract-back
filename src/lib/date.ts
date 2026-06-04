export function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days < 7) return `${days} дн. назад`;
  if (days < 14) return '1 неделю назад';
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  if (days < 60) return '1 месяц назад';
  return date.toLocaleDateString('ru-RU');
}
