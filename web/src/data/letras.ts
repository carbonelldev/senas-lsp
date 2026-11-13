// Como se hace cada letra, descrito a partir de las fotos del dataset
// (alfabeto manual de la Lengua de Señas Peruana, LSP; dataset de Kaggle de C. R. Egoavil Huaman).
export type Letra = { letra: string; como: string; ojo?: string };

export const LETRAS: Letra[] = [
  { letra: "A", como: "Puño cerrado con el pulgar estirado pegado al lado del índice.", ojo: "En la S el pulgar cruza por delante de los dedos; aquí queda al lado." },
  { letra: "B", como: "Mano plana hacia arriba con los cuatro dedos juntos y estirados. El pulgar se dobla sobre la palma." },
  { letra: "C", como: "Curva todos los dedos y el pulgar como si sujetaras un vaso: la mano dibuja una C vista de lado." },
  { letra: "D", como: "Índice estirado hacia arriba. Los otros tres dedos se doblan y tocan la punta del pulgar." },
  { letra: "E", como: "Dobla los cuatro dedos hacia abajo, con las puntas apoyadas sobre el pulgar, que queda doblado debajo. Se ven las uñas.", ojo: "Parecida a la A, M, N, S y T: fíjate en dónde queda el pulgar." },
  { letra: "F", como: "Une la punta del índice con la del pulgar formando un círculo. Corazón, anular y meñique quedan estirados hacia arriba." },
  { letra: "G", como: "Mano de lado: índice y pulgar estirados en horizontal, paralelos, apuntando hacia un lado. El resto, cerrado.", ojo: "La H es igual pero con dos dedos (índice y corazón)." },
  { letra: "H", como: "Mano de lado: índice y corazón juntos y estirados en horizontal, apuntando hacia un lado." },
  { letra: "I", como: "Puño cerrado con solo el meñique estirado hacia arriba." },
  { letra: "K", como: "Índice y corazón hacia arriba separados en V, y el pulgar estirado hacia fuera." },
  { letra: "L", como: "Índice hacia arriba y pulgar hacia el lado, formando una L. Los demás dedos, cerrados." },
  { letra: "M", como: "Puño con el pulgar escondido debajo de tres dedos (índice, corazón y anular).", ojo: "La N tapa el pulgar con solo dos dedos." },
  { letra: "N", como: "Puño con el pulgar escondido debajo de dos dedos (índice y corazón)." },
  { letra: "O", como: "Junta las puntas de todos los dedos con la del pulgar formando una O redonda." },
  { letra: "P", como: "Como la K pero con la mano girada hacia abajo: el índice apunta al suelo.", ojo: "La Q también apunta abajo, pero con índice y pulgar." },
  { letra: "Q", como: "Como la G pero apuntando hacia abajo: índice y pulgar estirados hacia el suelo." },
  { letra: "R", como: "Índice y corazón hacia arriba y cruzados, como cuando “cruzas los dedos”." },
  { letra: "S", como: "Puño cerrado con el pulgar cruzado por delante de los dedos.", ojo: "En la A el pulgar va al lado, no por delante." },
  { letra: "T", como: "Puño con la punta del pulgar asomando entre el índice y el corazón." },
  { letra: "U", como: "Índice y meñique estirados hacia arriba; corazón y anular doblados (como unos cuernos)." },
  { letra: "V", como: "Índice y corazón estirados y separados formando una V. El resto, cerrado." },
  { letra: "W", como: "Índice, corazón y anular estirados y separados. El pulgar sujeta el meñique." },
  { letra: "X", como: "Puño con el índice levantado y doblado en forma de gancho." },
  { letra: "Y", como: "Pulgar y meñique estirados hacia los lados; los otros tres dedos, cerrados." },
];

export const EN_MOVIMIENTO = [
  { letra: "J", como: "Se hace con movimiento, así que no entra en un dataset de fotos fijas." },
  { letra: "Ñ", como: "Se hace con movimiento, así que no entra en un dataset de fotos fijas." },
  { letra: "Z", como: "Se hace con movimiento, así que no entra en un dataset de fotos fijas." },
];
