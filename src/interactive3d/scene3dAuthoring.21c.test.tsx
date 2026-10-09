// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import Scene3DEditor from "./Scene3DEditor";
import { scene3DPreset } from "./scenePresets";
import { validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1 } from "./sceneSpec";

afterEach(cleanup);

function Host(){
  const [scene,setScene]=useState<Interactive3DSceneSpecV1>(()=>scene3DPreset("cube","authoring-scene"));
  return <><Scene3DEditor scene={scene} onChange={setScene} preview={false}/><output data-testid="scene-state">{JSON.stringify(scene)}</output></>;
}
const state=()=>JSON.parse(screen.getByTestId("scene-state").textContent||"{}") as Interactive3DSceneSpecV1;

describe("21C teacher scene authoring — arbitrary semantic targets",()=>{
  it("a newly added object gets a selectable object target, then the teacher can add a geometry target",()=>{
    render(<Host/>);
    const before=state();
    fireEvent.click(screen.getByRole("button",{name:"إضافة مجسم"}));
    const afterObject=state();
    expect(afterObject.objects).toHaveLength(before.objects.length+1);
    expect(afterObject.targets).toHaveLength(before.targets.length+1);
    const added=afterObject.objects.at(-1)!;
    expect(afterObject.targets.at(-1)).toMatchObject({kind:"object",objectId:added.id,label:added.label});

    fireEvent.click(screen.getByRole("button",{name:"إضافة هدف"}));
    const afterTarget=state();
    expect(afterTarget.targets).toHaveLength(afterObject.targets.length+1);
    expect(afterTarget.targets.at(-1)).toMatchObject({objectId:added.id,kind:"face",element:"front"});
    expect(validateInteractive3DSceneSpec(afterTarget).ok).toBe(true);
  });

  it("changing a primitive kind prunes now-invalid face/edge/vertex targets but preserves its object target",()=>{
    render(<Host/>);
    fireEvent.click(screen.getByRole("button",{name:"إضافة مجسم"}));
    fireEvent.click(screen.getByRole("button",{name:"إضافة هدف"}));
    let s=state(),added=s.objects.at(-1)!;
    expect(s.targets.some(t=>t.objectId===added.id&&t.kind==="face")).toBe(true);

    const rows=document.querySelectorAll(".i3d-object-row");
    const last=rows[rows.length-1] as HTMLElement;
    fireEvent.change(within(last).getByLabelText("النوع"),{target:{value:"sphere"}});
    s=state();
    added=s.objects.at(-1)!;
    expect(added.kind).toBe("sphere");
    expect(s.targets.filter(t=>t.objectId===added.id).map(t=>t.kind)).toEqual(["object"]);
    expect(validateInteractive3DSceneSpec(s).ok).toBe(true);
  });

  it("cannot create two target IDs for the same physical binding through the structured editor",()=>{
    render(<Host/>);
    fireEvent.click(screen.getByRole("button",{name:"إضافة مجسم"}));
    fireEvent.click(screen.getByRole("button",{name:"إضافة هدف"}));
    const first=state().targets.at(-1)!;
    const targetRows=document.querySelectorAll(".i3d-target-row");
    const row=targetRows[targetRows.length-1] as HTMLElement;
    const element=within(row).getByLabelText("العنصر") as HTMLSelectElement;
    expect(element.value).toBe(first.element);
    const disabled=[...element.options].filter(o=>o.disabled).map(o=>o.value);
    expect(disabled).not.toContain(first.element);
    expect(validateInteractive3DSceneSpec(state()).ok).toBe(true);
  });
});
