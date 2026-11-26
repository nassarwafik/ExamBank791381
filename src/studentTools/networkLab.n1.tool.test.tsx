// @vitest-environment happy-dom
// N1 — «مختبر الشبكات» through its UI and the book's tool bar:
//   • the books 791381, 791381s and 791283 offer it (the course sets) and the tool bar opens it in its own lazy chunk;
//   • the learner builds a network with the buttons and the cable form, configures two PCs through the simulator's real Desktop, and a
//     ping from the Command Prompt succeeds — its path is announced; the cable list shows the cables;
//   • a BOOK keeps the network as a draft in this browser and a new tool reads it back; an EXAM page keeps no draft;
//   • «افتح ملفًا» refuses a broken file with a message; «افتح مثالًا» opens an example; deleting a device asks first.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import NetworkLabTool from "./NetworkLabTool";
import StudentToolDock from "./StudentToolDock";
import { courseStudentTools } from "./courseTools";
import { parseLab } from "./networkLab";

const KEY = "eb.networkLab.draft.v1";
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

const lab = () => screen.getByTestId("network-lab");
const click = async (el: HTMLElement) => { fireEvent.click(el); await tick(); };
const button = (name: string | RegExp, root: HTMLElement = lab()) => within(root).getByRole("button", { name });
const select = async (name: string, value: string) => { fireEvent.change(within(lab()).getByRole("combobox", { name }), { target: { value } }); await tick(); };
async function openDevice(name: RegExp) {
  await click(within(within(lab()).getByTestId("network-lab-devices")).getByRole("button", { name }));
  return within(lab()).getByTestId("network-lab-device");
}
async function setIp(name: RegExp, address: string) {
  const panel = await openDevice(name);
  await click(within(panel).getByRole("button", { name: /IP Configuration/ }));
  const ipc = within(panel).getByTestId("net2-ipconfig");
  fireEvent.change(within(ipc).getByLabelText("IP Address"), { target: { value: address } });
  fireEvent.change(within(ipc).getByLabelText("Subnet Mask"), { target: { value: "255.255.255.0" } });
  await click(within(ipc).getByRole("button", { name: /حفظ/ }));
}

describe("the books offer it", () => {
  it("791381, 791381s and 791283 list the network lab; the tool bar opens it", async () => {
    for (const c of ["791381", "791381s", "791283"]) expect(courseStudentTools(c)!.tools.some(t => t.id === "networkLab"), c).toBe(true);
    render(<StudentToolDock studentTools={courseStudentTools("791283")} labHandoff />);
    await click(screen.getByTestId("student-tools-button"));
    await click(screen.getByRole("button", { name: "مختبر الشبكات" }));
    expect(await screen.findByTestId("network-lab", {}, { timeout: 4000 })).toBeTruthy();
    expect(within(screen.getByTestId("tool-panel-networkLab")).getByTestId("tool-fullscreen")).toBeTruthy();
    expect(screen.getByTestId("network-lab-draft").textContent).toMatch(/مسودة/);
  });
  it("an exam page (no book) keeps no draft", async () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "networkLab" }] }} />);
    await click(screen.getByTestId("student-tools-button"));
    await click(screen.getByRole("button", { name: "مختبر الشبكات" }));
    await screen.findByTestId("network-lab", {}, { timeout: 4000 });
    expect(screen.queryByTestId("network-lab-draft")).toBeNull();
    await click(button("+ حاسوب"));
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("building and testing a network", () => {
  it("two PCs on a switch: cables, addresses through the real Desktop, a ping that succeeds; the draft follows", async () => {
    render(<NetworkLabTool draftKey={KEY} />);
    expect(within(lab()).getByText(/ابدأ بإضافة الأجهزة/)).toBeTruthy();
    await click(button("+ سويتش")); await click(button("+ حاسوب")); await click(button("+ حاسوب"));
    expect(within(lab()).getByTestId("network-lab-diagram")).toBeTruthy();
    for (const [pc, port] of [["pc1", "f0/1"], ["pc2", "f0/2"]]) {
      await select("من الجهاز", "sw1"); await select("منفذ الجهاز الأول", port);
      await select("إلى الجهاز", pc); await select("منفذ الجهاز الثاني", "eth0");
      await click(button("صِل"));
    }
    expect(within(lab()).getByTestId("network-lab-links").querySelectorAll("li").length).toBe(2);
    await setIp(/^PC1/, "192.168.5.1");
    await setIp(/^PC2/, "192.168.5.2");
    const pc1 = await openDevice(/^PC1/);
    await click(within(pc1).getByRole("button", { name: /Command Prompt/ }));
    const cmd = within(pc1).getByTestId("net2-cmd");
    fireEvent.change(within(cmd).getByRole("textbox"), { target: { value: "ping 192.168.5.2" } });
    await click(within(cmd).getByRole("button", { name: "تنفيذ" }));
    expect(within(cmd).getByTestId("ncli-screen").textContent).toMatch(/Reply from 192\.168\.5\.2/);
    expect(within(lab()).getByTestId("network-lab-flow").textContent).toMatch(/^نجح ping من PC1/);
    // the draft holds exactly this network, and a new tool opens it
    const draft = parseLab(localStorage.getItem(KEY));
    expect(draft.ok && draft.lab.config.devices.length).toBe(3);
    expect(draft.ok && draft.lab.actions.length).toBe(3);
    cleanup();
    render(<NetworkLabTool draftKey={KEY} />);
    expect(within(within(lab()).getByTestId("network-lab-devices")).getAllByRole("button").length).toBe(3);
  });
  it("deleting a device asks first; an example opens; a broken file is refused with a message", async () => {
    render(<NetworkLabTool draftKey={KEY} />);
    await click(button("+ راوتر"));
    await openDevice(/^R1/);
    await click(button("احذف الجهاز"));
    await click(button(/تأكيد حذف R1/));
    expect(within(lab()).getByText(/ابدأ بإضافة الأجهزة/)).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();                            // an empty network leaves no draft
    fireEvent.change(within(lab()).getByTestId("network-lab-example"), { target: { value: "roas" } }); await tick();
    expect(within(lab()).getByTestId("network-lab-notice").textContent).toMatch(/Router-on-a-Stick/);
    expect(within(within(lab()).getByTestId("network-lab-devices")).getAllByRole("button").length).toBe(6);
    const file = new File(["{\"format\":\"other\"}"], "x.json", { type: "application/json" });
    fireEvent.change(within(lab()).getByTestId("network-lab-file"), { target: { files: [file] } }); await tick(30);
    expect(within(lab()).getByTestId("network-lab-notice").textContent).toMatch(/ليس ملف شبكة/);
    expect(within(within(lab()).getByTestId("network-lab-devices")).getAllByRole("button").length).toBe(6);   // the network stays
  });
});
