import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { CodeField } from "@/components/CodeField";

/**
 * The emailed-code field is one real input behind six drawn cells. These are
 * the behaviours that arrangement exists to protect — the ones a row of six
 * separate inputs gets wrong.
 */

function Harness({
  onComplete,
  initial = "",
}: {
  onComplete?: (code: string) => void;
  initial?: string;
}) {
  const [code, setCode] = useState(initial);
  return (
    <CodeField
      value={code}
      onChangeText={setCode}
      onComplete={onComplete}
      accessibilityLabel="Emailed code"
      testID="code"
    />
  );
}

describe("emailed-code field", () => {
  it("shows each digit in its own cell", async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId("code"), "4821");

    // The cells are drawn, not announced — the field itself is what a screen
    // reader gets, so these have to be asked for as hidden elements.
    for (const digit of ["4", "8", "2", "1"]) {
      expect(screen.getByText(digit, { includeHiddenElements: true })).toBeTruthy();
    }
  });

  it("hides the drawn cells from assistive tech, leaving one field to announce", async () => {
    await render(<Harness initial="482190" />);

    expect(screen.queryByText("4")).toBeNull();
    expect(screen.getByText("4", { includeHiddenElements: true })).toBeTruthy();
  });

  it("takes a pasted code whole rather than only its first digit", async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    await fireEvent.changeText(screen.getByTestId("code"), "482190");

    expect(onComplete).toHaveBeenCalledWith("482190");
  });

  it("keeps digits only, so a stray space or dash cannot pad the code", async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId("code"), "48-21 90");

    expect(screen.getByTestId("code").props.value).toBe("482190");
  });

  it("never holds more than the expected number of digits", async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId("code"), "1234567890");

    expect(screen.getByTestId("code").props.value).toBe("123456");
  });

  it("submits once the last digit lands, without a second tap", async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    const field = screen.getByTestId("code");

    await fireEvent.changeText(field, "48219");
    expect(onComplete).not.toHaveBeenCalled();

    await fireEvent.changeText(field, "482190");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not resubmit a code it has already offered", async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} initial="482190" />);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Re-typing the sixth digit onto a full code changes nothing, and must not
    // fire a second request while the first is still in flight.
    await fireEvent.changeText(screen.getByTestId("code"), "4821909");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("re-arms after a refused code is cleared, so the same code can be retyped", async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    const field = screen.getByTestId("code");

    await fireEvent.changeText(field, "482190");
    expect(onComplete).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(field, "");
    await fireEvent.changeText(field, "482190");
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it("offers the code to one-time-code autofill", async () => {
    await render(<Harness />);
    expect(screen.getByTestId("code").props).toMatchObject({
      textContentType: "oneTimeCode",
      autoComplete: "sms-otp",
      keyboardType: "number-pad",
    });
  });

  it("announces itself once, as a labelled field", async () => {
    await render(<Harness />);
    expect(screen.getByLabelText("Emailed code")).toBeTruthy();
  });
});
