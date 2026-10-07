import { en, type TranslationKey } from "./en";

// Armada Control can now follow Steam/Decky's Spanish locale. Untranslated
// sections retain the established English fallback while the complete virtual
// trackpad menu is presented in Spanish.
export const es: Record<TranslationKey, string> = {
  ...en,
  "trackpads.title": "Trackpads virtuales",
  "trackpads.master": "Trackpads virtuales",
  "trackpads.masterDescription": "Enciende o apaga el sistema de trackpads. Al apagarlo, la pantalla táctil funciona normalmente.",
  "trackpads.mode": "Modo de los trackpads",
  "trackpads.modeSimple": "Esquinas inferiores",
  "trackpads.modeCorners": "Cuatro esquinas",
  "trackpads.modeFloating": "Dinámicos al toque",
  "trackpads.modeHalves": "Pantalla dividida",
  "trackpads.modeSimpleDescription": "Un trackpad fijo en cada esquina inferior.",
  "trackpads.modeCornersDescription": "Un trackpad en cada esquina; las dos zonas de cada lado controlan el mismo pad.",
  "trackpads.modeFloatingDescription": "El primer toque en cada mitad coloca el trackpad de ese lado bajo el dedo.",
  "trackpads.modeHalvesDescription": "Las mitades invisibles izquierda y derecha se convierten en sus respectivos trackpads.",
  "trackpads.halvesInvisible": "Este modo es completamente invisible y no tiene ajustes de tamaño ni apariencia. Cada mitad de la pantalla funciona directamente como su trackpad correspondiente.",
  "trackpads.left": "Trackpad izquierdo",
  "trackpads.right": "Trackpad derecho",
  "trackpads.leftSize": "Tamaño izquierdo (%)",
  "trackpads.rightSize": "Tamaño derecho (%)",
  "trackpads.feedback": "Respuesta",
  "trackpads.tapToClick": "Toque para clic",
  "trackpads.tapToClickDescription": "Un toque corto envía el evento de presión del trackpad de Steam Deck.",
  "trackpads.limitToBounds": "Limitar al área visible",
  "trackpads.limitToBoundsDescription": "Pausa el contacto fuera del trackpad y lo reanuda cuando el mismo dedo vuelve a entrar.",
  "trackpads.hapticStrength": "Fuerza de vibración (%)",
  "trackpads.borderOpacity": "Opacidad del borde (%)",
  "trackpads.backgroundOpacity": "Opacidad del fondo punteado (%)",
  "trackpads.touchscreenNotice": "Mientras estén activos, el toque normal de la pantalla queda bloqueado fuera de las zonas de los trackpads.",
  "trackpads.deckTargetNotice": "La emulación del control de Steam Deck debe permanecer seleccionada mientras los trackpads virtuales estén activos.",
  "trackpads.selectDeckFirst": "Primero selecciona arriba la emulación de Steam Deck.",
  "trackpads.unsupported": "Los trackpads virtuales no son compatibles con este dispositivo.",
  "trackpads.saveError": "No se pudieron actualizar los trackpads virtuales",
};
