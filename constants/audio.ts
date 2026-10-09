/**
 * Audio, required in one place.
 *
 * The same rule `constants/images.ts` follows: an asset is named here once and
 * reached by name everywhere else, because Metro wants a static `require` of a
 * string literal and a file discovered at runtime is a file that is not in the
 * bundle.
 *
 * Both stings come from the legacy GRIDGO app, where this opening was designed
 * — `printing_app/apps/mobile/assets/audio`. `intro` rides the dots as they
 * light; `outro` lands with the wordmark.
 *
 * `ring` is the incoming-call tone (`lib/callAudio.ts`): two rising notes,
 * twice, then a rest, three seconds that loop. Generated for GRIDGO, not taken
 * from any phone, so it never sounds like a real phone call from someone else.
 *
 * `Record<string, number>` for the same reason `constants/fonts.ts` uses it:
 * Metro returns a module id for a required asset, and that is what
 * `expo-audio` takes as a source.
 */
export const audio: Record<"intro" | "outro" | "ring", number> = {
  intro: require("../assets/audio/intro.m4a"),
  outro: require("../assets/audio/outro.m4a"),
  ring: require("../assets/audio/ring.wav"),
};
