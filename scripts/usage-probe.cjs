/**
 * Mini admin CLI — reads FIREBASE_SERVICE_ACCOUNT from .env.local (never
 * hardcoded, never from outside the repo).
 *
 *   node scripts/usage-probe.cjs plan <uid> free|premium
 *   node scripts/usage-probe.cjs usage <uid>                      # show
 *   node scripts/usage-probe.cjs usage <uid> reset                # reset this month
 *   node scripts/usage-probe.cjs user <uid> delete                # farewell
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CJS admin script, run with plain node */
const fs = require("fs");

const FROM_ENV = /^FIREBASE_SERVICE_ACCOUNT=(.*)$/m.exec(fs.readFileSync(".env.local", "utf8"))?.[1] ?? "";
const serviceAccount = JSON.parse(FROM_ENV.trim());
const [, , cmd, uid, arg] = process.argv;

(async () => {
  const appMod = await import("firebase-admin/app");
  const authMod = await import("firebase-admin/auth");
  const fsMod = await import("firebase-admin/firestore");
  appMod.initializeApp({ credential: appMod.cert(serviceAccount), projectId: serviceAccount.project_id });
  const db = fsMod.getFirestore();
  const period = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();

  if (cmd === "plan") {
    await db.collection("users").doc(uid).set({ plan: arg === "premium" ? "premium" : "free" }, { merge: true });
    console.log(`users/${uid}.plan := ${arg}`);
  } else if (cmd === "usage") {
    if (!arg) {
      const snap = await db.collection("usage").doc(uid).get();
      console.log(snap.exists ? JSON.stringify(snap.data()) : "no usage doc");
    } else if (arg === "reset") {
      await db.collection("usage").doc(uid).delete();
      console.log(`usage/${uid} deleted (fresh ${period})`);
    }
  } else if (cmd === "user" && arg === "delete") {
    await db.collection("users").doc(uid).delete();
    await db.collection("usage").doc(uid).delete();
    await authMod.getAuth().deleteUser(uid);
    console.log(`deleted ${uid} (auth + docs)`);
  } else {
    console.log("usage: node scripts/usage-probe.cjs plan <uid> free|premium | usage <uid> [reset] | user <uid> delete");
    process.exit(2);
  }
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
