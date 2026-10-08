import { copyAddress } from "@/lib/copyAddress";
import { copyAddress as copyWebAddress } from "@/lib/copyAddress.web";

const mockSetString = jest.fn();
jest.mock("react-native", () => ({ Clipboard: { setString: (value: string) => mockSetString(value) } }));

it("copies only the displayed address through the existing native module", async () => {
  await copyAddress("Shop & print");
  expect(mockSetString).toHaveBeenCalledWith("Shop & print");
});

it("propagates native copy errors to the selectable-address fallback", async () => {
  mockSetString.mockImplementationOnce(() => { throw new Error("Unavailable"); });
  await expect(copyAddress("Client door")).rejects.toThrow("Unavailable");
});

it("waits for the browser clipboard and propagates refusals", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    await copyWebAddress("Client door");
    expect(writeText).toHaveBeenCalledWith("Client door");
    writeText.mockRejectedValueOnce(new Error("Permission denied"));
    await expect(copyWebAddress("Client door")).rejects.toThrow("Permission denied");
  } finally {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});
