import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import type { DownloadUrl, Order, StoredFile } from "@/lib/api";

const mockGetFile = jest.fn<Promise<StoredFile>, [string]>();
const mockGetDownloadUrl = jest.fn<Promise<DownloadUrl>, [string]>();

jest.mock("@/lib/api", () => ({
  getFile: (id: string) => mockGetFile(id),
  getDownloadUrl: (id: string) => mockGetDownloadUrl(id),
}));

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const T0 = Date.parse("2026-09-28T08:00:00.000Z");
let now = T0;

const order = { id: "order1", artworkFileIds: ["art1"], mockupFileIds: [], productionItems: [], artworkName: null } as unknown as Order;

const artwork: StoredFile = {
  fileId: "art1", purpose: "artwork", originalFilename: "Banner.png", detectedContentType: "image/png", declaredContentType: "image/png",
  size: 2048, ownerId: "client1", state: "ready", createdAt: "today", readyAt: "today",
  references: [{ type: "order", id: "order1", field: "artworkFileIds" }],
};

function link(url: string, expiresInMs: number): DownloadUrl {
  return { fileId: "art1", url, expiresAt: new Date(now + expiresInMs).toISOString(), expiresInSeconds: Math.round(expiresInMs / 1000) };
}

let appStateListener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  now = T0;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  mockGetFile.mockReset().mockResolvedValue(artwork);
  mockGetDownloadUrl.mockReset();
  appStateListener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: () => { appStateListener = null; } };
  });
});

afterEach(() => jest.restoreAllMocks());

const previewUri = () => screen.getByTestId("artwork-preview-image").props.source?.[0]?.uri;

/*
  Signed links live five minutes and a rider's phone sits in the background far
  longer (gridgoph/gridgo-supplier#84). An expired link reads one fresh link and
  shimmers while it waits; "Preview unavailable" is only for a picture that
  fails on a good link, or whose re-read could not replace it.
*/
describe("ArtworkPanel preview links", () => {
  it("reads exactly one fresh link when the held link has expired, and never says the preview is unavailable", async () => {
    let answer: (value: DownloadUrl) => void = () => undefined;
    mockGetDownloadUrl
      .mockResolvedValueOnce(link("https://storage.example/old.png", 300_000))
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const view = await render(<ArtworkPanel order={order} />);
    await waitFor(() => expect(previewUri()).toBe("https://storage.example/old.png"));

    // Six minutes in the background: the link has expired and storage refuses it.
    now = T0 + 6 * 60_000;
    await act(async () => { fireEvent(screen.getByTestId("artwork-preview-image"), "error", { nativeEvent: { error: "403 Request has expired" } }); });

    expect(await screen.findByTestId("artwork-preview-refreshing")).toBeTruthy();
    expect(screen.queryByText("Preview unavailable")).toBeNull();
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
    expect(mockGetFile).toHaveBeenCalledTimes(1);

    await act(async () => { answer(link("https://storage.example/new.png", 300_000)); });
    await waitFor(() => expect(previewUri()).toBe("https://storage.example/new.png"));
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Preview unavailable")).toBeNull();
    await view.unmount();
  });

  it("still says the preview is unavailable when a fresh link fails", async () => {
    mockGetDownloadUrl.mockResolvedValue(link("https://storage.example/broken.png", 300_000));
    const view = await render(<ArtworkPanel order={order} />);
    await waitFor(() => expect(previewUri()).toBe("https://storage.example/broken.png"));

    await act(async () => { fireEvent(screen.getByTestId("artwork-preview-image"), "error", { nativeEvent: { error: "404" } }); });

    expect(await screen.findByText("Preview unavailable")).toBeTruthy();
    expect(screen.getByLabelText("Retry attachment")).toBeTruthy();
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("ends in the honest failure, not an endless shimmer, when the re-read hands back an expired link", async () => {
    mockGetDownloadUrl
      .mockResolvedValueOnce(link("https://storage.example/old.png", 300_000))
      // The phone clock runs ahead of the server's: every link arrives expired.
      .mockImplementation(async () => link("https://storage.example/skewed.png", -60_000));
    const view = await render(<ArtworkPanel order={order} />);
    await waitFor(() => expect(previewUri()).toBe("https://storage.example/old.png"));

    now = T0 + 6 * 60_000;
    await act(async () => { fireEvent(screen.getByTestId("artwork-preview-image"), "error", { nativeEvent: { error: "403" } }); });
    await waitFor(() => expect(previewUri()).toBe("https://storage.example/skewed.png"));
    await act(async () => { fireEvent(screen.getByTestId("artwork-preview-image"), "error", { nativeEvent: { error: "403" } }); });

    expect(await screen.findByText("Preview unavailable")).toBeTruthy();
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it("re-reads the link on returning to the app after four minutes, and not after one", async () => {
    mockGetDownloadUrl
      .mockResolvedValueOnce(link("https://storage.example/old.png", 300_000))
      .mockImplementation(async () => link("https://storage.example/resumed.png", 300_000));
    const view = await render(<ArtworkPanel order={order} />);
    await waitFor(() => expect(previewUri()).toBe("https://storage.example/old.png"));
    expect(appStateListener).not.toBeNull();

    now = T0 + 60_000;
    await act(async () => { appStateListener?.("active"); });
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);

    now = T0 + 6 * 60_000;
    await act(async () => { appStateListener?.("active"); });
    await waitFor(() => expect(previewUri()).toBe("https://storage.example/resumed.png"));
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
    expect(mockGetFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Preview unavailable")).toBeNull();
    await view.unmount();
  });
});
