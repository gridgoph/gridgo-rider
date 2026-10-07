import { Platform } from "react-native";

import * as api from "@/lib/api";
import { uploadChatImage } from "@/lib/chatImages";

const photo = { uri: "file:///cache/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg" };

class UploadRequest {
  static requests: UploadRequest[] = [];
  status = 201;
  responseText = JSON.stringify({ file: { fileId: "file_chat_photo" } });
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn<void, [FormData]>(() => { this.onload?.(); });

  constructor() {
    UploadRequest.requests.push(this);
  }
}

const originalXHR = global.XMLHttpRequest;
const originalFormData = global.FormData;
const originalFetch = global.fetch;
const originalOS = Platform.OS;

beforeEach(() => {
  api.setToken(null);
  api.setTokenProvider(null);
  UploadRequest.requests = [];
  global.XMLHttpRequest = UploadRequest as unknown as typeof XMLHttpRequest;
  // Jest uses browser FormData; native uploads use React Native's URI parts.
  global.FormData = jest.requireActual("react-native/Libraries/Network/FormData").default;
});

afterEach(() => {
  api.setToken(null);
  api.setTokenProvider(null);
  global.XMLHttpRequest = originalXHR;
  global.FormData = originalFormData;
  global.fetch = originalFetch;
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

it.each(["support_chat_image", "delivery_chat_image"])(
  "uploads %s with a Clerk bearer and no legacy token",
  async (purpose) => {
    api.setTokenProvider(async () => "clerk_chat_jwt");
    expect(api.getToken()).toBeNull();

    await expect(uploadChatImage(photo, purpose)).resolves.toBe("file_chat_photo");

    const xhr = UploadRequest.requests[0];
    expect(xhr.open).toHaveBeenCalledWith("POST", `${api.getApiBase()}/files`);
    expect(xhr.setRequestHeader.mock.calls).toEqual([
      ["Accept", "application/json"],
      ["Authorization", "Bearer clerk_chat_jwt"],
      ["X-GRIDGO-Role", "rider"],
    ]);
    const form = xhr.send.mock.calls[0]?.[0] as unknown as {
      getParts: () => { fieldName: string; string?: string; uri?: string; name?: string; type?: string }[];
    };
    expect(form.getParts()).toEqual([
      expect.objectContaining({ fieldName: "purpose", string: purpose }),
      expect.objectContaining({ fieldName: "file", uri: photo.uri, name: photo.name, type: photo.mimeType }),
    ]);
  },
);

it("does not send a photo without a session", async () => {
  await expect(uploadChatImage(photo)).rejects.toThrow("Sign in again to send this photo.");
  expect(UploadRequest.requests).toHaveLength(0);
});

it("still accepts a development legacy bearer", async () => {
  api.setToken("legacy_chat_token");
  await expect(uploadChatImage(photo)).resolves.toBe("file_chat_photo");
  expect(UploadRequest.requests[0].setRequestHeader).toHaveBeenCalledWith(
    "Authorization", "Bearer legacy_chat_token",
  );
});

it("keeps the server's refusal code and status for send diagnostics", async () => {
  api.setTokenProvider(async () => "clerk_chat_jwt");
  const send = jest.spyOn(global, "XMLHttpRequest").mockImplementation(() => {
    const xhr = new UploadRequest();
    xhr.status = 413;
    xhr.responseText = JSON.stringify({ error: "file_too_large" });
    return xhr as unknown as XMLHttpRequest;
  });
  await expect(uploadChatImage(photo)).rejects.toMatchObject({ status: 413, message: "file_too_large" });
  send.mockRestore();
});

it("does not return a file id for an incomplete success response", async () => {
  api.setTokenProvider(async () => "clerk_chat_jwt");
  jest.spyOn(global, "XMLHttpRequest").mockImplementation(() => {
    const xhr = new UploadRequest();
    xhr.responseText = "{}";
    return xhr as unknown as XMLHttpRequest;
  });
  await expect(uploadChatImage(photo)).rejects.toThrow("That photo did not reach GRIDGO.");
});

it("sends binary photo bytes in a browser instead of a stringified URI part", async () => {
  Platform.OS = "web";
  global.FormData = originalFormData;
  jest.spyOn(api, "getApiBase").mockReturnValue("http://127.0.0.1:8787");
  api.setTokenProvider(async () => "clerk_chat_jwt");
  const blob = new Blob(["photo bytes"], { type: "image/jpeg" });
  global.fetch = jest.fn(async () => ({ blob: async () => blob })) as unknown as typeof fetch;

  await expect(uploadChatImage(photo)).resolves.toBe("file_chat_photo");
  const form = UploadRequest.requests[0].send.mock.calls[0][0];
  const file = form.get("file") as File;
  expect(file.name).toBe("photo.jpg");
  expect(file.type).toBe("image/jpeg");
  expect(file.size).toBe(blob.size);
});

it("rejects a lost connection without returning a stored photo", async () => {
  api.setTokenProvider(async () => "clerk_chat_jwt");
  jest.spyOn(global, "XMLHttpRequest").mockImplementation(() => {
    const xhr = new UploadRequest();
    xhr.send.mockImplementation(() => { xhr.onerror?.(); });
    return xhr as unknown as XMLHttpRequest;
  });
  await expect(uploadChatImage(photo)).rejects.toThrow("That photo did not reach GRIDGO.");
});
