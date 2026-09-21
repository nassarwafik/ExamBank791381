// @vitest-environment happy-dom
// Batch 5 — SOURCE-FIDELITY + MOTION-SEMANTICS regressions. Renders the actual components and asserts what each SVG
// DOES and does NOT contain, with special focus on the three owner-requested backlog visuals (CIDR PDF41, broadcast
// message structure PDF74, OSI seven layers PDF78) and the m18/m03 roadmap visuals.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import CidrPrefix from "./791381/batch5/CidrPrefix";
import BroadcastMessageStructure from "./791381/batch5/BroadcastMessageStructure";
import OsiSevenLayers from "./791381/batch5/OsiSevenLayers";
import EncapsulationStack from "./791381/batch5/EncapsulationStack";
import PduAnatomy from "./791381/batch5/PduAnatomy";
import CliInterface from "./791381/batch5/CliInterface";
import CliModeLadder from "./791381/batch5/CliModeLadder";
import SwitchPortsMap from "./791381/batch5/SwitchPortsMap";
import SviInterface from "./791381/batch5/SviInterface";
import VlanSegmentation from "./791381/batch5/VlanSegmentation";
import VlanAccessTrunkTerms from "./791381/batch5/VlanAccessTrunkTerms";
import VlanExampleTopology from "./791381/batch5/VlanExampleTopology";
import CreateVlan from "./791381/batch5/CreateVlan";
import AccessPortToVlan from "./791381/batch5/AccessPortToVlan";
import SviGateway from "./791381/batch5/SviGateway";
import TaggedUntaggedNative from "./791381/batch5/TaggedUntaggedNative";

afterEach(cleanup);
const text = (n: Element) => n.textContent || "";
const anim = (r: Element, id: string) => r.querySelector(`animateMotion[id="${id}"]`);
const byId = (r: Element, id: string) => r.querySelector(`[id="${id}"]`);

// ── backlog #1 — CIDR (site 35 / PDF 41) ──
describe("Batch 5 — cidr-prefix (PDF 41): /8 /16 /24, masks, whole octets only", () => {
  it("renders /8, /16, /24 with the exact masks and network-bit counts; /24 marks 24 network bits (3 octets)", () => {
    const { container } = render(<CidrPrefix ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const p of ["/8", "/16", "/24"]) expect(t).toContain(p);
    for (const m of ["255.0.0.0", "255.255.0.0", "255.255.255.0"]) expect(t).toContain(m);
    // /24 row = 3 network octets = 24 bits
    const row24 = container.querySelector('[data-cidr="24"]')!;
    expect(row24.querySelectorAll(".eb-visual-octet.is-network").length).toBe(3);
    expect(t).toContain("24 بت");
  });
  it("stays at the book's level: no /25+, no VLSM, no block-size / borrowed-bit content", () => {
    const { container } = render(<CidrPrefix ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const banned of ["/25", "/26", "/30", "VLSM", "block size", "borrow"]) expect(t).not.toContain(banned);
  });
});

