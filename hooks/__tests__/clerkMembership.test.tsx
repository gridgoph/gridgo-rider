import {renderHook,waitFor} from "@testing-library/react-native";
import {useClerkSessionBridge} from "@/hooks/useClerkSessionBridge";
import {useSession,releaseClerkAdoptionBlock} from "@/store/session";
import * as api from "@/lib/api";
const mockToken=jest.fn(async()=>"token");const mockSignOut=jest.fn(async()=>{});
const mockClaims={sid:"dual-session",gridgoRole:"client"};
const mockUser={publicMetadata:{gridgoRole:"client"}};
jest.mock("@clerk/expo",()=>({useAuth:()=>({isLoaded:true,isSignedIn:true,getToken:mockToken,sessionClaims:mockClaims}),useClerk:()=>({signOut:mockSignOut}),useUser:()=>({isLoaded:true,user:mockUser})}));
it("uses API membership even when the Clerk primary role is client",async()=>{
  releaseClerkAdoptionBlock();useSession.setState({user:null,authSource:null,needsApplication:false,loading:false});
  jest.spyOn(api,"me").mockResolvedValue({id:"dual",role:"rider",name:"Dual",email:"dual@test",verificationStatus:"approved"});
  const view=await renderHook(()=>useClerkSessionBridge());
  await waitFor(()=>expect(useSession.getState().user?.id).toBe("dual"));
  expect(mockSignOut).not.toHaveBeenCalled();
  await view.unmount();jest.restoreAllMocks();api.setTokenProvider(null);
});
