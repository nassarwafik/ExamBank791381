// @vitest-environment happy-dom
// Batch 3 — SOURCE-FIDELITY + MOTION-SEMANTICS regressions (beyond page placement). These render the actual visuals
// and assert what the SVG DOES and does NOT contain, so a later edit that leaks a future page's content or breaks the
// destination-matching motion / layer numbering is caught here.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import P2pDirect from "./791381/batch3/P2pDirect";
import UtpVsStp from "./791381/batch3/UtpVsStp";
import ProtocolAgreement from "./791381/batch3/ProtocolAgreement";
import TcpIpLayers from "./791381/batch3/TcpIpLayers";
import OsiVsTcpIp from "./791381/batch3/OsiVsTcpIp";
import MessageTypes from "./791381/batch3/MessageTypes";
import UnicastMulticast from "./791381/batch3/UnicastMulticast";
import PingEcho from "./791381/batch3/PingEcho";
import ArpAssociation from "./791381/batch3/ArpAssociation";
import TcpVsUdp from "./791381/batch3/TcpVsUdp";

afterEach(cleanup);
const text = (node: Element) => node.textContent || "";
const motions = (root: Element, sel = "") => root.querySelectorAll(`${sel} animateMotion`).length;
const anim = (root: Element, id: string) => root.querySelector(`animateMotion[id="${id}"]`);

