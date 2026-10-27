// Endereço do ponto marcado no mapa (logradouro, número e bairro), pelo
// Nominatim do OpenStreetMap. Só a coordenada vai na consulta. Em Imperatriz
// muitos lotes não têm número no OSM: nesse caso o número vem vazio.
// Política de uso do Nominatim: no máximo 1 consulta por segundo e com
// atribuição (dados © colaboradores do OpenStreetMap).

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

/** Resposta do Nominatim -> { logradouro, numero, bairro } (campos vazios = ''). */
export function extrairEndereco(resposta) {
  const a = resposta?.address ?? {};
  const logradouro = a.road || a.pedestrian || a.footway || a.path || a.square || a.residential || '';
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.hamlet || a.village || '';
  return {
    logradouro: String(logradouro).trim(),
    numero: String(a.house_number ?? '').trim(),
    bairro: String(bairro).trim(),
  };
}

let ultima = 0;

/** Consulta o endereço do ponto. Devolve null se não achar ou se a rede falhar. */
export async function enderecoDoPonto(latitude, longitude, { signal } = {}) {
  // respeita 1 consulta por segundo
  const espera = 1000 - (Date.now() - ultima);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  if (signal?.aborted) return null;
  ultima = Date.now();
  const url = `${URL_NOMINATIM}?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt-BR&lat=${latitude}&lon=${longitude}`;
  try {
    const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const json = await r.json();
    if (json?.error) return null;
    return extrairEndereco(json);
  } catch {
    return null;
  }
}
