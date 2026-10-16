import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {act,renderHook} from "@testing-library/react-native";
import {usePushNotifications} from "@/hooks/usePushNotifications";
import {useSession} from "@/store/session";
import {invalidate} from "@/lib/live";
import * as api from "@/lib/api";
let mockReady=false;
const mockPush=jest.fn();
const mockLast=jest.fn();
jest.mock("expo-router",()=>({useRouter:()=>({push:mockPush}),useRootNavigationState:()=>mockReady?{key:"root"}:undefined}));
jest.mock("expo-notifications",()=>({
  setNotificationHandler:jest.fn(),getLastNotificationResponseAsync:()=>mockLast(),clearLastNotificationResponseAsync:jest.fn(async()=>{}),
  addNotificationResponseReceivedListener:jest.fn(()=>({remove:jest.fn()})),addNotificationReceivedListener:jest.fn(()=>({remove:jest.fn()})),addPushTokenListener:jest.fn(()=>({remove:jest.fn()}))
}));
jest.mock("@/store/push",()=>({cancelDeviceRegistrations:jest.fn(),subscribePushTokenRotation:jest.fn(()=>()=>undefined),usePush:{getState:()=>({registerIfGranted:jest.fn(),adoptToken:jest.fn()})}}));
jest.mock("@/lib/api",()=>({...jest.requireActual("@/lib/api"),listNotifications:jest.fn(),getOrder:jest.fn(),readNotification:jest.fn()}));
const user={id:"owner",role:"rider" as const,name:"Owner",email:"owner@test",verificationStatus:"pending" as const};
const response={notification:{request:{identifier:"push_one",content:{data:{notificationId:"n",orderId:"o"}}}}};
beforeEach(()=>{
  jest.useFakeTimers();jest.clearAllMocks();mockReady=false;
  useSession.setState({user,loading:false,sessionWait:null});
  mockLast.mockResolvedValue(response);
  (api.listNotifications as jest.Mock).mockResolvedValue([{id:"n",userId:"owner",title:"Decision",orderId:"o"}]);
});
afterEach(()=>jest.useRealTimers());
it("waits for a real navigator then opens a pending applicant's authorized decision once",async()=>{
  const view=await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).not.toHaveBeenCalled();
  mockReady=true;await view.rerender(undefined);
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/active");
});
it("retains an offline tap and retries after reconnect",async()=>{
  mockReady=true;
  (api.listNotifications as jest.Mock).mockRejectedValueOnce(new Error("offline"));
  await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).not.toHaveBeenCalled();
  await act(async()=>{invalidate("*");});
  expect(mockPush).toHaveBeenCalledTimes(1);
});
it("routes an older notification absent from the inbox page to the authorized inbox",async()=>{
  mockReady=true;(api.listNotifications as jest.Mock).mockResolvedValue([]);
  await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).toHaveBeenCalledWith("/alerts");
});

it("waits for session hydration to finish after the navigator is ready",async()=>{
  mockReady=true;useSession.setState({loading:true});
  await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).not.toHaveBeenCalled();
  await act(async()=>{useSession.setState({loading:false});});
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).toHaveBeenCalledTimes(1);
});


it.each(["cold start", "background"])("opens the exact authorized offer from %s once", async (mode) => {
  mockReady = true;
  const offerResponse = {notification:{request:{identifier:"offer-tap",content:{data:{notificationId:"offer-notice",orderId:"untrusted",type:"announcement"}}}}};
  (api.listNotifications as jest.Mock).mockResolvedValue([{id:"offer-notice",orderId:"actual-job",type:"dispatch_available"}]);
  mockLast.mockResolvedValue(mode === "cold start" ? offerResponse : null);
  await renderHook(() => usePushNotifications());
  if (mode === "background") {
    const onTap = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)[0];
    await act(async () => { onTap(offerResponse); onTap(offerResponse); });
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/offers?orderId=actual-job");
});


const setOS=(os:string)=>Object.defineProperty(Platform,"OS",{value:os,configurable:true});
const initialOS=Platform.OS;
afterEach(()=>{setOS(initialOS);delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;});

