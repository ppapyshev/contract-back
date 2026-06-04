import type { User } from '@prisma/client';

export function mapUserProfile(user: User) {
  return {
    id: hashIdToNumber(user.id),
    name: user.name,
    firstName: user.firstName,
    patronymic: user.patronymic,
    phone: user.phone,
    email: user.email,
    avatarUrl: user.avatarUrl,
    roles: user.roles,
    topics: user.topics,
    onboardingDone: user.onboardingDone,
    notificationsOn: user.notificationsOn,
    theme: user.theme,
    language: user.language,
  };
}

/** Совместимость с мобильным User.id: number */
function hashIdToNumber(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = (hash << 5) - hash + uuid.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