describe("Batch 3 — PDF58 P2P is source-accurate (no later-page topologies)", () => {
  it("shows P2P/direct only and NEVER Bus/Ring/Star/Tree/Hybrid", () => {
    const { container } = render(<P2pDirect ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect(t).toContain("P2P");
    for (const later of ["Bus", "Ring", "Star", "Tree", "Hybrid"]) expect(t).not.toContain(later);
  });
});

describe("Batch 3 — PDF62 cable visual is UTP-vs-STP only (no PDF63 cables)", () => {
  it("shows UTP and STP but NEVER Fiber/Coaxial (or their Arabic names)", () => {
    const { container } = render(<UtpVsStp ariaLabel="x" reducedMotion={false} />);
    const t = text(container);
    expect(t).toContain("UTP");
    expect(t).toContain("STP");
    for (const later of ["Fiber", "Coaxial", "ألياف", "محوري"]) expect(t).not.toContain(later);
  });
});

describe("Batch 3 — PDF87 protocol visual teaches the IDEA (no future protocol names)", () => {
  it("shows the agreed-rules concept but NEVER specific later-page protocol names", () => {
    const { container } = render(<ProtocolAgreement ariaLabel="x" reducedMotion={false} />);
    const t = text(container);
    expect(t).toMatch(/بروتوكول|قواعد/);
    for (const name of ["HTTP", "HTTPS", "DNS", "DHCP", "SMTP", "IMAP", "FTP", "TFTP", "SSH", "Telnet"]) expect(t).not.toContain(name);
  });
});

describe("Batch 3 — TCP/IP layer numbering (PDF82) is exactly 4/3/2/1 with 'Link'", () => {
  it("renders 4 Application · 3 Transport · 2 Internet · 1 Link, never 'Network Access'", () => {
    const { container } = render(<TcpIpLayers ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect(t).toContain("4. Application");
    expect(t).toContain("3. Transport");
    expect(t).toContain("2. Internet");
    expect(t).toContain("1. Link");
    expect(t).not.toContain("Network Access");
  });
});

describe("Batch 3 — OSI/TCP-IP numbering (PDF83) OSI 7→1, TCP/IP 4→1 with 'Link'", () => {
  it("renders OSI 7..1 and TCP/IP 4..1 with the exact terms, never 'Network Access'", () => {
    const { container } = render(<OsiVsTcpIp ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    // OSI side
    expect(t).toContain("7. Application");
    expect(t).toContain("6. Presentation");
    expect(t).toContain("5. Session");
    expect(t).toContain("2. Data Link");
    expect(t).toContain("1. Physical");
    // TCP/IP side
    expect(t).toContain("4. Application");
    expect(t).toContain("3. Transport");
    expect(t).toContain("2. Internet");
    expect(t).toContain("1. Link");
    expect(t).not.toContain("Network Access");
  });
});

describe("Batch 3 — MessageTypes motion reaches EVERY destination of each type", () => {
  it("animates Unicast→1, Multicast→2 (the selected group), Broadcast→4", () => {
    const { container } = render(<MessageTypes ariaLabel="x" reducedMotion={false} />);
    expect(motions(container, '[data-row="Unicast"]')).toBe(1);
    expect(motions(container, '[data-row="Multicast"]')).toBe(2);
    expect(motions(container, '[data-row="Broadcast"]')).toBe(4);
  });
  it("has ZERO motion elements under reduced motion", () => {
    const { container } = render(<MessageTypes ariaLabel="x" reducedMotion={true} />);
    expect(motions(container)).toBe(0);
  });
});

describe("Batch 3 — UnicastMulticast motion reaches the whole selected group", () => {
  it("animates Unicast→1 target and Multicast→2 selected members (excluded member gets none)", () => {
    const { container } = render(<UnicastMulticast ariaLabel="x" reducedMotion={false} />);
    expect(motions(container, '[data-panel="unicast"]')).toBe(1);
    expect(motions(container, '[data-panel="multicast"]')).toBe(2);
    expect(motions(container)).toBe(3); // no stray packet to the excluded member
  });
  it("has ZERO motion elements under reduced motion", () => {
    const { container } = render(<UnicastMulticast ariaLabel="x" reducedMotion={true} />);
    expect(motions(container)).toBe(0);
  });
});

describe("Batch 3 — request/response round trips are SEQUENCED (arrival before response)", () => {
  it("Ping: reply begins only when the request animation ENDS, and the cycle repeats after the reply", () => {
    const { container } = render(<PingEcho ariaLabel="x" reducedMotion={false} />);
    const req = anim(container, "pingReq")!, rep = anim(container, "pingRep")!;
    expect(req).not.toBeNull();
    expect(rep.getAttribute("begin")).toBe("pingReq.end");        // reply starts exactly when the request arrives
    expect(req.getAttribute("begin")).toContain("pingRep.end");   // next request waits for the reply (bounded cycle)
    expect(req.getAttribute("dur")).toBe(rep.getAttribute("dur")); // symmetric legs
  });
  it("Ping: reducedMotion=true has ZERO animateMotion", () => {
    const { container } = render(<PingEcho ariaLabel="x" reducedMotion={true} />);
    expect(motions(container)).toBe(0);
  });

  it("ARP: the MAC response begins only when the query animation ENDS, and the cycle repeats after the response", () => {
    const { container } = render(<ArpAssociation ariaLabel="x" reducedMotion={false} />);
    const q = anim(container, "arpQuery")!, r = anim(container, "arpReply")!;
    expect(q).not.toBeNull();
    expect(r.getAttribute("begin")).toBe("arpQuery.end");
    expect(q.getAttribute("begin")).toContain("arpReply.end");
    expect(q.getAttribute("dur")).toBe(r.getAttribute("dur"));
  });
  it("ARP: reducedMotion=true has ZERO animateMotion", () => {
    const { container } = render(<ArpAssociation ariaLabel="x" reducedMotion={true} />);
    expect(motions(container)).toBe(0);
  });

  it("TCP: the ACK begins only when the data animation ENDS (send→receive→acknowledge); UDP is unchanged", () => {
    const { container } = render(<TcpVsUdp ariaLabel="x" reducedMotion={false} />);
    const data = anim(container, "tcpData")!, ack = anim(container, "tcpAck")!;
    expect(data).not.toBeNull();
    expect(ack.getAttribute("begin")).toBe("tcpData.end");
    expect(data.getAttribute("begin")).toContain("tcpAck.end");
    // UDP unchanged: three independent, non-acknowledged packets staggered at 0s / 0.6s / 1.2s
    const udp = [...container.querySelectorAll('[data-mt="udp"] animateMotion')].map(a => a.getAttribute("begin"));
    expect(udp).toEqual(["0s", "0.6s", "1.2s"]);
  });
  it("TCP/UDP: reducedMotion=true has ZERO animateMotion", () => {
    const { container } = render(<TcpVsUdp ariaLabel="x" reducedMotion={true} />);
    expect(motions(container)).toBe(0);
  });
});

describe("Batch 3 — TCP/IP layer 1 uses the book's Arabic term", () => {
  it("renders «الربط» for Link, not «الوصول للشبكة»", () => {
    const { container } = render(<TcpIpLayers ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect(t).toContain("الربط");
    expect(t).not.toContain("الوصول للشبكة");
  });
});
