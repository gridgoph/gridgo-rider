import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";

import { UpdateBlockedContent, UpdateRequiredOverlay } from "@/components/UpdateRequired";

/*
  The whole-app block covers the app visually; it has to cover it for
  assistive technology and the keyboard too, or Tab and a screen reader walk
  straight into the controls underneath (review of PR 187).
*/

it("hides the app under the block from screen readers, and gives it back after", async () => {
  const { rerender } = await render(
    <UpdateBlockedContent blocked>
      <Text>Sign in</Text>
    </UpdateBlockedContent>,
  );
  const scope = screen.toJSON() as { props: Record<string, unknown> };
  expect(scope.props.accessibilityElementsHidden).toBe(true);
  expect(scope.props.importantForAccessibility).toBe("no-hide-descendants");

  await rerender(
    <UpdateBlockedContent blocked={false}>
      <Text>Sign in</Text>
    </UpdateBlockedContent>,
  );
  const open = screen.toJSON() as { props: Record<string, unknown> };
  expect(open.props.accessibilityElementsHidden).toBe(false);
  expect(open.props.importantForAccessibility).toBe("auto");
  // Still the same tree: the navigator is never remounted by the block.
  expect(screen.getByText("Sign in")).toBeTruthy();
});

it("moves focus onto Update now as the block appears", async () => {
  const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => {});
  await render(<UpdateRequiredOverlay />);
  const button = screen.getByRole("button", { name: "Update now" });
  expect(focus).toHaveBeenCalledWith(expect.anything(), "focus");
  expect(focus.mock.calls[0]![0]).toBeTruthy();
  expect(button).toBeTruthy();
  // The overlay itself is the modal region.
  expect(screen.getByText("Update GRIDGO")).toBeTruthy();
});
