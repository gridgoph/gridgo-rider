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
  /** When true, show an on-map note that routing failed. */
  routeUnavailable: boolean;
  /**
   * Supplier / shop pins for the city Map tab. Absent on trip maps.
   */
  places?: readonly MapPlace[] | null;
  selectedPlaceId?: string | null;
  /** When set, the camera goes here instead of fitting markers. */
  view?: MapView | null;
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
      font-size: 10px !important;
      background: rgba(255,255,255,0.85) !important;
      color: #1a1a1a !important;
      max-width: 70%;
    }
    .dark-attr .leaflet-control-attribution {
      background: rgba(20,20,20,0.9) !important;
      color: #f0f0f0 !important;
    }
    .pin {
      display: flex; flex-direction: column; align-items: center;
      transform: translateY(-4px);
    }
    .pin-mark {
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      font: 700 10px/1 "IBM Plex Sans", system-ui, sans-serif;
      letter-spacing: 0.04em;
      border: 2px solid #1a1a1a;
      box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    }
    .pin-pickup .pin-mark, .pin-shop-stop .pin-mark {
      background: #FFDE58; color: #1a1a1a;
      border-radius: 3px;
    }
    .pin-dropoff .pin-mark, .pin-client .pin-mark {
      background: #F0F0F0; color: #1a1a1a;
      border-radius: 999px;
    }
    .pin-office .pin-mark {
      background: #1a1a1a; color: #FFDE58;
      border: 2px solid #FFDE58;
      border-radius: 3px;
    }
    .pin.is-focus .pin-mark {
      box-shadow: 0 0 0 3px #FFDE58, 0 1px 3px rgba(0,0,0,0.35);
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
    }
    /* Teardrop — a pin, not a plate. Head is the circle; tip is the diamond. */
    .pin-shop { width: 32px; }
    .pin-shop .pin-head {
      width: 30px; height: 30px; border-radius: 999px;
      background: #FFDE58; color: #1a1a1a;
      border: 2px solid #1a1a1a;
      display: flex; align-items: center; justify-content: center;
      font: 700 12px/1 system-ui, sans-serif;
      position: relative; z-index: 1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    }
    .pin-shop .pin-tip {
      width: 12px; height: 12px;
      background: #FFDE58;
      border-right: 2px solid #1a1a1a;
      border-bottom: 2px solid #1a1a1a;
      transform: translateY(-7px) rotate(45deg);
    }
    .pin-shop.is-selected .pin-head {
      box-shadow: 0 0 0 3px #ffffff, 0 1px 3px rgba(0,0,0,0.35);
    }
    .pin-label {
      margin-top: 2px; padding: 1px 4px;
      font: 600 9px/1.2 system-ui, sans-serif;
      background: rgba(255,255,255,0.92); color: #1a1a1a;
      border-radius: 3px; white-space: nowrap;
      max-width: 90px; overflow: hidden; text-overflow: ellipsis;
    }
    .dark-attr .pin-label {
      background: rgba(20,20,20,0.92); color: #f0f0f0;
    }
    .route-banner, .nav-chip {
      position: absolute; left: 8px; right: 8px; z-index: 1000;
      padding: 7px 10px; border-radius: 2px;
      font: 600 12px/1.3 "IBM Plex Sans", system-ui, sans-serif;
      display: none;
    }
    .nav-chip {
      top: 8px;
      background: #FFDE58; color: #1a1a1a;
      border: 1px solid #1a1a1a;
      box-shadow: 0 2px 0 #1a1a1a;
    }
    .nav-chip .kicker {
      font: 700 10px/1 "IBM Plex Sans", system-ui, sans-serif;
      letter-spacing: 0.12em;
    }
    .nav-chip .line { margin-top: 2px; font-weight: 600; }
    .route-banner {
      top: 8px;
      background: rgba(255,255,255,0.95); color: #1a1a1a;
      border: 1px solid #dcdcdc;
    }
    .dark-attr .route-banner {
      background: rgba(20,20,20,0.95); color: #f0f0f0; border-color: #2e2e2e;
    }
    .route-banner.show, .nav-chip.show { display: block; }
    .nav-chip.show + .route-banner.show { top: 58px; }
  </style>
</head>
<body>
  <div id="nav-chip" class="nav-chip" role="status">
    <div class="kicker" id="nav-kicker"></div>
    <div class="line" id="nav-line"></div>
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

    function pinIcon(kind, shortLabel, selected, longLabel) {
      var cls = kind === 'pickup' || kind === 'shop-stop' ? 'pin-pickup'
        : kind === 'rider' ? 'pin-rider'
        : kind === 'shop' ? 'pin-shop'
        : kind === 'office' ? 'pin-office'
        : 'pin-dropoff';
      if (kind === 'shop-stop') cls += ' pin-shop-stop';
      if (kind === 'client') cls += ' pin-client';
      if (selected) cls += ' is-selected is-focus';
      var mark = kind === 'rider' ? '' : escapeHtml(shortLabel);
      var caption = longLabel === '' ? '' : (longLabel || shortLabel);
      var labelHtml = kind === 'rider' || !caption
        ? ''
        : '<div class="pin-label">' + escapeHtml(caption) + '</div>';
      if (kind === 'shop') {
        return L.divIcon({
          className: '',
          html: '<div class="pin pin-shop' + (selected ? ' is-selected' : '') + '">'
            + '<div class="pin-head">' + mark + '</div>'
            + '<div class="pin-tip"></div>'
            + labelHtml
            + '</div>',
          iconSize: [32, 44],
          iconAnchor: [16, 40]
        });
      }
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
      return L.divIcon({
        className: '',
        html: '<div class="pin ' + cls + '"><div class="pin-mark">' + mark + '</div>' + labelHtml + '</div>',
        iconSize: [40, 44],
        iconAnchor: [20, 36]
      });
    }

    function applyModel(m) {
      MODEL = m;
      var isDark = m.theme === 'dark';
      document.body.className = isDark ? 'dark-attr' : '';
      document.getElementById('route-banner').className =
        'route-banner' + (m.routeUnavailable ? ' show' : '');

      if (!map) {
        map = L.map('map', {
          zoomControl: false,
          attributionControl: true
        });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
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

      var chip = document.getElementById('nav-chip');
      var kicker = document.getElementById('nav-kicker');
      var line = document.getElementById('nav-line');
      if (m.navTitle) {
        kicker.textContent = m.navTitle;
        line.textContent = m.navSummary || '';
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
