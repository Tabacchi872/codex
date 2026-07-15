import { useState } from 'react';
import type { DimensionValue, LayoutChangeEvent, ViewStyle } from 'react-native';

// Griglia a due colonne con larghezza REALE misurata via onLayout (estratta
// dalla dashboard coach, fix BUG-020, per riuso nella dashboard superadmin):
// mai percentuali combinate con minWidth/flexGrow (si sovrappongono su
// Android per arrotondamento+crescita flessibile) e mai useWindowDimensions
// (su web misurerebbe l'intera finestra del browser invece della cornice
// iPhone di WebPhoneFrame). Sotto minColumnWidth per colonna si passa a una
// sola colonna; prima della prima misurazione (un solo frame) si usa '100%'
// (una colonna, mai overflow).
//
// itemStyle azzera esplicitamente flexGrow/flexShrink/flexBasis: componenti
// come AppStatCard applicano internamente flex:1 al proprio wrapper, che
// altrimenti vincerebbe sulla width fissa (flexBasis:0% di "flex:1" ha
// priorita' sulla width in Yoga), riproducendo la sovrapposizione originale.
export function useTwoColumnGrid(gap: number, minColumnWidth = 130): {
  onLayout: (event: LayoutChangeEvent) => void;
  itemStyle: ViewStyle;
} {
  const [containerWidth, setContainerWidth] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    const measured = Math.round(event.nativeEvent.layout.width);
    setContainerWidth((current) => (measured !== current ? measured : current));
  }

  let width: DimensionValue;
  if (containerWidth <= 0) {
    width = '100%';
  } else {
    const twoColumnWidth = Math.floor((containerWidth - gap) / 2);
    width = twoColumnWidth >= minColumnWidth ? twoColumnWidth : containerWidth;
  }

  return { onLayout, itemStyle: { width, flexGrow: 0, flexShrink: 0, flexBasis: width } };
}
