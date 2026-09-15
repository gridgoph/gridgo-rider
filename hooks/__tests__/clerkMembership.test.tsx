import {act,renderHook,waitFor} from "@testing-library/react-native";
import {useClerkSessionBridge} from "@/hooks/useClerkSessionBridge";
import {CLERK_JOIN_TIMEOUT_MS, riderAuthHold} from "@/lib/authGate";
import {completeGoogleSso} from "@/lib/googleSso";
import {useSession,releaseClerkAdoptionBlock,isClerkAdoptionBlocked} from "@/store/session";
import * as api from "@/lib/api";
const mockToken=jest.fn(async()=>"token");const mockSignOut=jest.fn(async()=>{});
const mockClaims={sid:"dual-session",gridgoRole:"client"};
let mockUser: { publicMetadata: { gridgoRole: string } } | null = {publicMetadata:{gridgoRole:"client"}};
let mockUserLoaded = true;
let mockSignedIn = true;
jest.mock("@clerk/expo",()=>({useAuth:()=>({isLoaded:true,isSignedIn:mockSignedIn,getToken:mockToken,sessionClaims:mockClaims}),useClerk:()=>({signOut:mockSignOut}),useUser:()=>({isLoaded:mockUserLoaded,user:mockUser})}));
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

it.each([true, false])("does not let the join deadline interrupt logout (adoption settled: %s)", async (settled) => {
  jest.useFakeTimers();
  releaseClerkAdoptionBlock();
  mockSignOut.mockClear();
  useSession.setState({
    user: null, authSource: null, needsApplication: false, loading: false,
    sessionWait: null, error: null, showErrorOnLogin: false,
  });
  const me = jest.spyOn(api, "me");
  if (settled) me.mockResolvedValue({ id: "rider", role: "rider", name: "Rider", email: "rider@test" });
  else me.mockReturnValue(new Promise(() => {}));
  let finishLogout!: () => void;
  jest.spyOn(api, "logout").mockReturnValue(new Promise<void>((resolve) => { finishLogout = resolve; }));
  const view = await renderHook(() => useClerkSessionBridge());
  try {
    expect(useSession.getState().user?.id ?? null).toBe(settled ? "rider" : null);
    await act(async () => { await jest.advanceTimersByTimeAsync(CLERK_JOIN_TIMEOUT_MS - 2_000); });
    let logout!: Promise<void>;
    await act(async () => { logout = useSession.getState().logout(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(2_000); });

    expect(useSession.getState()).toMatchObject({
      user: null, sessionWait: "out", error: null, showErrorOnLogin: false,
    });
    expect(mockSignOut).not.toHaveBeenCalled();

    await act(async () => { await jest.advanceTimersByTimeAsync(2_000); await logout; });
    expect(useSession.getState()).toMatchObject({ sessionWait: null, error: null, showErrorOnLogin: false });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ sessionId: "dual-session" });
  } finally {
    await act(async () => { finishLogout(); });
    await view.unmount();
    releaseClerkAdoptionBlock();
    jest.restoreAllMocks();
    api.setTokenProvider(null);
    jest.useRealTimers();
  }
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

it("adopts a signed-in Clerk session before user metadata arrives", async () => {
  const previousUser = mockUser;
  const previousLoaded = mockUserLoaded;
  mockUser = null;
  mockUserLoaded = false;
  releaseClerkAdoptionBlock();
  useSession.setState({
    user: null, authSource: null, needsApplication: false, loading: false, sessionWait: null,
  });
  jest.spyOn(api, "me").mockResolvedValue({
    id: "dual", role: "rider", name: "Dual", email: "dual@test", verificationStatus: "approved",
  });
  const view = await renderHook(() => useClerkSessionBridge());
  try {
    await waitFor(() => expect(useSession.getState().user?.id).toBe("dual"));
    expect(view.result.current).toBe(true);
    expect(useSession.getState().sessionWait).toBeNull();
  } finally {
    await view.unmount();
    mockUser = previousUser;
    mockUserLoaded = previousLoaded;
    jest.restoreAllMocks();
    api.setTokenProvider(null);
  }
});

it("does not keep Signing you in when a signed-in adopt never sees a Clerk user", async () => {
  const previousUser = mockUser;
  const previousLoaded = mockUserLoaded;
  mockUser = null;
  mockUserLoaded = false;
  jest.useFakeTimers();
  releaseClerkAdoptionBlock();
  mockSignOut.mockClear();
  useSession.setState({
    user: null, authSource: null, needsApplication: false, loading: false,
    sessionWait: null, error: null, showErrorOnLogin: false,
  });
  jest.spyOn(api, "me").mockReturnValue(new Promise(() => {}));
  const view = await renderHook(() => useClerkSessionBridge());
  try {
    expect(useSession.getState().sessionWait).toBe("in");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CLERK_JOIN_TIMEOUT_MS);
    });
    expect(useSession.getState().sessionWait).not.toBe("in");
    expect(useSession.getState().loading).toBe(false);
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().showErrorOnLogin).toBe(true);
    expect(useSession.getState().error).toBeTruthy();
    expect(view.result.current).toBe(true);
  } finally {
    await view.unmount();
    mockUser = previousUser;
    mockUserLoaded = previousLoaded;
    mockSignedIn = true;
    releaseClerkAdoptionBlock();
    jest.restoreAllMocks();
    api.setTokenProvider(null);
    jest.useRealTimers();
  }
});

