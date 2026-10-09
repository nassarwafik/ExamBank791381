// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, screen, within, waitFor } from "@testing-library/react";
import type { StructuredExam } from "../examTypes";
import StructuredExamBuilder from "../StructuredExamBuilder";
import Surface3DLab from "./Surface3DLab";

afterEach(cleanup);
describe("21B isolated teacher laboratory", () => {
  it("supports the four mathematical presets and camera rotation", () => {
    render(<Surface3DLab onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "مختبر الدوال ثلاثية الأبعاد — تجريبي" });
    expect((within(dialog).getByRole("combobox", { name: "مثال ثلاثي الأبعاد" }) as HTMLSelectElement).options).toHaveLength(4);
    expect(document.body.querySelectorAll("svg polygon").length).toBeGreaterThan(0);
    const first = document.body.querySelector("svg polygon")?.getAttribute("points");
    fireEvent.click(within(dialog).getByRole("button", { name: "تدوير لليمين" }));
    expect(document.body.querySelector("svg polygon")?.getAttribute("points")).not.toBe(first);
    fireEvent.change(within(dialog).getByRole("combobox", { name: "مثال ثلاثي الأبعاد" }), { target: { value: "saddle" } });
    expect((within(dialog).getByRole("textbox", { name: "معادلة السطح" }) as HTMLInputElement).value).toBe("x^2-y^2");
  });
  it("refuses unsupported variables and out-of-bounds meshes", () => {
    render(<Surface3DLab onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByRole("textbox", { name: "معادلة السطح" });
    fireEvent.change(input, { target: { value: "x+z" } });
    expect(within(dialog).getByRole("alert").textContent).toContain("SURFACE_VARIABLE_INVALID");
    expect(document.body.querySelector("svg")).toBeNull();
    fireEvent.change(input, { target: { value: "x^2+y^2" } });
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "دقة الشبكة" }), { target: { value: "100" } });
    expect(within(dialog).getByRole("alert").textContent).toContain("SURFACE_NUMBER_INVALID");
  });
  it("opens from real exam builder and never saves or changes the exam", async () => {
    const e = { schemaVersion: 2, examId: "ex-21b-lab", title: "رياضيات", status: "draft",
      sections: [{ id: "s1", title: "رياضيات", gradingPolicy: "all", stimuli: {},
        questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "السؤال", marks: 2, answer: { text: "2" } }] }] } as StructuredExam;
    const onChange = vi.fn(), onSave = vi.fn();
    render(<StructuredExamBuilder exam={e} onChange={onChange} onSave={onSave} backupStorage={null} />);
    fireEvent.click(screen.getByRole("button", { name: /مختبر الدوال 3D/ }));
    const dialog = await screen.findByRole("dialog", { name: "مختبر الدوال ثلاثية الأبعاد — تجريبي" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "معادلة السطح" }), { target: { value: "sin(x)*cos(y)" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "تدوير لليمين" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق المختبر" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "مختبر الدوال ثلاثية الأبعاد — تجريبي" })).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
