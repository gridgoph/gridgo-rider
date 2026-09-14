import {act,renderHook,waitFor} from "@testing-library/react-native";
import {useClerkSessionBridge} from "@/hooks/useClerkSessionBridge";
import {useSession,releaseClerkAdoptionBlock,isClerkAdoptionBlocked} from "@/store/session";
import * as api from "@/lib/api";
const mockToken=jest.fn(async()=>"token");const mockSignOut=jest.fn(async()=>{});
const mockClaims={sid:"dual-session",gridgoRole:"client"};
const mockUser={publicMetadata:{gridgoRole:"client"}};
let mockSignedIn = true;
jest.mock("@clerk/expo",()=>({useAuth:()=>({isLoaded:true,isSignedIn:mockSignedIn,getToken:mockToken,sessionClaims:mockClaims}),useClerk:()=>({signOut:mockSignOut}),useUser:()=>({isLoaded:true,user:mockUser})}));
it("uses API membership even when the Clerk primary role is client",async()=>{
  releaseClerkAdoptionBlock();useSession.setState({user:null,authSource:null,needsApplication:false,loading:false});
  jest.spyOn(api,"me").mockResolvedValue({id:"dual",role:"rider",name:"Dual",email:"dual@test",verificationStatus:"approved"});
  const view=await renderHook(()=>useClerkSessionBridge());
  await waitFor(()=>expect(useSession.getState().user?.id).toBe("dual"));
  expect(mockSignOut).not.toHaveBeenCalled();
  await view.unmount();jest.restoreAllMocks();api.setTokenProvider(null);
});

it("ends only the original Clerk session even when domain logout stalls", async () => {
  jest.useFakeTimers();
  releaseClerkAdoptionBlock();
  mockClaims.sid = "old-session";
  mockSignOut.mockClear();
  useSession.setState({ user: null, authSource: null, needsApplication: false, loading: false });
  jest.spyOn(api, "me").mockResolvedValue({ id: "old-rider", role: "rider", name: "Rider", email: "rider@test" });
  let finish!: () => void;
  jest.spyOn(api, "logout").mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await renderHook(() => useClerkSessionBridge());
  let logout!: Promise<void>;
  await act(async () => { logout = useSession.getState().logout(); });
  mockClaims.sid = "new-session";
  await view.rerender({});
  await act(async () => { await jest.advanceTimersByTimeAsync(4_000); await logout; });
  expect(mockSignOut).toHaveBeenCalledWith({ sessionId: "old-session" });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await Promise.resolve(); });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  await view.unmount();
  mockClaims.sid = "dual-session";
  jest.restoreAllMocks();
  api.setTokenProvider(null);
  jest.useRealTimers();
});

it("keeps a revoked rider at login while Clerk sign-out completes", async () => {
  releaseClerkAdoptionBlock();
  mockSignOut.mockClear();
  useSession.setState({ user: null, authSource: null, needsApplication: false, loading: false });
  const me = jest.spyOn(api, "me").mockResolvedValueOnce({
    id: "revoked-rider", role: "rider", name: "Rider", email: "rider@test",
  }).mockRejectedValue(new api.ApiError(403, "forbidden"));
  let finish!: () => void;
  mockSignOut.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const view = await renderHook(() => useClerkSessionBridge());
  try {
    await waitFor(() => expect(useSession.getState().authSource).toBe("clerk"));
    await act(async () => { await useSession.getState().refreshUser(); });
    await view.rerender({});
    expect(isClerkAdoptionBlocked()).toBe(true);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ sessionId: "dual-session" });
    expect(me).toHaveBeenCalledTimes(2);
    expect(await api.resolveBearer()).toBeNull();
    expect(useSession.getState()).toMatchObject({
      user: null, authSource: null, loading: false, needsApplication: false,
      error: "This account no longer has rider access.", showErrorOnLogin: true,
    });
    await act(async () => { finish(); mockSignedIn = false; });
    await view.rerender({});
    expect(isClerkAdoptionBlocked()).toBe(false);
    expect(useSession.getState()).toMatchObject({
      needsApplication: false,
      error: "This account no longer has rider access.", showErrorOnLogin: true,
    });
    expect(me).toHaveBeenCalledTimes(2);
  } finally {
    finish?.();
    await view.unmount();
    mockSignedIn = true;
    releaseClerkAdoptionBlock();
    jest.restoreAllMocks();
    api.setTokenProvider(null);
  }
});