// ── backlog #2 — Broadcast message structure (site 67 / PDF 74) ──
describe("Batch 5 — broadcast-message-structure (PDF 74): dest MAC all-F, source fixed, local delivery", () => {
  it("shows the destination MAC FF:FF:FF:FF:FF:FF and keeps the SOURCE fields unchanged", () => {
    const { container } = render(<BroadcastMessageStructure ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect(t).toContain("FF:FF:FF:FF:FF:FF");
    expect(t).toContain("192.168.1.10");        // source IP unchanged
    expect(t).toContain("A0:02:AF:2D:10:22");   // source MAC unchanged
    expect(container.querySelector('[data-bcast="1"]')).not.toBeNull();
  });
  it("delivers to all local devices and shows a router boundary the broadcast does not cross", () => {
    const { container } = render(<BroadcastMessageStructure ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-recv="1"]').length).toBe(3);   // all devices in the domain
    expect(container.querySelector('[data-boundary="1"]')).not.toBeNull();
    expect(text(container)).toContain("Broadcast Domain واحد");
  });
  it("motion is causal: delivery begins only after the destination MAC becomes all-F", () => {
    const { container } = render(<BroadcastMessageStructure ariaLabel="x" reducedMotion={false} />);
    const change = byId(container, "bcChange")!, deliver = anim(container, "bcDeliver")!;
    expect(change).not.toBeNull(); expect(deliver).not.toBeNull();
    expect(deliver.getAttribute("begin")).toBe("bcChange.end");
  });
  it("is a clean one-shot: the unicast stage does NOT restart, so no stale unicap/FF flip on a second cycle", () => {
    const { container } = render(<BroadcastMessageStructure ariaLabel="x" reducedMotion={false} />);
    const uni = byId(container, "bcUni")!;
    expect(uni.getAttribute("begin")).not.toContain(".end");   // begins at 0s only — never restarts from bcDeliver.end
    expect(uni.getAttribute("fill")).toBe("freeze");           // fades out once and stays gone
  });
});

// ── backlog #3 — OSI seven layers (site 70 / PDF 78) ──
describe("Batch 5 — osi-seven-layers (PDF 78): exact 7→1 stack, send then receive", () => {
  it("renders the exact seven layers, top 7 Application down to bottom 1 Physical", () => {
    const { container } = render(<OsiSevenLayers ariaLabel="x" reducedMotion={true} />);
    const order = [...container.querySelectorAll("[data-layer]")].map(g => g.getAttribute("data-layer"));
    expect(order).toEqual(["7", "6", "5", "4", "3", "2", "1"]);   // never reversed
    const t = text(container);
    for (const name of ["Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical"]) expect(t).toContain(name);
  });
  it("motion is causal: RECEIVE (1→7) begins only after SEND (7→1) completes, then repeats", () => {
    const { container } = render(<OsiSevenLayers ariaLabel="x" reducedMotion={false} />);
    const send = anim(container, "osiSend")!, recv = anim(container, "osiRecv")!;
    expect(recv.getAttribute("begin")).toBe("osiSend.end");
    expect(send.getAttribute("begin")).toContain("osiRecv.end");
    // send goes DOWN (y increases), receive goes UP (y decreases)
    const sp = send.getAttribute("path")!, rp = recv.getAttribute("path")!;
    const sy = sp.match(/M \d+ (\d+) L \d+ (\d+)/)!; expect(Number(sy[2])).toBeGreaterThan(Number(sy[1]));
    const ry = rp.match(/M \d+ (\d+) L \d+ (\d+)/)!; expect(Number(ry[2])).toBeLessThan(Number(ry[1]));
  });
  it("does not leak the TCP/IP four-layer mapping into this stack", () => {
    const { container } = render(<OsiSevenLayers ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect(t).not.toContain("Internet");    // a TCP/IP layer name
    expect(t).not.toContain("4 طبقات");
  });
});

// ── m18 encapsulation (PDF 116) ──
describe("Batch 5 — encapsulation-stack (PDF 116): wrappers added in order", () => {
  it("shows Data + the three named wrappers, added Segment → Packet → Frame (each after the previous)", () => {
    const { container } = render(<EncapsulationStack ariaLabel="x" reducedMotion={false} />);
    const t = text(container);
    for (const n of ["Data", "Segment", "Packet", "Frame"]) expect(t).toContain(n);
    const seg = byId(container, "encSegment")!, pkt = byId(container, "encPacket")!, frm = byId(container, "encFrame")!;
    expect(pkt.getAttribute("begin")).toBe("encSegment.end");
    expect(frm.getAttribute("begin")).toBe("encPacket.end");
    // ONE-SHOT: the innermost wrapper does NOT restart from the outer wrapper's end, so cycle 2 never begins with all
    // wrappers already frozen present; it stops in the complete nested state.
    expect(seg.getAttribute("begin")).not.toContain(".end");
    for (const a of [seg, pkt, frm]) expect(a.getAttribute("fill")).toBe("freeze");
  });
});

// ── m18 PDU anatomy (PDF 117) ──
describe("Batch 5 — pdu-anatomy (PDF 117): field families per unit", () => {
  it("shows Segment/Packet/Frame with ports, IP, MAC + error-check families (no header internals)", () => {
    const { container } = render(<PduAnatomy ariaLabel="x" reducedMotion={true} />);
    expect([...container.querySelectorAll("[data-pdu]")].map(g => g.getAttribute("data-pdu"))).toEqual(["Segment", "Packet", "Frame"]);
    const t = text(container);
    for (const f of ["منافذ", "IP", "MAC", "فحص الأخطاء"]) expect(t).toContain(f);
    for (const banned of ["EtherType", "CRC", "sequence", "byte"]) expect(t).not.toContain(banned);
  });
});

// ── m03 CLI ladder (PDF 121–122) ──
// ── m03 CLI interface (PDF 121) — generic CLI only, NO Cisco command syntax ──
describe("Batch 5 — cli-interface (PDF 121): generic CLI, no PDF-122 command leak", () => {
  it("names CLI and its source-supported categories, and shows NO real Cisco command or prompt", () => {
    const { container } = render(<CliInterface ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect(t).toContain("CLI = Command Line Interface");
    for (const cat of ["VLAN", "المنافذ", "كلمات المرور", "Trunk"]) expect(t).toContain(cat);
    // must NOT leak PDF 122 commands/prompts
    for (const leak of ["enable", "configure terminal", "vlan 10", "Switch#", "Switch(config)#", "Switch>"]) expect(t).not.toContain(leak);
  });
  it("motion writes the command lines one by one (one-shot, no restart)", () => {
    const { container } = render(<CliInterface ariaLabel="x" reducedMotion={false} />);
    const first = byId(container, "cliLine0")!;
    expect(first).not.toBeNull();
    expect(first.getAttribute("begin")).not.toContain(".end");   // one-shot start, not a restart from the last line
  });
});

describe("Batch 5 — cli-mode-ladder (PDF 122): exact 3-prompt ladder, command → prompt sequencing", () => {
  it("shows EXACTLY Switch> / Switch# / Switch(config)# — never Switch(config-vlan)#", () => {
    const { container } = render(<CliModeLadder ariaLabel="x" reducedMotion={true} />);
    const prompts = [...container.querySelectorAll("[data-prompt]")].map(p => text(p));
    expect(prompts).toEqual(["Switch>", "Switch#", "Switch(config)#"]);
    expect(text(container)).not.toContain("Switch(config-vlan)#");
    const t = text(container);
    for (const cmd of ["enable", "configure terminal", "vlan 10"]) expect(t).toContain(cmd);
    expect(t).not.toContain("config t");   // the book uses the full form
  });
  it("is causal: a prompt becomes active only AFTER the previous command (one-shot, no restart)", () => {
    const { container } = render(<CliModeLadder ariaLabel="x" reducedMotion={false} />);
    // prompt 1 (Switch#) activates on the enable command's end; prompt 2 on configure terminal's end
    expect(byId(container, "active1")!.getAttribute("begin")).toBe("cmd0.end");
    expect(byId(container, "active2")!.getAttribute("begin")).toBe("cmd1.end");
    // the first prompt does not restart from any later stage's end
    expect(byId(container, "active0")!.getAttribute("begin")).not.toContain(".end");
  });
});

// ── m03 switch ports (PDF 123–124) — port selection, NO command ──
describe("Batch 5 — switch-ports-map (PDF 123–124): named ports + port SELECTION (no command)", () => {
  it("labels F0/1, F0/24, G0/1, G0/2, highlights the selected port, and shows NO `interface f0/1` command", () => {
    const { container } = render(<SwitchPortsMap ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const p of ["F0/1", "F0/24", "G0/1", "G0/2"]) expect(t).toContain(p);
    expect(t).not.toContain("interface f0/1");   // future-command leak removed
    expect(container.querySelector('[data-selected="1"]')).not.toBeNull();
  });
  it("selection motion is one-shot (no restart from the highlight's end)", () => {
    const { container } = render(<SwitchPortsMap ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "portLabel")!.getAttribute("begin")).not.toContain(".end");
  });
});

// ── m03 VLAN segmentation (PDF 125/127) ──
describe("Batch 5 — vlan-segmentation (PDF 125/127): one switch, two logical VLANs, traffic stays in", () => {
  it("shows VLAN 10 الإدارة and VLAN 20 المحاسبة on one switch, with a flow per VLAN", () => {
    const { container } = render(<VlanSegmentation ariaLabel="x" reducedMotion={false} />);
    expect([...container.querySelectorAll("[data-vlan]")].map(g => g.getAttribute("data-vlan")).sort()).toEqual(["10", "20"]);
    const t = text(container);
    expect(t).toContain("VLAN 10 · الإدارة");
    expect(t).toContain("VLAN 20 · المحاسبة");
    expect(container.querySelector('[data-flow="10"]')).not.toBeNull();
    expect(container.querySelector('[data-flow="20"]')).not.toBeNull();
  });
});

// ── m03 access/trunk terms (PDF 126) ──
describe("Batch 5 — vlan-access-trunk-terms (PDF 126): access one VLAN vs trunk many", () => {
  it("distinguishes a trunk (multiple VLANs, one cable) from access links (one VLAN each)", () => {
    const { container } = render(<VlanAccessTrunkTerms ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelector('[data-trunk="1"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-access]").length).toBe(2);
    const t = text(container);
    expect(t).toContain("Access = جهاز في VLAN واحدة · Trunk = عدة VLAN بين السويتشات");
  });
});

// ── m03 example topology (PDF 128–129) ──
describe("Batch 5 — vlan-example-topology (PDF 128–129): exact devices, IPs, VLANs", () => {
  it("uses the page's own devices and addresses (Pc1/2-ADMIN → VLAN10, Pc1/2-GAZ → VLAN20)", () => {
    const { container } = render(<VlanExampleTopology ariaLabel="x" reducedMotion={true} />);
    const devs = [...container.querySelectorAll("[data-dev]")].map(g => g.getAttribute("data-dev"));
    expect(devs.sort()).toEqual(["Pc1-ADMIN", "Pc1-GAZ", "Pc2-ADMIN", "Pc2-GAZ"]);
    const t = text(container);
    for (const v of ["192.168.10.1", "192.168.10.2", "192.168.20.1", "192.168.20.2"]) expect(t).toContain(v);
    expect(t).toContain("VLAN 10 · الإدارة");
    expect(t).toContain("VLAN 20 · المحاسبة");
  });
});

// ── m03 create VLAN (PDF 130) ──
describe("Batch 5 — create-vlan (PDF 130): VLAN appears after its command", () => {
  it("creates VLAN 10·MNG and VLAN 20·GAZ, each only after its command runs", () => {
    const { container } = render(<CreateVlan ariaLabel="x" reducedMotion={false} />);
    const created = [...container.querySelectorAll("[data-created]")].map(g => g.getAttribute("data-created"));
    expect(created).toEqual(["VLAN 10", "VLAN 20"]);
    const t = text(container);
    for (const s of ["vlan 10", "name MNG", "vlan 20", "name GAZ"]) expect(t).toContain(s);
    // VLAN box reveal begins on its own command's end (causal)
    expect(byId(container, "vl0")!.getAttribute("begin")).toBe("mk0.end");
    expect(byId(container, "vl1")!.getAttribute("begin")).toBe("mk1.end");
    // ONE-SHOT: command 1 does not restart from command 2's end, so cycle 2 never begins with both VLANs already present
    expect(byId(container, "mk0")!.getAttribute("begin")).not.toContain(".end");
    for (const id of ["mk0", "mk1", "vl0", "vl1"]) expect(byId(container, id)!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m03 access port → VLAN (PDF 131/132/138) ──
describe("Batch 5 — access-port-to-vlan (PDF 131/132/138): member only after assignment", () => {
  it("shows the three exact steps and the device joining VLAN 10 only after the last step", () => {
    const { container } = render(<AccessPortToVlan ariaLabel="x" reducedMotion={false} />);
    const t = text(container);
    for (const s of ["interface f0/1", "switchport mode access", "switchport access vlan 10"]) expect(t).toContain(s);
    expect(container.querySelector('[data-member="1"]')).not.toBeNull();
    expect(byId(container, "apJoin")!.getAttribute("begin")).toBe("ap2.end");
    // one-shot: the first step does not restart from a later stage's end
    expect(byId(container, "ap0")!.getAttribute("begin")).not.toContain(".end");
    // membership is a frozen final state (fill=freeze), not a fade-out
    expect(byId(container, "apJoin")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m03 SVI interface (PDF 133) — logical interface only, NO gateway leak ──
describe("Batch 5 — svi-interface (PDF 133): logical SVI, no gateway leak", () => {
  it("shows interface vlan 10 with 192.168.10.254, marks it logical, and shows NO Gateway / other-networks content", () => {
    const { container } = render(<SviInterface ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelector('[data-svi="1"]')).not.toBeNull();
    const t = text(container);
    expect(t).toContain("interface vlan 10");
    expect(t).toContain("192.168.10.254");
    expect(t).toContain("no shutdown");
    expect(t).toContain("افتراضية");                 // logical
    for (const leak of ["Gateway", "شبكات أخرى", "192.168.1.254"]) expect(t).not.toContain(leak);
  });
  it("builds the SVI one command at a time (one-shot, no restart)", () => {
    const { container } = render(<SviInterface ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "svi0")!.getAttribute("begin")).not.toContain(".end");
  });
});

// ── m03 SVI gateway (PDF 134) — gateway exit, 192.168.1.254 ──
describe("Batch 5 — svi-gateway (PDF 134): Default Gateway exit to other networks", () => {
  it("shows the Gateway concept with 192.168.1.254 and the exit to other networks; not the PDF-133 SVI address", () => {
    const { container } = render(<SviGateway ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelector('[data-gateway="1"]')).not.toBeNull();
    const t = text(container);
    expect(t).toContain("Gateway");
    expect(t).toContain("192.168.1.254");
    expect(t).toContain("الشبكات الأخرى");
    expect(t).not.toContain("192.168.10.254");       // that is the PDF-133 SVI example, not the gateway value
  });
});

// ── m03 tagged/untagged/native (PDF 135–137) ──
describe("Batch 5 — tagged-untagged-native (PDF 135–137): tag state per case", () => {
  it("shows a Trunk carrying tagged VLAN 10/20 frames and a Native (99) frame with no tag", () => {
    const { container } = render(<TaggedUntaggedNative ariaLabel="x" reducedMotion={false} />);
    expect(container.querySelector('[data-trunk="1"]')).not.toBeNull();
    const frames = [...container.querySelectorAll("[data-frame]")].map(g => g.getAttribute("data-frame"));
    expect(frames.sort()).toEqual(["nat", "t10", "t20"]);
    const t = text(container);
    expect(t).toContain("VLAN 99");   // the native VLAN example number
    expect(t).toContain("Native: VLAN 99 تعبر Trunk بلا Tag");
    expect(t).toContain("Tag 10");
    expect(t).toContain("Tag 20");
  });
});

// ── cross-cutting: reduced motion removes ALL SMIL animation from every batch-5 visual ──
describe("Batch 5 — reduced motion drops all motion; motion-on renders some", () => {
  const COMPS = [CidrPrefix, BroadcastMessageStructure, OsiSevenLayers, EncapsulationStack, PduAnatomy, CliInterface,
    CliModeLadder, SwitchPortsMap, SviInterface, VlanSegmentation, VlanAccessTrunkTerms, VlanExampleTopology,
    CreateVlan, AccessPortToVlan, SviGateway, TaggedUntaggedNative];
  it("no <animateMotion>, no <animate>, and a valid still svg[role=img] for each", () => {
    for (const Comp of COMPS) {
      const { container } = render(<Comp ariaLabel="x" reducedMotion={true} />);
      expect(container.querySelectorAll("animateMotion").length, Comp.name).toBe(0);
      expect(container.querySelectorAll("animate").length, Comp.name).toBe(0);
      expect(container.querySelector('svg[role="img"]'), Comp.name).not.toBeNull();
      cleanup();
    }
  });
  it("with motion on, each renders at least one motion marker", () => {
    for (const Comp of COMPS) {
      const { container } = render(<Comp ariaLabel="x" reducedMotion={false} />);
      expect(container.querySelectorAll("animateMotion, animate").length, Comp.name).toBeGreaterThan(0);
      cleanup();
    }
  });
});
