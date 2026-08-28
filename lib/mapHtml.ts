/**
 * Leaflet map HTML for a react-native-webview.
 *
 * Uses OpenStreetMap raster tiles (light) and Carto dark tiles (night).
 * Attribution is a licence condition — always visible.
 *
 * Injected via template so the host can update route, rider position, and
 * theme without reloading the whole document when possible.
 */

import type { LatLng, LonLat } from "@/lib/geo";

export type MapTheme = "light" | "dark";

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
  /** GeoJSON LineString coordinates [lon, lat][]. */
  routeCoordinates: LonLat[];
  /** Route stroke — design system actionYellow. */
  routeColor: string;
  rider: LatLng | null;
  /** When true, show an on-map note that routing failed. */
  routeUnavailable: boolean;
  /**
   * Supplier / shop pins for the city Map tab. Absent on trip maps.
   * A later live directory fills the same shape.
   */
  places?: readonly MapPlace[] | null;
  selectedPlaceId?: string | null;
  /** When set, the camera goes here instead of fitting markers. */
  view?: MapView | null;
};

const LIGHT_TILES =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

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
      font: 700 11px/1 system-ui, sans-serif;
      border: 2px solid #1a1a1a;
      box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    }
    .pin-pickup .pin-mark {
      background: #FFDE58; color: #1a1a1a;
      border-radius: 4px; /* square — pickup */
    }
    .pin-dropoff .pin-mark {
      background: #F0F0F0; color: #1a1a1a;
      border-radius: 999px; /* circle — drop-off */
    }
    .pin-rider .pin-mark {
      width: 16px; height: 16px; border-radius: 999px;
      background: #1565C0; border: 3px solid #fff;
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
    .route-banner {
      position: absolute; top: 8px; left: 8px; right: 8px; z-index: 1000;
      padding: 6px 10px; border-radius: 8px;
      font: 600 12px/1.3 system-ui, sans-serif;
      background: rgba(255,255,255,0.95); color: #1a1a1a;
      border: 1px solid #dcdcdc;
      display: none;
    }
    .dark-attr .route-banner {
      background: rgba(20,20,20,0.95); color: #f0f0f0; border-color: #2e2e2e;
    }
    .route-banner.show { display: block; }
  </style>
</head>
<body>
  <div id="route-banner" class="route-banner" role="status">Route unavailable — straight line shown</div>
  <div id="map"></div>
  <script>
    var MODEL = ${safe};
    var map = null;
    var tileLayer = null;
    var routeLayer = null;
    var markers = [];
    var cameraReady = false;
    var lastViewKey = '';
    var lastTripKey = '';

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
      var cls = kind === 'pickup' ? 'pin-pickup'
        : kind === 'rider' ? 'pin-rider'
        : kind === 'shop' ? 'pin-shop'
        : 'pin-dropoff';
      if (selected) cls += ' is-selected';
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

      if (tileLayer) map.removeLayer(tileLayer);
      var url = isDark ? ${JSON.stringify(DARK_TILES)} : ${JSON.stringify(LIGHT_TILES)};
      var attr = isDark
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      tileLayer = L.tileLayer(url, {
        maxZoom: 19,
        attribution: attr
      }).addTo(map);

      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = null;
      if (m.routeCoordinates && m.routeCoordinates.length >= 2) {
        // GeoJSON is [lon, lat]; Leaflet latLng expects [lat, lon].
        var latlngs = m.routeCoordinates.map(function (c) {
          return [c[1], c[0]];
        });
        routeLayer = L.polyline(latlngs, {
          color: m.routeColor || '#FFDE58',
          weight: 5,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(map);
      }

      clearMarkers();
      var bounds = [];
      if (m.pickup) {
        var p = L.marker([m.pickup.lat, m.pickup.lng], {
          icon: pinIcon('pickup', 'P'),
          title: m.pickupLabel || 'Pickup'
        }).addTo(map);
        markers.push(p);
        bounds.push([m.pickup.lat, m.pickup.lng]);
      }
      if (m.dropoff) {
        var d = L.marker([m.dropoff.lat, m.dropoff.lng], {
          icon: pinIcon('dropoff', 'D'),
          title: m.dropoffLabel || 'Drop-off'
        }).addTo(map);
        markers.push(d);
        bounds.push([m.dropoff.lat, m.dropoff.lng]);
      }
      if (m.rider) {
        var r = L.marker([m.rider.lat, m.rider.lng], {
          icon: pinIcon('rider', ''),
          title: 'You'
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
