// Tadris+ P8-B2b — every test starts on a clean device: the table / view preferences one test chose (src/ui/devicePrefs.ts) must not
// reach the next test of the same file. Only this module's own keys are removed; nothing else in storage is touched.
import { beforeEach } from "vitest";
import { clearDevicePrefs } from "../ui/devicePrefs";

beforeEach(() => { clearDevicePrefs(); });
