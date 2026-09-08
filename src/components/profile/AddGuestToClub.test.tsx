// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { AddGuestToClub } from "./AddGuestToClub";
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
async function click(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text);
  expect(button).toBeTruthy();
  await act(async () => { button!.click(); });
}
describe('Add guest confirmation', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => root.render(<AddGuestToClub clubId="club-one" userId="guest-one" name="Alex" />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  it('requires confirmation and sends only the selected profile identity', async () => {
    await click('Add to club');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Alex');
    fetchMock.mockResolvedValue({ ok: true });
    await click('Add player');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/clubs/club-one/guests/guest-one', { method: 'POST' });
    expect(container.textContent).toContain('Added to club');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('cancels without changing membership', async () => {
    await click('Add to club'); await click('Cancel');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps the confirmation open and allows retry after a failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Please try again' }) });
    await click('Add to club'); await click('Add player');
    expect(document.body.textContent).toContain('Please try again');
    fetchMock.mockResolvedValue({ ok: true });
    await click('Add player');
    expect(container.textContent).toContain('Added to club');
  });
});
