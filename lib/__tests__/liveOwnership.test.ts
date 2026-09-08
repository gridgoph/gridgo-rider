import * as api from "@/lib/api";
import { setLiveOwner } from "@/lib/live";
it("rejects an old identity response before data adoption or 401 session handling", async () => {
  let finish: (response: Response) => void = () => {};
  const fetch=jest.spyOn(global,"fetch").mockImplementation(() => new Promise(resolve=>{finish=resolve;}));
  const unauthorized=jest.fn(); api.setUnauthorizedHandler(unauthorized);api.setToken("old");
  setLiveOwner("old");
  const request=api.listNotifications();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  setLiveOwner("new");
  finish({ok:false,status:401,text:async()=>JSON.stringify({error:"old-token"})} as Response);
  await expect(request).rejects.toThrow("account changed");
  expect(unauthorized).not.toHaveBeenCalled();
  fetch.mockRestore();api.setUnauthorizedHandler(null);setLiveOwner(null);
});

it("acknowledges only the supplied IDs through the deployed owner PATCH route", async () => {
  const fetch=jest.spyOn(global,"fetch").mockResolvedValue({ok:true,status:200,text:async()=>"{}"} as Response);
  api.setTokenProvider(null);api.setToken("owner");
  await api.markNotificationsRead(["a", "b"]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/notifications/a"), expect.objectContaining({method:"PATCH",body:JSON.stringify({read:true})}));
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/notifications/b"), expect.objectContaining({method:"PATCH",body:JSON.stringify({read:true})}));
  fetch.mockRestore();api.setToken(null);
});

it("detaches with the captured old bearer after UI logout without clearing a new identity", async () => {
  let issued:(token:string)=>void=()=>{};
  api.setTokenProvider(()=>new Promise(resolve=>{issued=resolve;}));
  const captured=api.captureLogoutBearer();
  await Promise.resolve();
  api.setTokenProvider(null);api.setToken("new-owner");setLiveOwner("new-owner");
  const fetch=jest.spyOn(global,"fetch").mockResolvedValue({ok:true,status:200} as Response);
  const logout=api.logout("old-device",captured);
  issued("old-owner");await logout;
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/logout"),expect.objectContaining({headers:expect.objectContaining({Authorization:"Bearer old-owner"}),body:JSON.stringify({deviceToken:"old-device"})}));
  expect(api.getToken()).toBe("new-owner");
  fetch.mockRestore();api.setToken(null);setLiveOwner(null);
});

it.each(["token","body"])("releases the refresh pipeline if %s never settles",async(stage)=>{
  jest.useFakeTimers();api.setTokenProvider(stage==="token"?()=>new Promise(()=>{}):null);api.setToken("owner");
  const fetch=jest.spyOn(global,"fetch").mockResolvedValue({ok:true,status:200,text:()=>new Promise(()=>{})} as Response);
  const result=api.listNotifications();const rejected=expect(result).rejects.toThrow("did not answer in time");
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  await jest.advanceTimersByTimeAsync(20_001);await rejected;
  fetch.mockRestore();api.setTokenProvider(null);api.setToken(null);jest.useRealTimers();
});
