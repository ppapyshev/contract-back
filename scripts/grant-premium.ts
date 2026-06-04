/**
 * Выдать premium пользователю по email.
 * Usage: npx tsx scripts/grant-premium.ts steeleltt@gmail.com
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx scripts/grant-premium.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const premiumUntil = new Date();
  premiumUntil.setFullYear(premiumUntil.getFullYear() + 10);

  const plan = await prisma.userPlan.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      plan: 'premium',
      billing: 'yearly',
      used: 0,
      premiumUntil,
    },
    update: {
      plan: 'premium',
      billing: 'yearly',
      used: 0,
      premiumUntil,
    },
  });

  console.log('Premium granted:', { email, userId: user.id, premiumUntil: plan.premiumUntil });
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
