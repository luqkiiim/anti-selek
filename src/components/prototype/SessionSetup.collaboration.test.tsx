// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {SessionSetup} from "./SessionSetup";

describe("Partner setup",()=>{
let root:Root,container:HTMLDivElement;
const created=vi.fn(),fetchMock=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;globalThis.fetch=fetchMock;fetchMock.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes("collab-candidates")?[{id:"visitors",name:"Visitors Club",membersCount:12}]:{code:"NEW"}),{status:200}));container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
async function input(field:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(field,value);field.dispatchEvent(new Event("input",{bubbles:true}));});}
it("retains the session name through club search and creates an empty unrated lineup draft",async()=>{await act(async()=>root.render(<SessionSetup clubId="home" members={[]} onCreated={created}/>));await input(container.querySelector(".setup-name input")!,"Friday rivals");await input(container.querySelector('input[type="search"]')!,"Vis");await act(async()=>{await vi.advanceTimersByTimeAsync(301);});await act(async()=>Array.from(container.querySelectorAll("button")).find(button=>button.textContent?.includes("Visitors Club"))?.click());await act(async()=>container.querySelector<HTMLInputElement>('input[name="collab-format"][type="radio"]:not(:checked)')?.click());await act(async()=>Array.from(container.querySelectorAll<HTMLInputElement>('input[name="scheduling"]')).find(field=>field.parentElement?.textContent==="Lineup")?.click());expect((container.querySelector(".setup-name input") as HTMLInputElement).value).toBe("Friday rivals");await act(async()=>container.querySelector("form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));const call=fetchMock.mock.calls.find(([url])=>url==="/api/sessions");expect(JSON.parse(call![1].body)).toMatchObject({name:"Friday rivals",partnerClubId:"visitors",collaborationVersion:2,collabFormat:"INTERCLUB",schedulingMode:"LINEUP",scoringFormat:"SINGLE_GAME",ratingMode:"UNRATED",playerIds:[]});expect(fetchMock.mock.calls.some(([url])=>String(url).includes("collab-roster"))).toBe(false);expect(created).toHaveBeenCalledWith("NEW");});
});
