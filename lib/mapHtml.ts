/**
 * Leaflet map HTML for a react-native-webview.
 *
 * Uses OpenStreetMap raster tiles (light) and Carto dark tiles (night).
 * Attribution is a licence condition — always visible.
 *
 * Injected via template so the host can update route, rider position, and
 * theme without reloading the whole document when possible.
 */

import { cartoDarkTileUrl } from "@/lib/cartoTiles";
import type { LatLng, LonLat } from "@/lib/geo";

export type MapTheme = "light" | "dark";
export type MapPinKind = "shop" | "client" | "office";

export type MapPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type MapView = {
  lat: number;
  lng: number;
  zoom?: number;
};

export type MapModel = {
  theme: MapTheme;
  pickup: LatLng | null;
  dropoff: LatLng | null;
  pickupLabel: string;
  dropoffLabel: string;
  pickupKind?: MapPinKind;
  dropoffKind?: MapPinKind;
  /** Which stop the rider is heading to — that pin gets the live ring. */
  focus?: "pickup" | "dropoff" | null;
  /** GeoJSON LineString coordinates [lon, lat][]. */
  routeCoordinates: LonLat[];
  /** Route stroke — design system actionYellow. */
  routeColor: string;
  rider: LatLng | null;
  riderAccuracy?: number | null;
  /**
   * Course over ground in degrees from true north, or null while stopped.
   *
   * Null draws a plain dot. The phone reports no course when it is not moving,
   * and pointing anyway would aim the arrow at the last direction of travel —
   * confidently wrong exactly when somebody has stopped to work out where to
   * go next.
   */
  riderHeading?: number | null;
  /** Dispatch ticket on the map: "TO THE SHOP". */
  navTitle?: string | null;
  navSummary?: string | null;
  /**
   * Status-bar height, in CSS pixels, when the map runs under it.
   *
   * A full-screen map is drawn edge to edge on purpose, which puts the phone's
   * own clock and battery over the top of anything the map draws there. The
   * host is the only side that knows how deep that is, so it says, and the
   * overlays start below it.
   */
  safeTop?: number | null;
  /** When true, show an on-map note that routing failed. */
  routeUnavailable: boolean;
  /**
   * Supplier / shop pins for the city Map tab. Absent on trip maps.
   */
  places?: readonly MapPlace[] | null;
  selectedPlaceId?: string | null;
  /** When set, the camera goes here instead of fitting markers. */
  view?: MapView | null;
  /**
   * Whether the map is something to drive, or something to glance at.
   *
   * A map on a card is a picture of the trip: the page owns the drag, and a
   * zoom control the finger can never reach is clutter. False drops the
   * control, stops the gestures, and moves attribution clear of the card's own
   * expand button. Defaults to a full map.
   */
  controls?: boolean;
};

const LIGHT_TILES =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Build the full HTML document for the WebView.
 * Leaflet is loaded from unpkg CDN (same connectivity bar as OSM tiles).
 */
