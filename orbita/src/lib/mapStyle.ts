import type { MapStyleElement } from 'react-native-maps';

/** Estilo oscuro para Google Maps (Android). En iOS se usa Apple Maps en modo oscuro. */
export const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d1017' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7b8499' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1017' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1c2130' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#b3bbd0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1a17' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1f2c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#11141d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7388' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#262c3d' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#151925' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#9aa3b8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060a14' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a4358' }] },
];
