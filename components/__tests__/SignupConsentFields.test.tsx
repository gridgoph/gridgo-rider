import { fireEvent, render, screen } from "@testing-library/react-native";

import { SignupConsentFields } from "@/components/legal/SignupConsentFields";
import type { LegalVersion } from "@/lib/api";
import { EMPTY_SIGNUP_CONSENT } from "@/lib/legal";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));

function doc(documentId: string, title: string): LegalVersion {
  return {
    id: `${documentId}-1`,
    documentId,
    version: 1,
    title,
    audience: "all",
    text: "Sample.",
    effectiveAt: "2026-11-11T00:00:00.000Z",
    placeholder: false,
    material: true,
    status: "live",
  };
}

const documents = [
  doc("rider-agreement", "Rider Agreement"),
  doc("terms-of-service", "Terms of Service"),
  doc("privacy-notice", "Privacy Notice"),
];

const AGREE =
  "I am 18 or older and agree to the Rider Agreement, Terms of Service and Privacy Notice";

describe("SignupConsentFields — riders are 18 or older", () => {
  it("offers no age question and no guardian path", async () => {
    await render(
      <SignupConsentFields
        consent={EMPTY_SIGNUP_CONSENT}
        onChange={jest.fn()}
        documents={documents}
        status="ready"
        onRetry={jest.fn()}
      />,
    );
    expect(screen.queryByText(/under 18/i)).toBeNull();
    expect(screen.queryByText(/guardian/i)).toBeNull();
    expect(screen.queryByText("Are you 18 or older?")).toBeNull();
    expect(screen.getByText("Rider accounts are for people 18 and over. Required to apply.")).toBeTruthy();
  });

  it("ticking the agreement box declares 18 or older", async () => {
    const onChange = jest.fn();
    await render(
      <SignupConsentFields
        consent={EMPTY_SIGNUP_CONSENT}
        onChange={onChange}
        documents={documents}
        status="ready"
        onRetry={jest.fn()}
      />,
    );
    const box = screen.getByTestId("signup-agree");
    expect(box.props.accessibilityLabel).toBe(AGREE);
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith({ agreed: true, marketing: false });
  });
});
