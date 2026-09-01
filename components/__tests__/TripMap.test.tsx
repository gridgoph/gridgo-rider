import { fireEvent, render, screen } from "@testing-library/react-native";

import { TripMap } from "@/components/TripMap";

/*
  The card map is a picture of the trip with one control on it.

  It used to be tappable edge to edge, which is a large invisible target
  layered over a map that also looks draggable — and inside a scrolling page
  the drag belongs to the page anyway. So the whole-surface tap is gone and one
  named control opens it instead.
*/
// The Leaflet document itself is covered by lib/__tests__/mapHtml.test.ts.
jest.mock("@/components/MapFrame", () => ({
  MapFrame: () => null,
}));

const STOPS = {
  pickup: { lat: 7.064, lng: 125.6085 },
  dropoff: { lat: 7.0922, lng: 125.6165 },
};

describe("TripMap", () => {
  // @testing-library/react-native 14 made render async by default.
  it("opens the map full screen from its own control", async () => {
    const onExpand = jest.fn();
    await render(<TripMap {...STOPS} onExpand={onExpand} />);

    fireEvent.press(screen.getByLabelText("Open the map full screen"));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("draws no expand control on a map that is already full screen", async () => {
    await render(<TripMap {...STOPS} />);
    expect(screen.queryByLabelText("Open the map full screen")).toBeNull();
  });
});