export function buildMapHtml(model: MapModel): string {
  const payload = JSON.stringify(model);
  // Escape for embedding inside a <script> as a JSON string assignment.
  const safe = payload.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #1a1a1a; }
    .leaflet-control-attribution {
      font-size: 9px !important;
      padding: 1px 6px !important;
      background: rgba(255,255,255,0.88) !important;
      color: #4a4a4a !important;
      max-width: 70%;
    }
    .leaflet-control-attribution a { color: #4a4a4a !important; }
    .dark-attr .leaflet-control-attribution {
      background: rgba(18,18,18,0.9) !important;
      color: #a8a8a8 !important;
    }
    .dark-attr .leaflet-control-attribution a { color: #a8a8a8 !important; }
    /* Leaflet's default control is a white box with a hard border. Match it to
       the rest of the map furniture: same radius, same float, same theme. */
    .leaflet-control-zoom {
      border: none !important;
      border-radius: 11px !important;
      overflow: hidden;
      box-shadow: 0 4px 14px rgba(0,0,0,0.28) !important;
    }
    .leaflet-control-zoom a {
      width: 34px !important; height: 34px !important; line-height: 34px !important;
      font-size: 18px !important;
      background: rgba(255,255,255,0.95) !important;
      color: #1a1a1a !important;
      border-bottom-color: rgba(0,0,0,0.08) !important;
    }
    .dark-attr .leaflet-control-zoom a {
      background: rgba(18,18,18,0.94) !important;
      color: #f0f0f0 !important;
      border-bottom-color: rgba(255,255,255,0.12) !important;
    }
    /*
      A destination is a pin, not a plate.

      A square floating over the tiles is ambiguous about which doorway it
      means, and every stop on this map is a doorway somebody has to walk
      through. One teardrop silhouette that touches its own coordinate, with a
      blurred contact shadow so it stands on the street instead of hovering
      over it. Three fills, one meaning each: yellow is a print shop, paper is
      a client's door, ink and gold is GRIDGO's own counter.
    */
    .pin {
      display: flex; flex-direction: column; align-items: center;
      width: 34px;
    }
    .pin-stack { position: relative; width: 34px; height: 48px; }
    .pin-head {
      position: relative; z-index: 2;
      display: block; width: 34px; height: 48px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.30));
      transform-origin: 50% 94%;
    }
    /* Where the pin meets the ground. */
    .pin-tip {
      position: absolute; z-index: 1;
      left: 50%; bottom: 1px;
      width: 16px; height: 5px; margin-left: -8px;
      border-radius: 999px;
      background: rgba(0,0,0,0.32);
      filter: blur(2px);
    }
    .dark-attr .pin-tip { background: rgba(0,0,0,0.6); }
    /* The stop being ridden to, and only that one. */
    .pin-ring {
      position: absolute; z-index: 0;
      left: 50%; top: 17px;
      width: 46px; height: 46px; margin-left: -23px; margin-top: -23px;
      border-radius: 999px;
      border: 3px solid #FFDE58;
      opacity: 0;
    }
    .pin.is-focus .pin-ring { opacity: 1; animation: pin-focus 2.4s ease-out infinite; }
    .pin.is-focus .pin-head { transform: scale(1.07); }
    @keyframes pin-focus {
      0% { transform: scale(0.7); opacity: 0.9; }
      70% { transform: scale(1.15); opacity: 0; }
      100% { transform: scale(1.15); opacity: 0; }
    }
    .pin-rider {
      position: relative;
      width: 28px; height: 28px;
    }
    .pin-rider .pin-halo {
      position: absolute; inset: 0;
      border-radius: 999px;
      background: rgba(255, 222, 88, 0.35);
      animation: gps-pulse 1.8s ease-out infinite;
    }
    .pin-rider .pin-mark {
      position: relative;
      width: 14px; height: 14px; border-radius: 999px;
      background: #FFDE58; border: 3px solid #1a1a1a;
      margin: 7px auto 0;
    }
    /*
      The rider, pointing.

      A dot says where somebody is; a rider following a route also needs to
      know which way they are facing, and reads it off the map rather than off
      a compass reading in words. This is the shape every navigation app has
      taught people: a disc with a cone of direction thrown ahead of it.

      Rotation is applied to a wrapper rather than the disc, so the disc itself
      never distorts and the cone is what turns.
    */
    .pin-rider .pin-cone {
      position: absolute;
      left: 50%; top: 50%;
      width: 0; height: 0;
      margin-left: -9px; margin-top: -20px;
      border-left: 9px solid transparent;
      border-right: 9px solid transparent;
      border-bottom: 15px solid rgba(255, 222, 88, 0.9);
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45));
      transform-origin: 9px 20px;
    }
    .pin-rider.is-pointing .pin-halo { animation: none; opacity: 0.22; }
    @keyframes gps-pulse {
      0% { transform: scale(0.55); opacity: 0.8; }
      100% { transform: scale(2.1); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .pin-rider .pin-halo { animation: none; opacity: 0.35; }
      .pin.is-focus .pin-ring { animation: none; opacity: 0.85; transform: scale(1); }
    }
    /* Names a place, never an address — the street lines are on the card. */
    .pin-label {
      margin-top: 3px; padding: 3px 7px;
      font: 700 10px/1.25 system-ui, -apple-system, sans-serif;
      background: rgba(255,255,255,0.96); color: #1a1a1a;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 7px; white-space: nowrap;
      max-width: 132px; overflow: hidden; text-overflow: ellipsis;
      box-shadow: 0 3px 8px rgba(0,0,0,0.20);
    }
    .dark-attr .pin-label {
      background: rgba(18,18,18,0.94); color: #f0f0f0;
      border-color: rgba(255,255,255,0.14);
      box-shadow: 0 3px 10px rgba(0,0,0,0.5);
    }
    /*
      The heading strip.

      Yellow means one thing on this map — the way through the city — so the
      strip that describes the route does not wear it. It floats clear of the
      edges as an ink card and spends its yellow on one arrow tile, and the
      glance target is the distance rather than the destination: mid-ride a
      rider already knows where they are going.
    */
    .nav-chip {
      position: absolute; z-index: 1000;
      left: 10px; right: 10px;
      top: calc(8px + var(--safe-top, 0px));
      display: none;
      align-items: center; gap: 10px;
      padding: 9px 13px 9px 9px;
      border-radius: 14px;
      background: rgba(255,255,255,0.95);
      border: 1px solid rgba(0,0,0,0.10);
      box-shadow: 0 8px 22px rgba(0,0,0,0.20);
      color: #1a1a1a;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .dark-attr .nav-chip {
      background: rgba(18,18,18,0.94);
      border-color: rgba(255,255,255,0.14);
      box-shadow: 0 10px 26px rgba(0,0,0,0.55);
      color: #f0f0f0;
    }
    .nav-chip.show { display: flex; }
    .nav-glyph {
      flex: none;
      width: 34px; height: 34px; border-radius: 11px;
      background: #FFDE58;
      display: flex; align-items: center; justify-content: center;
    }
    .nav-glyph svg { width: 17px; height: 17px; display: block; }
    .nav-body { flex: 1; min-width: 0; }
    .nav-eyebrow {
      font-size: 9.5px; font-weight: 800; letter-spacing: 0.16em;
      text-transform: uppercase; color: #6b6b6b;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .dark-attr .nav-eyebrow { color: #9a9a9a; }
    .nav-line {
      margin-top: 2px;
      display: flex; align-items: center; gap: 9px;
      white-space: nowrap; overflow: hidden;
    }
    .nav-lead {
      font-size: 17px; font-weight: 800; line-height: 1.1;
      letter-spacing: -0.01em;
    }
    /* Distance and time are two measurements, so a rule divides them. */
    .nav-rule { flex: none; width: 1px; height: 13px; background: currentColor; opacity: 0.22; }
    .nav-rest { font-size: 12.5px; font-weight: 600; opacity: 0.7; }
    /* "Waiting for GPS" is a state, not a measurement — it is not shouted. */
    .nav-state { font-size: 12.5px; font-weight: 600; opacity: 0.75; }
    .route-banner {
      position: absolute; z-index: 1000;
      left: 10px; right: 10px;
      top: calc(8px + var(--safe-top, 0px));
      display: none;
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.10);
      border-left: 3px solid #FFDE58;
      background: rgba(255,255,255,0.95);
      color: #1a1a1a;
      box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      font: 600 11.5px/1.35 system-ui, -apple-system, sans-serif;
    }
    .dark-attr .route-banner {
      background: rgba(18,18,18,0.94); color: #f0f0f0;
      border-color: rgba(255,255,255,0.14); border-left-color: #FFDE58;
      box-shadow: 0 8px 22px rgba(0,0,0,0.5);
    }
    .route-banner.show { display: block; }
    .nav-chip.show + .route-banner.show { top: calc(74px + var(--safe-top, 0px)); }
  </style>
</head>
<body>
  <div id="nav-chip" class="nav-chip" role="status">
    <div class="nav-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12 2.4 21 21.4 12 16.9 3 21.4Z" fill="#1a1a1a"/></svg>
    </div>
    <div class="nav-body">
      <div class="nav-eyebrow" id="nav-kicker"></div>
      <div class="nav-line" id="nav-line"></div>
    </div>
  </div>
  <div id="route-banner" class="route-banner" role="status">Route unavailable — straight line shown</div>
  <div id="map"></div>
  <script>
    var MODEL = ${safe};
    var map = null;
    var tileLayer = null;
    var lastTileUrl = '';
    var routeLayer = null;
    var accuracyCircle = null;
    var markers = [];
    var cameraReady = false;
    var lastViewKey = '';
    var lastTripKey = '';
    var DARK_TILES = ${JSON.stringify(cartoDarkTileUrl())};
    var LIGHT_TILES = ${JSON.stringify(LIGHT_TILES)};

    function clearMarkers() {
      markers.forEach(function (m) { map.removeLayer(m); });
      markers = [];
    }

    function notifyHost(payload) {
      var raw = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(raw);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(raw, '*');
      }
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    /*
      One silhouette for every destination, filled three ways.

      Yellow is a print shop, paper is a client's door, and GRIDGO's own
      counter wears the mark's ink and gold so it can never be mistaken for a
      supplier. The tip is the coordinate: the anchor sits on it, and the
      contact shadow underneath is what makes the pin read as standing on the
      street rather than floating over it.
    */
    var PIN_SKIN = {
      shop:   { cls: 'pin-shop',   fill: '#FFDE58', stroke: '#1a1a1a', ink: '#1a1a1a', width: 2 },
      client: { cls: 'pin-client', fill: '#FFFFFF', stroke: '#1a1a1a', ink: '#1a1a1a', width: 2 },
      office: { cls: 'pin-office', fill: '#1a1a1a', stroke: '#FFDE58', ink: '#FFDE58', width: 2.5 }
    };

    var PIN_PATH = 'M17 45.6C17 45.6 3.2 27.9 3.2 17.6A13.8 13.8 0 1 1 30.8 17.6C30.8 27.9 17 45.6 17 45.6Z';

    function pinSkinFor(kind) {
      if (kind === 'office') return 'office';
      if (kind === 'client' || kind === 'dropoff') return 'client';
      return 'shop';
    }

    /** A pin names a place; the street lines belong on the card below it. */
    function pinCaption(value) {
      var text = String(value == null ? '' : value).trim();
      if (!text) return '';
      var comma = text.indexOf(',');
      return comma > 0 ? text.slice(0, comma).trim() : text;
    }

    function pinHead(skin, glyph) {
      var wide = glyph.length > 1;
      var glyphHtml = glyph
        ? '<text x="17" y="17" dy="0.35em" text-anchor="middle"'
          + ' font-family="system-ui, -apple-system, sans-serif"'
          + ' font-size="' + (wide ? 12 : 14) + '" font-weight="800"'
          + ' letter-spacing="' + (wide ? '0.3' : '0') + '"'
          + ' fill="' + skin.ink + '">' + escapeHtml(glyph) + '</text>'
        : '';
      return '<svg class="pin-head" viewBox="0 0 34 48" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="' + PIN_PATH + '" fill="' + skin.fill + '" stroke="' + skin.stroke
        + '" stroke-width="' + skin.width + '" stroke-linejoin="round"/>'
        + glyphHtml
        + '</svg>';
    }

    function pinIcon(kind, shortLabel, selected, longLabel) {
      if (kind === 'rider') {
        /*
          Pointing only when the phone actually knows the course. Stationary,
          the platform reports none, and an arrow aimed at whichever way the
          rider last moved is worse than no arrow: it is confidently wrong at
          exactly the moment somebody is standing still working out where to go.
        */
        var pointing = typeof MODEL.riderHeading === 'number';
        var cone = pointing
          ? '<div class="pin-cone" style="transform: rotate(' + MODEL.riderHeading + 'deg)"></div>'
          : '';
        return L.divIcon({
          className: '',
          html: '<div class="pin pin-rider' + (pointing ? ' is-pointing' : '') + '">'
            + '<div class="pin-halo"></div>' + cone + '<div class="pin-mark"></div></div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
      }

      var skin = PIN_SKIN[pinSkinFor(kind)];
      var cls = 'pin ' + skin.cls + (selected ? ' is-focus is-selected' : '');
      var caption = pinCaption(longLabel === '' ? '' : (longLabel || shortLabel));
      var labelHtml = caption ? '<div class="pin-label">' + escapeHtml(caption) + '</div>' : '';
      return L.divIcon({
        className: '',
        html: '<div class="' + cls + '">'
          + '<div class="pin-stack">'
          + '<div class="pin-ring"></div>'
          + '<div class="pin-tip"></div>'
          + pinHead(skin, String(shortLabel == null ? '' : shortLabel))
          + '</div>'
          + labelHtml
          + '</div>',
        iconSize: [34, 48],
        iconAnchor: [17, 45]
      });
    }

    /*
      Distance and time are two different measurements pushed through one
      string, so the strip splits them and rules between them. Anything with no
      separator is a state ("Waiting for GPS"), and states are not shouted.
    */
    /** How lib/osrm.ts joins the two halves of a route summary. */
    var SUMMARY_SEP = ' \u00b7 ';

    function renderNavSummary(value) {
      var text = String(value == null ? '' : value).trim();
      if (!text) return '';
      var parts = text.split(SUMMARY_SEP);
      if (parts.length < 2) {
        return '<span class="nav-state">' + escapeHtml(text) + '</span>';
      }
      var lead = parts.shift();
      return '<span class="nav-lead">' + escapeHtml(lead) + '</span>'
        + '<span class="nav-rule"></span>'
        + '<span class="nav-rest">' + escapeHtml(parts.join(SUMMARY_SEP)) + '</span>';
    }

    function applyModel(m) {
      MODEL = m;
      var isDark = m.theme === 'dark';
      document.body.className = isDark ? 'dark-attr' : '';
      document.getElementById('route-banner').className =
        'route-banner' + (m.routeUnavailable ? ' show' : '');

      if (!map) {
        var driveable = m.controls !== false;
        map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        });
        // Attribution is a licence condition and always drawn. On a card it
        // moves to the other corner so the expand control has that one clear.
        L.control.attribution({ position: driveable ? 'bottomright' : 'bottomleft' }).addTo(map);
        if (driveable) {
          L.control.zoom({ position: 'bottomright' }).addTo(map);
        } else {
          // A picture of the trip: the page underneath owns the drag.
          map.dragging.disable();
          map.touchZoom.disable();
          map.doubleClickZoom.disable();
          map.scrollWheelZoom.disable();
          map.boxZoom.disable();
          map.keyboard.disable();
        }
      }

      var url = isDark ? DARK_TILES : LIGHT_TILES;
      var attr = isDark
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      if (url !== lastTileUrl) {
        if (tileLayer) map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(url, {
          maxZoom: 19,
          attribution: attr
        }).addTo(map);
        lastTileUrl = url;
      }

      document.documentElement.style.setProperty(
        '--safe-top',
        (typeof m.safeTop === 'number' && m.safeTop > 0 ? Math.round(m.safeTop) : 0) + 'px'
      );

      var chip = document.getElementById('nav-chip');
      var kicker = document.getElementById('nav-kicker');
      var line = document.getElementById('nav-line');
      if (m.navTitle) {
        kicker.textContent = m.navTitle;
        line.innerHTML = renderNavSummary(m.navSummary);
        chip.className = 'nav-chip show';
      } else {
        chip.className = 'nav-chip';
      }

      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = null;
      if (m.routeCoordinates && m.routeCoordinates.length >= 2) {
        // GeoJSON is [lon, lat]; Leaflet latLng expects [lat, lon].
        var latlngs = m.routeCoordinates.map(function (c) {
          return [c[1], c[0]];
        });
        routeLayer = L.featureGroup([
          L.polyline(latlngs, {
            color: '#1a1a1a',
            weight: 8,
            opacity: 0.9,
            lineJoin: 'round',
            lineCap: 'round'
          }),
          L.polyline(latlngs, {
            color: m.routeColor || '#FFDE58',
            weight: 4,
            opacity: 1,
            lineJoin: 'round',
            lineCap: 'round'
          })
        ]).addTo(map);
      }

      if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }
      if (m.rider && m.riderAccuracy && m.riderAccuracy > 0) {
        accuracyCircle = L.circle([m.rider.lat, m.rider.lng], {
          radius: Math.min(m.riderAccuracy, 80),
          color: '#FFDE58',
          weight: 1,
          fillColor: '#FFDE58',
          fillOpacity: 0.12
        }).addTo(map);
      }

      clearMarkers();
      var bounds = [];
      function stopKind(role, fallback) {
        var raw = role === 'pickup' ? m.pickupKind : m.dropoffKind;
        if (raw === 'office') return 'office';
        if (raw === 'client') return 'client';
        if (raw === 'shop') return 'shop-stop';
        return fallback;
      }
      function stopLetter(kind, fallback) {
        if (kind === 'office') return 'GO';
        if (kind === 'client') return 'C';
        if (kind === 'shop-stop' || kind === 'pickup') return 'S';
        return fallback;
      }
      if (m.pickup) {
        var pickupKind = stopKind('pickup', 'pickup');
        var p = L.marker([m.pickup.lat, m.pickup.lng], {
          icon: pinIcon(pickupKind, stopLetter(pickupKind, 'P'), m.focus === 'pickup', m.pickupLabel || 'Shop'),
          title: m.pickupLabel || 'Shop',
          zIndexOffset: m.focus === 'pickup' ? 600 : 200
        }).addTo(map);
        markers.push(p);
        bounds.push([m.pickup.lat, m.pickup.lng]);
      }
      if (m.dropoff) {
        var dropKind = stopKind('dropoff', 'dropoff');
        var d = L.marker([m.dropoff.lat, m.dropoff.lng], {
          icon: pinIcon(dropKind, stopLetter(dropKind, 'D'), m.focus === 'dropoff', m.dropoffLabel || 'Client'),
          title: m.dropoffLabel || 'Client',
          zIndexOffset: m.focus === 'dropoff' ? 600 : 200
        }).addTo(map);
        markers.push(d);
        bounds.push([m.dropoff.lat, m.dropoff.lng]);
      }
      if (m.rider) {
        var r = L.marker([m.rider.lat, m.rider.lng], {
          icon: pinIcon('rider', ''),
          title: 'You',
          zIndexOffset: 800
        }).addTo(map);
        markers.push(r);
        bounds.push([m.rider.lat, m.rider.lng]);
      }

      var places = m.places || [];
      for (var i = 0; i < places.length; i++) {
        var place = places[i];
        if (!place || !isFinite(place.lat) || !isFinite(place.lng)) continue;
        var selected = Boolean(m.selectedPlaceId && place.id === m.selectedPlaceId);
        var letter = (place.name || '?').charAt(0).toUpperCase();
        var shop = L.marker([place.lat, place.lng], {
          icon: pinIcon('shop', letter, selected, selected ? (place.name || 'Shop') : ''),
          title: place.name || 'Shop'
        }).addTo(map);
        shop.on('click', (function (id) {
          return function () { notifyHost({ type: 'place', id: id }); };
        })(place.id));
        markers.push(shop);
        bounds.push([place.lat, place.lng]);
      }

      var viewKey = m.view && isFinite(m.view.lat) && isFinite(m.view.lng)
        ? m.view.lat + ',' + m.view.lng + ',' + (m.view.zoom || 15)
        : '';
      var tripKey = (m.pickup ? m.pickup.lat + ',' + m.pickup.lng : '')
        + '|' + (m.dropoff ? m.dropoff.lat + ',' + m.dropoff.lng : '')
        + '|' + ((m.routeCoordinates && m.routeCoordinates.length) || 0);
      var shouldFitTrip = Boolean(m.pickup || m.dropoff || routeLayer) && tripKey !== lastTripKey;
      if (viewKey && viewKey !== lastViewKey) {
        map.setView([m.view.lat, m.view.lng], m.view.zoom || 15);
        lastViewKey = viewKey;
        cameraReady = true;
      } else if (!cameraReady || shouldFitTrip) {
        if (routeLayer) {
          try { map.fitBounds(routeLayer.getBounds().pad(0.15)); }
          catch (e) { /* keep previous view */ }
        } else if (bounds.length >= 2) {
          map.fitBounds(bounds, { padding: [36, 36] });
        } else if (bounds.length === 1) {
          map.setView(bounds[0], 15);
        } else {
          // Davao City centre fallback so an empty model still shows a map.
          map.setView([7.1907, 125.4553], 12);
        }
        lastTripKey = tripKey;
        cameraReady = true;
      }
    }

    applyModel(MODEL);

    // Host can push updates without full HTML reload.
    document.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
    window.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
  </script>
</body>
</html>`;
}
