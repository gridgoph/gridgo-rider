import * as ImagePicker from "expo-image-picker";

export type CapturedProofPhoto = {
  /** File name sent to the demo API as photoName. */
  photoName: string;
  /** Local URI for preview — memory only, never uploaded in MVP. */
  uri: string;
};

/**
 * Capture a proof photo with the device camera.
 * Returns null when the rider cancels or permission is denied.
 */
export async function captureProofPhoto(
  kind: "pickup" | "delivery",
): Promise<CapturedProofPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: false,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0]!;
  const ext =
    asset.fileName?.split(".").pop()?.toLowerCase() ||
    (asset.mimeType?.includes("png") ? "png" : "jpg");
  const stamp = Date.now();
  const photoName = `${kind}-${stamp}.${ext}`;

  return {
    photoName,
    uri: asset.uri,
  };
}
