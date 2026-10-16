import { senderLabel, tripChatOrder, tripChatWords } from "@/lib/tripChat";

describe("two conversations on one job", () => {
  it("never shares a word that would let the rider write to the wrong party", () => {
    const client = tripChatWords("client");
    const shop = tripChatWords("shop");
    for (const key of ["counterpart", "sender", "placeholder", "inputLabel", "sendLabel", "imagePurpose"] as const) {
      expect(client[key]).not.toBe(shop[key]);
    }
    expect(shop.placeholder).toBe("Write to the shop");
    expect(shop.sendLabel).toBe("Send to the shop");
    expect(shop.imagePurpose).toBe("pickup_chat_image");
    expect(client.placeholder).toBe("Write to the client");
    expect(client.imagePurpose).toBe("delivery_chat_image");
  });

  it("labels the other side by who they are", () => {
    expect(senderLabel({ mine: false }, "shop")).toBe("Shop");
    expect(senderLabel({ mine: false }, "client")).toBe("Client");
    expect(senderLabel({ mine: true }, "shop")).toBe("You");
  });

  it("puts the shop first while the rider is heading there, the client after pick-up", () => {
    expect(tripChatOrder("rider_assigned")).toEqual(["shop", "client"]);
    expect(tripChatOrder("picked_up")).toEqual(["client", "shop"]);
    expect(tripChatOrder("out_for_delivery")).toEqual(["client", "shop"]);
  });
});
