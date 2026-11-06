// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import type {Match} from "@/components/session/sessionTypes";
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock("./api",async()=>({...await vi.importActual<typeof import("./api")>("./api"),api:mocks.api}));
import {SeriesScoreEditor} from "./SeriesScoreEditor";
import {ApiError} from "./api";
describe("Best of three entry",()=>{
let root:Root,container:HTMLDivElement;
const refresh=vi.fn(async()=>{});
const match={id:"match",status:"IN_PROGRESS",scoringFormat:"BEST_OF_THREE",scoreRevision:2,gameScoresJson:'[{"team1Score":21,"team2Score":18}]'} as Match;
beforeEach(()=>{vi.clearAllMocks();(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement("div");document.body.append(container);root=createRoot(container);mocks.api.mockResolvedValue({});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(value=match){await act(async()=>root.render(<SeriesScoreEditor match={value} canEdit onSaved={refresh}/>));}
async function click(label:string){await act(async()=>Array.from(container.querySelectorAll("button")).find(button=>button.textContent===label)?.click());}
async function input(label:string,value:string){const field=container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(field,value);field.dispatchEvent(new Event("input",{bubbles:true}));});}
it("shows saved partial games and submits progress without finalizing",async()=>{await render();expect((container.querySelector("input") as HTMLInputElement).value).toBe("21");await click("Save progress");expect(mocks.api).toHaveBeenCalledWith("/api/matches/match/score","POST",{gameScores:[{team1Score:21,team2Score:18}],finalize:false,scoreRevision:2});});
it("preserves entered games and their original revision when another result arrives",async()=>{await render();await click("Add game");await input("Game 2 team 1 score","21");await input("Game 2 team 2 score","19");await render({...match,scoreRevision:3});await click("Finish match");expect(mocks.api).toHaveBeenCalledWith("/api/matches/match/score","POST",{gameScores:[{team1Score:21,team2Score:18},{team1Score:21,team2Score:19}],finalize:true,scoreRevision:2});});
it("preserves flexible whole-number game scores above two digits", async()=>{await render();await input("Game 1 team 1 score","121");await input("Game 1 team 2 score","119");await click("Add game");await input("Game 2 team 1 score","101");await input("Game 2 team 2 score","99");await click("Finish match");expect(mocks.api).toHaveBeenCalledWith("/api/matches/match/score","POST",{gameScores:[{team1Score:121,team2Score:119},{team1Score:101,team2Score:99}],finalize:true,scoreRevision:2});});
it("keeps an incomplete series editable and refreshes stale results",async()=>{await render();await click("Finish match");expect(mocks.api).not.toHaveBeenCalled();expect(container.textContent).toContain("Record a 2–0 or 2–1 result");mocks.api.mockRejectedValueOnce(new ApiError("Changed",409));await click("Save progress");expect(refresh).toHaveBeenCalledOnce();expect(container.textContent).toContain("Review the refreshed scores");});
});
