jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

import * as ImagePicker from "expo-image-picker";

import {
  changeRiderPortrait,
  changeRiderSignInName,
  portraitFile,
} from "@/lib/clerkIdentity";

function clerkError(code: string, message = "That image is larger than 10MB.") {
  return { errors: [{ code, message, longMessage: message }] };
}

describe("the rider's portrait", () => {
  afterEach(() => jest.clearAllMocks());

  it("hands Clerk a file React Native can actually send", () => {
    expect(
      portraitFile({ uri: "file:///tmp/a.jpg", fileName: "face.jpg", mimeType: "image/jpeg" }),
    ).toEqual({ uri: "file:///tmp/a.jpg", name: "face.jpg", type: "image/jpeg" });
  });

  it("names an unnamed picture after the rider rather than after the phone", () => {
    const file = portraitFile({ uri: "file:///tmp/a.png", mimeType: "image/png" });
    expect(file).toEqual({
      uri: "file:///tmp/a.png",
      name: "rider-portrait.png",
      type: "image/png",
    });
  });

  it("sets the picture on the sign-in and re-reads it", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/a.jpg", fileName: null, mimeType: "image/jpeg" }],
    });
    const user = {
      setProfileImage: jest.fn(async () => undefined),
      reload: jest.fn(async () => undefined),
    };

    expect(await changeRiderPortrait(user)).toEqual({ status: "ok" });
    expect(user.setProfileImage).toHaveBeenCalledWith({
      file: { uri: "file:///tmp/a.jpg", name: "rider-portrait.jpg", type: "image/jpeg" },
    });
    expect(user.reload).toHaveBeenCalled();
  });

  it("says nothing when the rider closes the picker", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true });
    const user = { setProfileImage: jest.fn(async () => undefined) };

    expect(await changeRiderPortrait(user)).toEqual({ status: "cancelled" });
    expect(user.setProfileImage).not.toHaveBeenCalled();
  });

  it("turns a refused upload into a sentence, not a stack trace", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/a.jpg" }],
    });
    const user = {
      setProfileImage: jest.fn(async () => {
        throw clerkError("file_too_large", "That image is larger than 10MB.");
      }),
    };

    const outcome = await changeRiderPortrait(user);
    expect(outcome).toEqual({ status: "failed", message: "That image is larger than 10MB." });
  });
});

describe("the name on the sign-in", () => {
  it("splits a full name onto Clerk's first and last fields", async () => {
    const user = {
      update: jest.fn(async () => undefined),
      reload: jest.fn(async () => undefined),
    };

    expect(await changeRiderSignInName(user, "Carlo Dela Cruz")).toEqual({ status: "ok" });
    expect(user.update).toHaveBeenCalledWith({
      firstName: "Carlo",
      lastName: "Dela Cruz",
    });
    expect(user.reload).toHaveBeenCalled();
  });
});
