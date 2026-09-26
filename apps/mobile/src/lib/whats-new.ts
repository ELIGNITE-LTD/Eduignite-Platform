/**
 * What to tell someone after their app has updated itself.
 *
 * Two things go in the message. The release notes, which come from the
 * platform and describe what actually changed, and a short list of what this
 * person can do with the app they now have - written for the account that is
 * signed in, because what matters to a bursar is not what matters to a parent.
 *
 * The list describes what the app can do, not what is new in it. That
 * distinction is deliberate: a version whose notes we do not have should still
 * say something true, rather than dress up old features as new ones.
 */

export type WhatsNew = {
  title: string;
  /** The person's own place in the school, used to pick the list. */
  audience: string;
  canNowDo: string[];
};

const BURSAR = [
  "Record a fee payment with no connection at all, and print the receipt there and then.",
  "See every payment still waiting to reach the server, and send them yourself when the signal returns.",
  "Watch the fee ledger update as payments are recorded, so you can see at a glance who still owes.",
  "Print receipts, fee statements and collection reports on the school's official layout.",
];

const ADMIN = [
  "Run the office offline: student records, staff records, registers and marks are all kept on the device until the connection returns.",
  "Record fees and print receipts without waiting for the network.",
  "Download rosters, class lists, mark sheets and report cards on the official school layout.",
  "See what work is still held on a device, and what the server has refused, instead of wondering whether it arrived.",
];

const TEACHER = [
  "Mark the register in a classroom with no signal; it sends itself when the school is back online.",
  "Enter marks and exam results offline.",
  "Open your classes, students and timetable from the last time the app was online.",
  "Print report cards on the official school layout.",
];

const FAMILY = [
  "Check fees, results, attendance and announcements even with no connection, from the last time the app was online.",
  "See receipts for what has been paid.",
];

const EVERYONE = [
  "Keep working when the connection drops. What you record is saved on the device and sent as soon as the network returns.",
  "See when something is still waiting to be sent, rather than having to guess.",
];

/** What this account can do, in its own words. */
export function capabilitiesFor(role?: string | null): WhatsNew {
  const key = String(role || "").toUpperCase();

  if (key === "BURSAR") {
    return { title: "What you can do now", audience: "As the bursar", canNowDo: BURSAR };
  }
  if (key === "SCHOOL_ADMIN" || key === "SUB_ADMIN" || key === "PRINCIPAL") {
    return { title: "What you can do now", audience: "As an administrator", canNowDo: ADMIN };
  }
  if (key === "TEACHER" || key === "HOD") {
    return { title: "What you can do now", audience: "As a teacher", canNowDo: TEACHER };
  }
  if (key === "STUDENT" || key === "PARENT") {
    return {
      title: "What you can do now",
      audience: key === "PARENT" ? "As a parent" : "As a student",
      canNowDo: FAMILY,
    };
  }

  return { title: "What you can do now", audience: "In this version", canNowDo: EVERYONE };
}

/**
 * Where the "you have already seen this version" mark is kept.
 *
 * Kept per account, so two people sharing one device each get told once, and
 * a member of staff signing in on a colleague's phone is not silently treated
 * as having read it.
 */
export function seenVersionKey(userId?: string | null): string {
  return `eduignite_last_seen_version:${userId || "anonymous"}`;
}
