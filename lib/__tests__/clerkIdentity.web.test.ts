jest.mock("@/lib/webFilePick", () => ({
  canPickOnWeb: () => true,
  pickFileOnWeb: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

import { pickFileOnWeb } from "@/lib/webFilePick";
import { changeRiderPortrait } from "@/lib/clerkIdentity";

describe("changeRiderPortrait on web", () => {
  it("saves a browser-picked picture onto the sign-in", async () => {
    const file = new File(["face"], "face.png", { type: "image/png" });
    (pickFileOnWeb as jest.Mock).mockResolvedValue({
      uri: "blob:face",
      name: "face.png",
      mimeType: "image/png",
      size: 4,
      file,
    });
    const user = {
      setProfileImage: jest.fn(async () => undefined),
      reload: jest.fn(async () => undefined),
    };

    expect(await changeRiderPortrait(user)).toEqual({ status: "ok" });
    expect(user.setProfileImage).toHaveBeenCalledWith({ file });
    expect(user.reload).toHaveBeenCalled();
  });
});
