/**
 * Migration Script: Encrypt User aiApiKey and webhookSecret Fields
 *
 * This script encrypts existing plaintext values in the User table.
 * It uses a raw Prisma client (without extensions) to read plaintext values,
 * then encrypts and updates them.
 *
 * IMPORTANT: Run this script ONCE after deploying the Prisma extension changes.
 * Running it multiple times will double-encrypt values, making them unreadable.
 *
 * Usage:
 *   npx ts-node scripts/migrate-encrypt-user-secrets.ts
 *
 * Or with pnpm:
 *   pnpm tsx scripts/migrate-encrypt-user-secrets.ts
 */

import { PrismaClient } from "@/generated/prisma/client";
import { encryptToken, decryptToken } from "../apps/web/utils/encryption";

// Use raw Prisma client without extensions to read plaintext values
const prisma = new PrismaClient();

async function isAlreadyEncrypted(value: string): Promise<boolean> {
  // Try to decrypt the value - if it succeeds and returns something different,
  // it was already encrypted. This is more reliable than pattern matching.
  try {
    const decrypted = decryptToken(value);
    // If decryption succeeds and returns a non-null, different value, it was encrypted
    // Note: decryptToken returns null on failure, so null means plaintext
    return decrypted !== null && decrypted !== value;
  } catch {
    // Decryption threw an error, so it's plaintext
    return false;
  }
}

async function migrateUserSecrets() {
  console.log("Starting migration of User secrets...\n");

  // Fetch all users with non-null aiApiKey or webhookSecret
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { aiApiKey: { not: null } },
        { webhookSecret: { not: null } },
      ],
    },
    select: {
      id: true,
      email: true,
      aiApiKey: true,
      webhookSecret: true,
    },
  });

  console.log(`Found ${users.length} users with secrets to potentially migrate.\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const user of users) {
    const updates: { aiApiKey?: string; webhookSecret?: string } = {};
    let needsUpdate = false;

    // Check and encrypt aiApiKey
    if (user.aiApiKey) {
      if (await isAlreadyEncrypted(user.aiApiKey)) {
        console.log(`  [SKIP] User ${user.email}: aiApiKey appears already encrypted`);
      } else {
        const encrypted = encryptToken(user.aiApiKey);
        if (encrypted) {
          updates.aiApiKey = encrypted;
          needsUpdate = true;
          console.log(`  [ENCRYPT] User ${user.email}: aiApiKey will be encrypted`);
        } else {
          console.error(`  [ERROR] User ${user.email}: Failed to encrypt aiApiKey`);
          errorCount++;
        }
      }
    }

    // Check and encrypt webhookSecret
    if (user.webhookSecret) {
      if (await isAlreadyEncrypted(user.webhookSecret)) {
        console.log(`  [SKIP] User ${user.email}: webhookSecret appears already encrypted`);
      } else {
        const encrypted = encryptToken(user.webhookSecret);
        if (encrypted) {
          updates.webhookSecret = encrypted;
          needsUpdate = true;
          console.log(`  [ENCRYPT] User ${user.email}: webhookSecret will be encrypted`);
        } else {
          console.error(`  [ERROR] User ${user.email}: Failed to encrypt webhookSecret`);
          errorCount++;
        }
      }
    }

    // Update if needed
    if (needsUpdate) {
      try {
        // Use raw SQL to bypass Prisma extensions (which would double-encrypt)
        await prisma.$executeRaw`
          UPDATE "User"
          SET
            "aiApiKey" = COALESCE(${updates.aiApiKey ?? null}, "aiApiKey"),
            "webhookSecret" = COALESCE(${updates.webhookSecret ?? null}, "webhookSecret"),
            "updatedAt" = NOW()
          WHERE id = ${user.id}
        `;
        migratedCount++;
      } catch (error) {
        console.error(`  [ERROR] User ${user.email}: Update failed:`, error);
        errorCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("Migration Summary:");
  console.log(`  Total users processed: ${users.length}`);
  console.log(`  Successfully migrated: ${migratedCount}`);
  console.log(`  Skipped (already encrypted): ${skippedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log("=".repeat(50));

  if (errorCount > 0) {
    console.log("\n⚠️  Some errors occurred. Please review the logs above.");
    process.exit(1);
  }

  console.log("\n✅ Migration completed successfully!");
}

// Run the migration
migrateUserSecrets()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
