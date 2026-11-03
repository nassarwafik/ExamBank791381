import { createContext } from "react";
import type { SchoolBadgeView } from "./schoolIdentity";

/** Tadris+ P4-C — the signed-in student's school badge, provided by App around the (lazy) student portal; null = none. */
export const SchoolBadgeContext = createContext<SchoolBadgeView | null>(null);
