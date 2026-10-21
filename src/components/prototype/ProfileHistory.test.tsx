// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProfileHistory } from "./ProfileHistory";
vi.mock("./Primitives",()=>({Sheet:({open,children}:{open:boolean;children:ReactNode})=>open?<div role="dialog">{children}</div>:null}));
it("opens and pages already loaded sessions without requesting another profile",async()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const fetchSpy=vi.fn();vi.stubGlobal("fetch",fetchSpy);
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  const onOpen=vi.fn();
  const sessions=Array.from({length:23},(_,i)=>({id:`s${i}`,code:`code${i}`,name:`Session ${i}`,date:null,matches:1,wins:1,losses:0,pointDifferential:6,ratingChange:8,winRate:100}));
  const click=async(label:string)=>act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent===label)!.click());
  try{
    await act(async()=>root.render(<ProfileHistory sessions={sessions} onOpen={onOpen}/>));
    await click("View history");
    expect(container.querySelectorAll('[role="dialog"] .profile-history-row')).toHaveLength(10);
    await click("Load more");await click("Load more");
    expect(container.querySelectorAll('[role="dialog"] .profile-history-row')).toHaveLength(23);
    await act(async()=>Array.from(container.querySelectorAll('[role="dialog"] button')).at(-1)!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(onOpen).toHaveBeenCalledWith(sessions.at(-1));
    expect(fetchSpy).not.toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
