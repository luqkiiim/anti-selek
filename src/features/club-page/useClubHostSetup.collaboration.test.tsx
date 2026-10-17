// @vitest-environment jsdom
import {act,useEffect} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {ClubPageMember} from "@/components/club/clubTypes";
import {PlayerGender,SessionCollabFormat,SessionPool} from "@/types/enums";
import {useClubHostSetup} from "./useClubHostSetup";
let root:Root,container:HTMLDivElement,setup:ReturnType<typeof useClubHostSetup>;
const fetchMock=vi.fn(),push=vi.fn();
const members=[{id:"home-player",name:"Home player",gender:PlayerGender.MALE,preferredPool:SessionPool.B,profileClubId:"home",communityBadges:[{id:"home",name:"Home"}]}] as ClubPageMember[];
const setError=vi.fn(),setSuccess=vi.fn(),refreshClubData=vi.fn(async()=>{}),router={push};
function Harness(){const next=useClubHostSetup({clubId:"home",router,selectablePlayers:members,mixedModeLabel:"Mixed",setError,setSuccess,refreshClubData});useEffect(()=>{setup=next;});return null;}
beforeEach(async()=>{vi.clearAllMocks();(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;globalThis.fetch=fetchMock;fetchMock.mockResolvedValue(new Response(JSON.stringify({code:"NEW"}),{status:200}));container=document.createElement("div");document.body.append(container);root=createRoot(container);await act(async()=>root.render(<Harness/>));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
it("keeps entered setup and host selections when an advanced user chooses a partner, without reading the visiting roster",async()=>{
  await act(async()=>{setup.setNewSessionName("Advanced Friday");setup.setCourtCount(3);setup.togglePlayerSelection("home-player");});
  await act(async()=>setup.selectPartnerClub({id:"visitors",name:"Visitors",membersCount:10}));
  expect(setup.newSessionName).toBe("Advanced Friday");expect(setup.courtCount).toBe(3);expect(setup.selectedPlayerIds).toEqual(["home-player"]);expect(setup.selectablePlayers).toEqual(members);
  await act(async()=>setup.setCollabFormat(SessionCollabFormat.INTERCLUB));
  await act(async()=>setup.createSession());
  const request=fetchMock.mock.calls.find(([url])=>url==="/api/sessions");
  expect(JSON.parse(request![1].body)).toMatchObject({name:"Advanced Friday",courtCount:3,collaborationVersion:2,partnerClubId:"visitors",schedulingMode:"FREE_PLAY",ratingMode:"UNRATED",playerIds:["home-player"],playerConfigs:[{profileClubId:"home",representingClubId:"home"}]});
  expect(fetchMock.mock.calls.some(([url])=>String(url).includes("collab-roster"))).toBe(false);
});
