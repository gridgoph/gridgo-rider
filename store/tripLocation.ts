import { create } from "zustand";
import type { RiderLocationState } from "@/hooks/useRiderLocation";
export const emptyTripLocation: RiderLocationState = {coords:null,accuracy:null,heading:null,speed:null,fixAtMs:null,permission:"unknown",error:null};
export const useTripLocation = create<RiderLocationState & { sharing:boolean; sharingError:string|null }>(() => ({...emptyTripLocation,sharing:false,sharingError:null}));