it.each(["cold start", "background"])("opens release download while signed out from %s", async mode => {
  setOS("android");
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  useSession.setState({ user: null });
  const release = { notification: { request: { identifier: "release-tap", content: {
    title: "GRIDGO Rider 1.0.123 is ready", data: { type: "announcement" },
  } } } };
  mockLast.mockResolvedValue(mode === "cold start" ? release : null);
  const view = await renderHook(() => usePushNotifications());
  if (mode === "background") {
    const onTap = jest.requireMock("expo-notifications").addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    await act(async () => { onTap(release); onTap(release); });
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(open).toHaveBeenCalledWith("https://gridgo.talasora.com/downloads/gridgo-rider.apk");
  expect(open).toHaveBeenCalledTimes(1);
  expect(jest.requireMock("expo-notifications").clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
  await view.unmount();
  open.mockRestore();
});

const storeTap=(releaseChannel:string,storeTarget:string,title:string)=>({notification:{request:{identifier:`release-${releaseChannel}`,content:{
  title,data:{notificationId:`release-${releaseChannel}`,type:"announcement",releaseChannel,storeTarget},
}}}});

it.each([
  ["a Play install","android","play",storeTap("play","play_store","GRIDGO Rider 1.0.123 is on the Play Store"),"market://details?id=ph.gridgo.rider"],
  ["a TestFlight install","ios",undefined,storeTap("ios","testflight","GRIDGO Rider 1.0.123 is in TestFlight"),"itms-beta://"],
])("opens the store on %s, never the APK download",async(_label,os,distribution,tap,store)=>{
  setOS(os);
  if(distribution)process.env.EXPO_PUBLIC_APP_DISTRIBUTION=distribution;
  const open=jest.spyOn(Linking,"openURL").mockResolvedValue(undefined);
  mockLast.mockResolvedValue(tap);
  const view=await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(store);
  expect(mockPush).not.toHaveBeenCalled();
  await view.unmount();
  open.mockRestore();
});

it("falls back to the Play Store web page when the Play app does not take the link",async()=>{
  setOS("android");process.env.EXPO_PUBLIC_APP_DISTRIBUTION="play";
  const open=jest.spyOn(Linking,"openURL").mockRejectedValueOnce(new Error("no handler")).mockResolvedValue(undefined);
  mockLast.mockResolvedValue(storeTap("play","play_store","GRIDGO Rider 1.0.123 is on the Play Store"));
  const view=await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(open.mock.calls).toEqual([["market://details?id=ph.gridgo.rider"],["https://play.google.com/store/apps/details?id=ph.gridgo.rider"]]);
  await view.unmount();
  open.mockRestore();
});

it("never opens the APK download from an APK notice on a Play install",async()=>{
  setOS("android");process.env.EXPO_PUBLIC_APP_DISTRIBUTION="play";mockReady=true;
  const open=jest.spyOn(Linking,"openURL").mockResolvedValue(undefined);
  (api.listNotifications as jest.Mock).mockResolvedValue([]);
  mockLast.mockResolvedValue(storeTap("apk","apk_download","GRIDGO Rider 1.0.123 is ready"));
  const view=await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(open).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/alerts");
  await view.unmount();
  open.mockRestore();
});

const THREAD="0b9a1f2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
const supportTap=(identifier:string)=>({notification:{request:{identifier,content:{data:{notificationId:"support-notice",type:"support_message",at:"2026-10-14T01:00:00.000Z"}}}}});

it.each(["cold start", "background"])("opens the exact support thread from the owner's notification on %s", async (mode) => {
  mockReady = true;
  (api.readNotification as jest.Mock).mockResolvedValue({id:"support-notice",type:"support_message",threadId:THREAD,read:true});
  mockLast.mockResolvedValue(mode === "cold start" ? supportTap("cold") : null);
  await renderHook(() => usePushNotifications());
  if (mode === "background") {
    const onTap = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)[0];
    await act(async () => { onTap(supportTap("bg")); });
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(api.readNotification).toHaveBeenCalledWith("support-notice");
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith(`/chat/${THREAD}`);
});

it("opens one screen for one notification, even reported under two response ids", async () => {
  mockReady = true;
  (api.readNotification as jest.Mock).mockResolvedValue({id:"support-notice",type:"support_message",threadId:THREAD,read:true});
  mockLast.mockResolvedValue(supportTap("launch-id"));
  await renderHook(() => usePushNotifications());
  const onTap = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)[0];
  await act(async () => { onTap(supportTap("tray-id")); });
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("lands a deleted support notification on chat history and spends the launch tap", async () => {
  mockReady = true;
  (api.readNotification as jest.Mock).mockRejectedValue(new api.ApiError(404, {error:"notification_not_found"}));
  mockLast.mockResolvedValue(supportTap("gone"));
  await renderHook(() => usePushNotifications());
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(mockPush).toHaveBeenCalledWith("/chat");
  expect(jest.requireMock("expo-notifications").clearLastNotificationResponseAsync).toHaveBeenCalled();
});

it("opens chat history when the notification names no thread (older API)", async () => {
  mockReady = true;
  (api.readNotification as jest.Mock).mockResolvedValue({id:"support-notice",type:"support_message",read:true});
  mockLast.mockResolvedValue(supportTap("old"));
  await renderHook(() => usePushNotifications());
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(mockPush).toHaveBeenCalledWith("/chat");
});

it.each([
  ["delivery_message", "/trip/messages?orderId=job-1"],
  ["pickup_chat_message", "/trip/shop-messages?orderId=job-1"],
])("opens the %s conversation for the authorized order", async (type, route) => {
  mockReady = true;
  (api.listNotifications as jest.Mock).mockResolvedValue([{id:"chat-notice",orderId:"job-1",type}]);
  mockLast.mockResolvedValue({notification:{request:{identifier:`tap-${type}`,content:{data:{notificationId:"chat-notice",type,orderId:"job-1"}}}}});
  await renderHook(() => usePushNotifications());
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(mockPush).toHaveBeenCalledWith(route);
});