it("does not keep Signing you in after an unassigned Clerk identity is adopted", async () => {
  const previousUser = mockUser;
  const previousLoaded = mockUserLoaded;
  mockUser = null;
  mockUserLoaded = false;
  releaseClerkAdoptionBlock();
  useSession.setState({
    user: null, authSource: null, needsApplication: false, loading: false, sessionWait: null,
  });
  jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, "unauthorized"));
  const view = await renderHook(() => useClerkSessionBridge());
  try {
    await waitFor(() => expect(useSession.getState().needsApplication).toBe(true));
    expect(useSession.getState().sessionWait).not.toBe("in");
    expect(useSession.getState().showErrorOnLogin).toBe(false);
    expect(view.result.current).toBe(true);
  } finally {
    await view.unmount();
    mockUser = previousUser;
    mockUserLoaded = previousLoaded;
    jest.restoreAllMocks();
    api.setTokenProvider(null);
  }
});

it.each(["network", "wrong-role", "timeout"])("keeps Google retry out of a settled %s wait when Clerk sign-out fails", async (failure) => {
  jest.useFakeTimers();
  releaseClerkAdoptionBlock();
  mockSignOut.mockReset().mockRejectedValue(new Error("Sign-out failed"));
  useSession.setState({
    user: null, authSource: null, needsApplication: false, loading: false,
    sessionWait: null, error: null, showErrorOnLogin: false,
  });
  const me = jest.spyOn(api, "me");
  if (failure === "network") me.mockRejectedValue(new Error("Offline"));
  else if (failure === "wrong-role") me.mockResolvedValue({ id: "client", role: "client", name: "Client", email: "client@test" });
  else me.mockReturnValue(new Promise(() => {}));
  const view = await renderHook(() => useClerkSessionBridge());
  try {
    await act(async () => { await jest.advanceTimersByTimeAsync(CLERK_JOIN_TIMEOUT_MS); });
    expect(useSession.getState().showErrorOnLogin).toBe(true);
    if (failure === "wrong-role") expect(useSession.getState().error).toContain("This is a client account.");
    expect(mockSignOut).toHaveBeenCalled();
    await act(async () => {
      useSession.getState().clearError();
      const outcome = await completeGoogleSso({
        alreadySignedIn: mockSignedIn,
        startSSOFlow: jest.fn(),
        setActive: jest.fn(),
      });
      expect(outcome.status).toBe("already_signed_in");
      useSession.getState().beginSessionWait("in");
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(CLERK_JOIN_TIMEOUT_MS); });
    const state = useSession.getState();
    expect(state.sessionWait).toBeNull();
    expect(state.loading).toBe(false);
    expect(me).toHaveBeenCalledTimes(1);
    expect(view.result.current).toBe(true);
    expect(riderAuthHold({
      hasUser: Boolean(state.user), sessionWait: state.sessionWait, loading: state.loading,
      clerkLoaded: true, clerkSignedIn: true, googleReturn: true,
    })).toBeNull();
  } finally {
    await view.unmount();
    releaseClerkAdoptionBlock();
    mockSignOut.mockReset().mockResolvedValue(undefined);
    jest.restoreAllMocks();
    api.setTokenProvider(null);
    jest.useRealTimers();
  }
});

it("lets enrollment supersede a pending adoption deadline", async () => {
  jest.useFakeTimers();
  releaseClerkAdoptionBlock();
  mockSignOut.mockClear();
  useSession.setState({
    user: null, authSource: null, needsApplication: false, loading: false,
    sessionWait: null, error: null, showErrorOnLogin: false,
  });
  const rider: api.User = { id: "new-rider", role: "rider", name: "Rider", email: "rider@test" };
  let finishProbe!: (user: api.User) => void;
  let finishEnrollment!: (user: api.User) => void;
  jest.spyOn(api, "me").mockReturnValue(new Promise((resolve) => { finishProbe = resolve; }));
  jest.spyOn(api, "enrollRider").mockReturnValue(new Promise((resolve) => { finishEnrollment = resolve; }));
  const view = await renderHook(() => useClerkSessionBridge());
  try {
    let enrollment!: Promise<boolean>;
    await act(async () => {
      enrollment = useSession.getState().enrollRider({
        profile: {
          phone: "09171234567", vehicleType: "motorcycle",
          plateNumber: "ABC 1234", licenseNumber: "N01-23-456789",
        },
      }, "enrollment-deadline-test");
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(CLERK_JOIN_TIMEOUT_MS); });
    expect(useSession.getState()).toMatchObject({ user: null, loading: true, error: null, showErrorOnLogin: false });
    expect(await api.resolveBearer()).toBe("token");
    expect(mockSignOut).not.toHaveBeenCalled();
    await act(async () => {
      finishEnrollment(rider);
      await expect(enrollment).resolves.toBe(true);
      finishProbe(rider);
    });
    expect(useSession.getState()).toMatchObject({ user: rider, authSource: "clerk", sessionWait: null });
    expect(mockSignOut).not.toHaveBeenCalled();
  } finally {
    await view.unmount();
    jest.restoreAllMocks();
    api.setTokenProvider(null);
    jest.useRealTimers();
  }
});
