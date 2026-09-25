import { DB_NAME, resetDbForTests } from '../db/db.ts';

/** Stänger anslutningen och raderar databasen – en ny enhet till nästa test. */
export async function deleteTestDb(): Promise<void> {
  await resetDbForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      resolve();
    };
  });
}
