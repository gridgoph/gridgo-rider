import { readInvalidation } from "@/lib/live";

it("ignores staff desk resources the rider app does not know", () => {
  expect(readInvalidation(JSON.stringify({ resource: "issue-reports" }))).toBeNull();
  expect(readInvalidation(JSON.stringify({ resource: "chat", id: "message-1" }))).toBeNull();
  expect(readInvalidation(JSON.stringify({ resource: "dispatch" }))).toEqual({
    resource: "dispatch",
  });
});
