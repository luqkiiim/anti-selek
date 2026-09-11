// @vitest-environment jsdom
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({status:'authenticated',replace:vi.fn()}));
vi.mock('next-auth/react',()=>({useSession:()=>({status:mocks.status,data:{user:{id:'me',name:'Real Player'}}}),signOut:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:mocks.replace})}));
vi.mock('@phosphor-icons/react',()=>Object.fromEntries(['UsersThree','UserCircle','CalendarBlank','CaretRight','ArrowLeft','ArrowUp','GearSix','Trophy','Plus','MagnifyingGlass','LinkSimple','PencilSimple','Check','DotsThree','House','ChartBar','Minus','Pause','Play','Clock','SignOut','X'].map(name=>[name,()=>null])));
vi.mock('next/image',()=>({default:()=>null}));
import Page from './page';
let container:HTMLDivElement;let root:Root;
const club={id:'club',name:'Real Club',role:'ADMIN',viewerIsOwner:true,membersCount:4};
const fetcher=vi.fn(async(url:string)=>({ok:true,json:async()=>url==='/api/clubs'?[club]:url.startsWith('/api/users/')?{user:{name:'Real Player',elo:1234,avatarUrl:null},recentSessions:[],matchHistory:[{id:'match',result:'WIN'}],achievements:[{title:'Backend achievement must not render'}]}:{club,viewer:{id:'me',name:'Real Player'},clubMembers:[{id:'me',name:'Real Player',elo:1234}],sessions:[],claimRequests:[]}}));
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});mocks.status='authenticated';localStorage.clear();vi.stubGlobal('fetch',fetcher);container=document.createElement('div');document.body.append(container);root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();vi.clearAllMocks()});
async function render(){await act(async()=>{root.render(<Page/>);await new Promise(r=>setTimeout(r,20))});}
async function click(label:string){const button=Array.from(container.querySelectorAll('button')).find(b=>b.textContent===label);expect(button).toBeTruthy();await act(async()=>{button!.click();await new Promise(r=>setTimeout(r,20))})}
it('loads the real club in a native browser shell without a device simulator',async()=>{await render();expect(container.textContent).toContain('Real Club');expect(container.querySelector('.prototype-root')).toBeTruthy();expect(container.textContent).not.toContain('iPhone');expect(container.querySelectorAll('nav button')).toHaveLength(3)});
it('uses real profile results but leaves achievements as an explicit preview',async()=>{await render();await click('Profile');expect(container.textContent).toContain('1234');expect(container.textContent).toContain('Last 1 matches');expect(container.textContent).toContain('Achievement preview');expect(container.textContent).not.toContain('Backend achievement must not render')});
it('redirects unauthenticated visitors to sign-in',async()=>{mocks.status='unauthenticated';await render();expect(mocks.replace).toHaveBeenCalledWith('/signin?callbackUrl=%2F')});
