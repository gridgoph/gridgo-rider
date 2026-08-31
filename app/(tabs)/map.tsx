import { useFocusEffect } from "expo-router";
import { LocateFixed, Search, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApprovalChip } from "@/components/ApprovalChip";
import { BrowseMap } from "@/components/BrowseMap";
import { Screen } from "@/components/Screen";
import { fieldInputStyle } from "@/constants/theme";
import { DAVAO_MAP_CENTER, DAVAO_MAP_ZOOM } from "@/data/placeholderShops";
import { useRiderLocation } from "@/hooks/useRiderLocation";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { firstOpenView, shopsToMapPlaces, viewOn } from "@/lib/browseMap";
import {
  directoryShopsFromCatalog,
  filterDirectoryShops,
  type DirectoryShop,
} from "@/lib/directoryShops";
import type { MapView } from "@/lib/mapHtml";
import { approvalPresentation } from "@/lib/riderApproval";
import { useSession } from "@/store/session";

/**
 * The city. Not a trip, not a route builder.
 *
 * Riders already have a job map on Active. This tab is the whole of Davao so
 * they can find a GRIDGO shop before a dispatch exists — search, tap a pin,
 * read the name. Pins are the live catalog, the same shop points pickup uses.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const user = useSession((state) => state.user);
  const approval = approvalPresentation(user);
  const location = useRiderLocation();
  const centeredOnMe = useRef(false);

  const [shops, setShops] = useState<DirectoryShop[]>([]);
  const [shopsError, setShopsError] = useState<string | null>(null);
  const [shopsLoaded, setShopsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<MapView | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(true);

  const loadShops = useCallback(async () => {
    try {
      const catalog = await api.listCatalogShops();
      setShops(directoryShopsFromCatalog(catalog));
      setShopsError(null);
    } catch {
      setShopsError("Could not load print shops. Try again.");
    } finally {
      setShopsLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadShops();
    }, [loadShops]),
  );

  useEffect(() => {
    if (centeredOnMe.current || !location.coords) return;
    centeredOnMe.current = true;
    setView(firstOpenView(location.coords, DAVAO_MAP_CENTER, DAVAO_MAP_ZOOM));
  }, [location.coords]);

  const matches = useMemo(
    () => filterDirectoryShops(shops, query),
    [shops, query],
  );
  const selected = useMemo(
    () => shops.find((shop) => shop.id === selectedId) ?? null,
    [shops, selectedId],
  );

  function focusShop(shop: DirectoryShop) {
    setSelectedId(shop.id);
    setView(viewOn({ lat: shop.lat, lng: shop.lng }, 16));
    setQuery(shop.name);
    setSearchOpen(false);
    setCardOpen(true);
  }

  function recenter() {
    const target = location.coords ?? DAVAO_MAP_CENTER;
    setView(viewOn(target, location.coords ? 15 : DAVAO_MAP_ZOOM));
  }

  function closeCard() {
    setSelectedId(null);
    setCardOpen(false);
    setSearchOpen(false);
    setQuery("");
    recenter();
  }

  return (
    <Screen edges={[]}>
      <View className="flex-1">
        <BrowseMap
          places={shopsToMapPlaces(matches)}
          selectedPlaceId={selectedId}
          rider={location.coords}
          riderHeading={location.heading}
          view={view}
          onSelectPlace={(id) => {
            const shop = shops.find((entry) => entry.id === id);
            if (shop) focusShop(shop);
          }}
        />

        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 top-0 px-4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <View className="gap-2">
            <View className="relative justify-center">
              <View
                pointerEvents="none"
                className="absolute left-0 top-0 z-10 h-12 w-12 items-center justify-center"
              >
                <Search size={20} color={colors.textSecondary} strokeWidth={2} />
              </View>
              <TextInput
                className="gg-field"
                style={{ ...fieldInputStyle, paddingStart: 48 }}
                value={query}
                onChangeText={(next) => {
                  setQuery(next);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Find a shop"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Find a shop"
                testID="map-search"
              />
            </View>

            {approval.canWork ? null : (
              <View className="self-start">
                <ApprovalChip />
              </View>
            )}

            {searchOpen && query.trim() ? (
              <View className="overflow-hidden rounded-card border border-outline bg-surface">
                {matches.length === 0 ? (
                  <Text className="px-4 py-3 text-body text-text-secondary">
                    No GRIDGO shop matches that.
                  </Text>
                ) : (
                  matches.map((shop, index) => (
                    <Pressable
                      key={shop.id}
                      onPress={() => focusShop(shop)}
                      accessibilityRole="button"
                      accessibilityLabel={shop.name}
                      className={
                        index === 0 ? "px-4 py-3" : "border-t border-outline-subtle px-4 py-3"
                      }
                    >
                      <Text className="text-body font-bold text-text-primary">{shop.name}</Text>
                      <Text className="text-caption text-text-secondary">{shop.address}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
          </View>
        </View>

        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-0 px-4"
          style={{ paddingBottom: 16 }}
        >
          <View className="items-end gap-3">
            <Pressable
              onPress={recenter}
              accessibilityRole="button"
              accessibilityLabel="Center the map on you"
              className="h-12 w-12 items-center justify-center rounded-pill border border-outline bg-surface"
              testID="map-recenter"
            >
              <LocateFixed size={22} color={colors.textPrimary} strokeWidth={2} />
            </Pressable>

            {cardOpen && selected ? (
              <View className="w-full rounded-card border border-outline bg-surface px-4 py-3">
                <View className="flex-row items-start gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-h3 text-text-primary">{selected.name}</Text>
                    <Text className="mt-0.5 text-body text-text-secondary">{selected.address}</Text>
                  </View>
                  <Pressable
                    onPress={closeCard}
                    accessibilityRole="button"
                    accessibilityLabel="Close shop details"
                    className="h-11 w-11 items-center justify-center rounded-field border border-outline"
                    testID="map-card-close"
                  >
                    <X size={20} color={colors.textPrimary} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            ) : cardOpen ? (
              <View className="w-full rounded-card border border-outline bg-surface px-4 py-3">
                <View className="flex-row items-start gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-body text-text-secondary">
                      {!shopsLoaded
                        ? "Loading GRIDGO print shops…"
                        : shopsError
                          ? shopsError
                          : shops.length === 0
                            ? "No print shops on the map yet."
                            : "GRIDGO print shops. Tap a pin or search — this is not a route."}
                    </Text>
                    {shopsError ? (
                      <Pressable
                        onPress={() => {
                          setShopsLoaded(false);
                          void loadShops();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Try loading shops again"
                        className="mt-2 self-start"
                        testID="map-shops-retry"
                      >
                        <Text className="text-body font-bold text-text-primary">Try again</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={closeCard}
                    accessibilityRole="button"
                    accessibilityLabel="Close map details"
                    className="h-11 w-11 items-center justify-center rounded-field border border-outline"
                    testID="map-card-close"
                  >
                    <X size={20} color={colors.textPrimary} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Screen>
  );
}
