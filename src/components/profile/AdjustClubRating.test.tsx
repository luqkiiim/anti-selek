// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { AdjustClubRating } from "./AdjustClubRating";
let root: Root; let container: HTMLDivElement;
const fetchMock = vi.fn(); const changed = vi.fn();
async function click(text: string) { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text); expect(b).toBeTruthy(); await act(async () => b!.click()); }
describe('rating adjustment panel', () => {
 beforeEach(async () => { fetchMock.mockReset(); changed.mockReset(); vi.stubGlobal('fetch', fetchMock); container=document.createElement('div'); document.body.append(container); root=createRoot(container); await act(async () => root.render(<AdjustClubRating clubId="club" userId="player" name="Alex" onChanged={changed} />)); });
 afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
 const history = [{ id:'log', beforeElo:1000, afterElo:1125, reason:'Correction', actorName:'Admin', createdAt:'2026-09-08T00:00:00.000Z' }];
 it('loads current data only when opened and restores through an explicit new adjustment', async () => {
   expect(fetchMock).not.toHaveBeenCalled(); fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({rating:1125,history})}); await click('Adjust rating');
   expect(document.body.textContent).toContain('Current rating: 1125'); expect(document.querySelector('details')?.open).toBe(false);
   expect(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save adjustment')?.disabled).toBe(true);
   await click('Use previous rating'); expect(fetchMock).toHaveBeenCalledTimes(1);
   fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({rating:1000})}); await click('Save adjustment');
   const body=JSON.parse(fetchMock.mock.calls[1][1].body); expect(body).toEqual({rating:1000,expectedRating:1125,reason:expect.stringContaining('Restore previous rating')}); expect(changed).toHaveBeenCalledOnce();
 });
 it('cancels without saving', async () => { fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({rating:1125,history})}); await click('Adjust rating'); await click('Cancel'); expect(fetchMock).toHaveBeenCalledTimes(1); expect(changed).not.toHaveBeenCalled(); });
 it('disables save after a failed load', async () => { fetchMock.mockResolvedValueOnce({ok:false,json:async()=>({error:'Could not load rating'})}); await click('Adjust rating'); expect(document.body.textContent).toContain('Could not load rating'); expect(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save adjustment')?.disabled).toBe(true); });
});
